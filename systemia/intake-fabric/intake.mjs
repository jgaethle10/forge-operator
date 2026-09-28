import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { EvercraftPassport } from '../passport/passport.mjs';

const SOURCE_TYPES = new Set([
  'email',
  'form',
  'upload',
  'api',
  'agent',
  'sensor',
  'field',
  'webhook',
  'chat',
]);

const TRUST_STATES = new Set([
  'untrusted_external',
  'authenticated_external',
  'trusted_internal',
  'device_attested',
]);

const TERMINAL_DECISIONS = new Set(['accept', 'reject']);
const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.dll', '.msi', '.bat', '.cmd', '.com', '.scr',
  '.ps1', '.sh', '.js', '.jar', '.app', '.dmg', '.pkg',
]);
const DANGEROUS_MIME = new Set([
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-sh',
  'application/x-shellscript',
  'application/java-archive',
]);

const LOCK_STALE_MS = 30_000;
const LOCK_TIMEOUT_MS = 5_000;
const LOCK_POLL_MS = 10;
const waitBuffer = new Int32Array(new SharedArrayBuffer(4));

const sha256 = (value) =>
  'sha256:' +
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');

function stableReceipt(body) {
  return { ...body, receipt_hash: sha256(body) };
}

function requiredString(value, field) {
  const text = String(value || '').trim();
  if (!text) throw new Error(field + '_required');
  return text;
}

function optionalString(value) {
  const text = String(value || '').trim();
  return text || null;
}

function iso(value, field) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(field + '_invalid');
  return date.toISOString();
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function appendJsonl(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.appendFileSync(file, JSON.stringify(value) + '\n', { mode: 0o600 });
}

function sleep(ms) {
  Atomics.wait(waitBuffer, 0, 0, ms);
}

function sourceType(value) {
  const type = requiredString(value, 'source_type').toLowerCase();
  if (!SOURCE_TYPES.has(type)) throw new Error('source_type_invalid');
  return type;
}

function trustState(value) {
  const state = requiredString(value, 'source_trust_state').toLowerCase();
  if (!TRUST_STATES.has(state)) throw new Error('source_trust_state_invalid');
  return state;
}

function normalizeAttachments(values = []) {
  if (!Array.isArray(values)) throw new Error('attachments_invalid');
  return values.slice(0, 100).map((entry, index) => {
    const name = optionalString(entry?.name);
    const mime = optionalString(entry?.mime_type)?.toLowerCase() || null;
    const contentRef = requiredString(entry?.content_ref, 'attachments[' + index + '].content_ref');
    const contentSha256 = optionalString(entry?.content_sha256);
    if (contentSha256 && !/^sha256:[a-f0-9]{64}$/i.test(contentSha256)) {
      throw new Error('attachment_content_sha256_invalid');
    }

    const extension = name ? path.extname(name).toLowerCase() : '';
    const riskFlags = [];
    if (DANGEROUS_EXTENSIONS.has(extension)) riskFlags.push('executable_extension');
    if (mime && DANGEROUS_MIME.has(mime)) riskFlags.push('executable_mime');

    return {
      name,
      mime_type: mime,
      content_ref: contentRef,
      content_sha256: contentSha256,
      byte_size: Number.isFinite(Number(entry?.byte_size))
        ? Math.max(0, Number(entry.byte_size))
        : null,
      risk_flags: [...new Set(riskFlags)].sort(),
      bytes_stored_in_intake: false,
    };
  });
}

function boundedExcerpt(value, max = 2000) {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.slice(0, max);
}

function dedupeKey({ sourceType, sourceRef, externalEventId, contentFingerprint }) {
  return externalEventId
    ? sha256(['event', sourceType, sourceRef, externalEventId].join('|'))
    : sha256(['content', sourceType, sourceRef, contentFingerprint].join('|'));
}

export class EvercraftIntakeFabric {
  constructor({ stateDir, passportStateDir } = {}) {
    if (!stateDir) throw new Error('intake_fabric_state_dir_required');
    if (!passportStateDir) throw new Error('passport_state_dir_required');

    this.stateDir = path.resolve(stateDir);
    this.candidatesFile = path.join(this.stateDir, 'candidates.jsonl');
    this.decisionsFile = path.join(this.stateDir, 'admission-decisions.jsonl');
    this.quarantineReleasesFile = path.join(this.stateDir, 'quarantine-releases.jsonl');
    this.lockDir = path.join(this.stateDir, '.mutation-lock');
    this.passport = new EvercraftPassport({ stateDir: passportStateDir });

    this.candidates = new Map();
    this.ingestIdempotency = new Map();
    this.dedupe = new Map();
    this.decisions = new Map();
    this.decisionIdempotency = new Map();
    this.quarantineReleases = new Map();
    this.quarantineReleaseIdempotency = new Map();
    this.#reload();
  }

  #reload() {
    this.candidates.clear();
    this.ingestIdempotency.clear();
    this.dedupe.clear();
    this.decisions.clear();
    this.decisionIdempotency.clear();
    this.quarantineReleases.clear();
    this.quarantineReleaseIdempotency.clear();

    for (const candidate of readJsonl(this.candidatesFile)) {
      this.candidates.set(candidate.candidate_id, candidate);
      this.ingestIdempotency.set(candidate.idempotency_key, candidate);
      this.dedupe.set(candidate.dedupe_key, candidate.candidate_id);
    }
    for (const decision of readJsonl(this.decisionsFile)) {
      const history = this.decisions.get(decision.candidate_id) || [];
      history.push(decision);
      this.decisions.set(decision.candidate_id, history);
      this.decisionIdempotency.set(decision.idempotency_key, decision);
    }
    for (const release of readJsonl(this.quarantineReleasesFile)) {
      this.quarantineReleases.set(release.candidate_id, release);
      this.quarantineReleaseIdempotency.set(release.idempotency_key, release);
    }
  }

  #acquireLock() {
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        fs.mkdirSync(this.lockDir, { mode: 0o700 });
        fs.writeFileSync(
          path.join(this.lockDir, 'owner.json'),
          JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() }) + '\n',
          { mode: 0o600 }
        );
        return;
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        try {
          const stat = fs.statSync(this.lockDir);
          if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
            fs.rmSync(this.lockDir, { recursive: true, force: true });
            continue;
          }
        } catch (statError) {
          if (statError?.code !== 'ENOENT') throw statError;
        }
        sleep(LOCK_POLL_MS);
      }
    }
    throw new Error('intake_fabric_mutation_lock_timeout');
  }

  #releaseLock() {
    fs.rmSync(this.lockDir, { recursive: true, force: true });
  }

  #mutate(fn) {
    this.#acquireLock();
    try {
      this.#reload();
      return fn();
    } finally {
      this.#releaseLock();
    }
  }

  #authorizeAdapter(actorRef, type, at) {
    return this.passport.authorize({
      subject_ref: actorRef,
      product: 'evercraft-intake',
      scope: 'intake.write.' + type,
      at,
    });
  }

  #latestDecision(candidateId) {
    return (this.decisions.get(candidateId) || []).at(-1) || null;
  }

  #isQuarantined(candidate) {
    return candidate.quarantine_required === true &&
      !this.quarantineReleases.has(candidate.candidate_id);
  }

  ingest(input) {
    return this.#mutate(() => {
      const idempotencyKey = requiredString(input?.idempotency_key, 'idempotency_key');
      const duplicateByOperation = this.ingestIdempotency.get(idempotencyKey);
      if (duplicateByOperation) {
        return {
          state: 'duplicate',
          candidate: duplicateByOperation,
          receipt: stableReceipt({
            schema: 'evercraft.intake.ingest-receipt.v1',
            state: 'duplicate',
            candidate_id: duplicateByOperation.candidate_id,
            idempotency_key: idempotencyKey,
          }),
        };
      }

      const type = sourceType(input?.source_type);
      const adapterActorRef = requiredString(input?.adapter_actor_ref, 'adapter_actor_ref');
      const receivedAt = iso(input?.received_at || new Date().toISOString(), 'received_at');
      const adapterAuthorization = this.#authorizeAdapter(adapterActorRef, type, receivedAt);
      if (adapterAuthorization.decision !== 'allow') {
        throw new Error('intake_adapter_not_authorized');
      }

      const sourceRef = requiredString(input?.source_ref, 'source_ref');
      const contentRef = requiredString(input?.content_ref, 'content_ref');
      const contentFingerprint = requiredString(
        input?.content_fingerprint,
        'content_fingerprint'
      ).toLowerCase();
      if (!/^sha256:[a-f0-9]{64}$/.test(contentFingerprint)) {
        throw new Error('content_fingerprint_invalid');
      }

      const externalEventId = optionalString(input?.external_event_id);
      const candidateDedupeKey = dedupeKey({
        sourceType: type,
        sourceRef,
        externalEventId,
        contentFingerprint,
      });
      const duplicateCandidateId = this.dedupe.get(candidateDedupeKey);
      if (duplicateCandidateId) {
        const candidate = this.candidates.get(duplicateCandidateId);
        return {
          state: 'deduplicated',
          candidate,
          receipt: stableReceipt({
            schema: 'evercraft.intake.ingest-receipt.v1',
            state: 'deduplicated',
            candidate_id: candidate.candidate_id,
            dedupe_key: candidateDedupeKey,
          }),
        };
      }

      const attachments = normalizeAttachments(input?.attachments || []);
      const riskFlags = new Set(
        (Array.isArray(input?.adapter_risk_flags) ? input.adapter_risk_flags : [])
          .map((flag) => String(flag || '').trim().toLowerCase())
          .filter(Boolean)
      );
      for (const attachment of attachments) {
        for (const flag of attachment.risk_flags) riskFlags.add(flag);
      }

      const trust = trustState(input?.source_trust_state || 'untrusted_external');
      if (trust === 'untrusted_external' && attachments.length > 0) {
        riskFlags.add('untrusted_attachments');
      }

      const quarantineRequired = riskFlags.has('executable_extension') ||
        riskFlags.has('executable_mime') ||
        riskFlags.has('malware_suspected') ||
        riskFlags.has('active_content_suspected');

      const candidate = stableReceipt({
        schema: 'evercraft.intake.mission-candidate.v1',
        candidate_id: input?.candidate_id
          ? requiredString(input.candidate_id, 'candidate_id')
          : 'candidate_' + randomUUID(),
        idempotency_key: idempotencyKey,
        dedupe_key: candidateDedupeKey,
        adapter_actor_ref: adapterActorRef,
        adapter_authority_grant_id: adapterAuthorization.grant_id,
        source_type: type,
        source_ref: sourceRef,
        external_event_id: externalEventId,
        source_trust_state: trust,
        source_identity: {
          claimed_ref: optionalString(input?.claimed_source_identity_ref),
          verified_ref: optionalString(input?.verified_source_identity_ref),
          verification_evidence_ref: optionalString(input?.identity_evidence_ref),
          identity_verified_for_routing: Boolean(
            input?.verified_source_identity_ref && input?.identity_evidence_ref
          ),
          execution_authority_derived: false,
        },
        content_ref: contentRef,
        content_fingerprint: contentFingerprint,
        intent_excerpt: boundedExcerpt(input?.intent_excerpt),
        requested_capability_hints: (Array.isArray(input?.requested_capability_hints)
          ? input.requested_capability_hints
          : [])
          .map((value) => String(value || '').trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 50),
        claimed_priority: optionalString(input?.claimed_priority),
        admitted_priority: null,
        attachments,
        risk_flags: [...riskFlags].sort(),
        quarantine_required: quarantineRequired,
        quarantine_released: false,
        admission_state: quarantineRequired ? 'quarantined_candidate' : 'candidate_only',
        execution_authority_granted: false,
        external_side_effects_authorized: false,
        payload_authority_claims_ignored: true,
        content_is_instruction: false,
        source_content_may_be_untrusted: trust !== 'trusted_internal',
        raw_payload_stored_in_intake: false,
        received_at: receivedAt,
      });

      this.candidates.set(candidate.candidate_id, candidate);
      this.ingestIdempotency.set(idempotencyKey, candidate);
      this.dedupe.set(candidateDedupeKey, candidate.candidate_id);
      appendJsonl(this.candidatesFile, candidate);

      return {
        state: candidate.admission_state,
        candidate,
        receipt: stableReceipt({
          schema: 'evercraft.intake.ingest-receipt.v1',
          state: candidate.admission_state,
          candidate_id: candidate.candidate_id,
          dedupe_key: candidateDedupeKey,
          quarantine_required: quarantineRequired,
          execution_authority_granted: false,
        }),
      };
    });
  }

  releaseQuarantine(input) {
    return this.#mutate(() => {
      const idempotencyKey = requiredString(input?.idempotency_key, 'idempotency_key');
      const duplicate = this.quarantineReleaseIdempotency.get(idempotencyKey);
      if (duplicate) {
        return { state: 'duplicate', release: duplicate };
      }

      const candidateId = requiredString(input?.candidate_id, 'candidate_id');
      const candidate = this.candidates.get(candidateId);
      if (!candidate) throw new Error('candidate_not_found');
      if (!candidate.quarantine_required) throw new Error('candidate_not_quarantined');
      if (this.quarantineReleases.has(candidateId)) throw new Error('quarantine_already_released');

      const actorRef = requiredString(input?.actor_ref, 'actor_ref');
      const releasedAt = iso(input?.released_at || new Date().toISOString(), 'released_at');
      const auth = this.passport.authorize({
        subject_ref: actorRef,
        product: 'evercraft-intake',
        scope: 'intake.quarantine.release',
        resource_ref: candidateId,
        at: releasedAt,
      });
      if (auth.decision !== 'allow') throw new Error('quarantine_release_not_authorized');

      const release = stableReceipt({
        schema: 'evercraft.intake.quarantine-release.v1',
        release_id: 'release_' + randomUUID(),
        idempotency_key: idempotencyKey,
        candidate_id: candidateId,
        actor_ref: actorRef,
        authority_grant_id: auth.grant_id,
        evidence_ref: requiredString(input?.evidence_ref, 'evidence_ref'),
        reason: requiredString(input?.reason, 'reason'),
        released_at: releasedAt,
      });

      this.quarantineReleases.set(candidateId, release);
      this.quarantineReleaseIdempotency.set(idempotencyKey, release);
      appendJsonl(this.quarantineReleasesFile, release);

      return { state: 'released', release };
    });
  }

  decideAdmission(input) {
    return this.#mutate(() => {
      const idempotencyKey = requiredString(input?.idempotency_key, 'idempotency_key');
      const duplicate = this.decisionIdempotency.get(idempotencyKey);
      if (duplicate) return { state: 'duplicate', decision: duplicate };

      const candidateId = requiredString(input?.candidate_id, 'candidate_id');
      const candidate = this.candidates.get(candidateId);
      if (!candidate) throw new Error('candidate_not_found');

      const prior = this.#latestDecision(candidateId);
      if (prior && TERMINAL_DECISIONS.has(prior.decision)) {
        throw new Error('candidate_admission_terminal');
      }

      const decision = requiredString(input?.decision, 'decision').toLowerCase();
      if (!['accept', 'hold', 'reject'].includes(decision)) {
        throw new Error('admission_decision_invalid');
      }
      if (decision === 'accept' && this.#isQuarantined(candidate)) {
        throw new Error('candidate_quarantined');
      }

      const actorRef = requiredString(input?.actor_ref, 'actor_ref');
      const decidedAt = iso(input?.decided_at || new Date().toISOString(), 'decided_at');
      const auth = this.passport.authorize({
        subject_ref: actorRef,
        product: 'evercraft-intake',
        scope: 'intake.admit',
        resource_ref: candidateId,
        at: decidedAt,
      });
      if (auth.decision !== 'allow') throw new Error('intake_admission_not_authorized');

      const missionRef = decision === 'accept'
        ? requiredString(input?.mission_ref, 'mission_ref')
        : optionalString(input?.mission_ref);

      const event = stableReceipt({
        schema: 'evercraft.intake.admission-decision.v1',
        decision_id: 'decision_' + randomUUID(),
        idempotency_key: idempotencyKey,
        candidate_id: candidateId,
        decision,
        actor_ref: actorRef,
        authority_grant_id: auth.grant_id,
        mission_ref: missionRef,
        admitted_priority: optionalString(input?.admitted_priority),
        reason: requiredString(input?.reason, 'reason'),
        evidence_ref: requiredString(input?.evidence_ref, 'evidence_ref'),
        execution_authority_granted: false,
        external_side_effects_authorized: false,
        decided_at: decidedAt,
      });

      const history = this.decisions.get(candidateId) || [];
      history.push(event);
      this.decisions.set(candidateId, history);
      this.decisionIdempotency.set(idempotencyKey, event);
      appendJsonl(this.decisionsFile, event);

      return { state: decision, decision: event };
    });
  }

  buildSystemiaAdmissionPacket(candidateId, { actor_ref, at = new Date().toISOString() } = {}) {
    this.#reload();
    const id = requiredString(candidateId, 'candidate_id');
    const candidate = this.candidates.get(id);
    if (!candidate) throw new Error('candidate_not_found');
    const instant = iso(at, 'at');
    const actorRef = requiredString(actor_ref, 'actor_ref');
    const readAuth = this.passport.authorize({
      subject_ref: actorRef,
      product: 'evercraft-intake',
      scope: 'intake.read',
      resource_ref: id,
      at: instant,
    });
    if (readAuth.decision !== 'allow') throw new Error('intake_read_not_authorized');

    const decision = this.#latestDecision(id);
    if (!decision || decision.decision !== 'accept') {
      throw new Error('candidate_not_accepted');
    }

    return stableReceipt({
      schema: 'evercraft.intake.systemia-admission-packet.v1',
      candidate_id: id,
      mission_ref: decision.mission_ref,
      source_type: candidate.source_type,
      source_ref: candidate.source_ref,
      content_ref: candidate.content_ref,
      content_fingerprint: candidate.content_fingerprint,
      intent_excerpt: candidate.intent_excerpt,
      requested_capability_hints: candidate.requested_capability_hints,
      source_trust_state: candidate.source_trust_state,
      source_identity: candidate.source_identity,
      attachments: candidate.attachments,
      risk_flags: candidate.risk_flags,
      admission_decision_receipt: decision.receipt_hash,
      admission_evidence_ref: decision.evidence_ref,
      admitted_priority: decision.admitted_priority,
      execution_authority_granted: false,
      external_side_effects_authorized: false,
      payload_authority_claims_ignored: true,
      content_is_instruction: false,
      next_boundary:
        'Systemia may plan or route this accepted mission candidate, but any consequential execution still requires the relevant Passport/Execution Gate authority.',
    });
  }

  getCandidate(candidateId, { actor_ref, at = new Date().toISOString() } = {}) {
    this.#reload();
    const id = requiredString(candidateId, 'candidate_id');
    const candidate = this.candidates.get(id);
    if (!candidate) return null;
    const instant = iso(at, 'at');
    const actorRef = requiredString(actor_ref, 'actor_ref');
    const readAuth = this.passport.authorize({
      subject_ref: actorRef,
      product: 'evercraft-intake',
      scope: 'intake.read',
      resource_ref: id,
      at: instant,
    });
    if (readAuth.decision !== 'allow') return null;

    return {
      ...candidate,
      quarantine_released: this.quarantineReleases.has(id),
      latest_admission_decision: this.#latestDecision(id),
    };
  }
}
