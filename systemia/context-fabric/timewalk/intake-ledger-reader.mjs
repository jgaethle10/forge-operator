import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Mirrors the explicit source construction in intake-fabric/intake.mjs.
// Only Intake's three fixed source files, never arbitrary paths or endpoints.
const CANDIDATE = 'evercraft.intake.mission-candidate.v1';
const DECISION = 'evercraft.intake.admission-decision.v1';
const RELEASE = 'evercraft.intake.quarantine-release.v1';
const RELEASE_FILE = 'quarantine-releases.jsonl';
const PACKET = 'evercraft.intake.systemia-admission-packet.v1';
const HASH = /^sha256:[a-f0-9]{64}$/;
const FILES = [
  ['candidates.jsonl', CANDIDATE],
  ['admission-decisions.jsonl', DECISION],
];
const MAX_BYTES = 16 * 1024 * 1024;
const MAX_EVENTS = 20000;
const NEXT_BOUNDARY =
  'Systemia may plan or route this accepted mission candidate, but any consequential execution still requires the relevant Passport/Execution Gate authority.';

function hashBody(body) {
  return 'sha256:' + createHash('sha256').update(JSON.stringify(body)).digest('hex');
}
function seal(body) {
  return { ...body, receipt_hash: hashBody(body) };
}
function requireCap(value, maximum, name) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error('timewalk_intake_' + name + '_invalid');
  }
}
function readCompletePrivateJsonl(root, filename, schema, max_bytes, max_events, optionalMissing = false) {
  const file = path.join(root, filename);
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    // Native Intake does not create the quarantine ledger before its first
    // release. Absence never gives permission to replay a quarantined record.
    if (optionalMissing && error?.code === 'ENOENT') return [];
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 ||
      stat.size > max_bytes ||
      (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)) {
    throw new Error('timewalk_intake_source_file_not_private_regular');
  }
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  let body;
  try {
    const before = fs.fstatSync(fd);
    if (!before.isFile() || before.ino !== stat.ino || before.size !== stat.size) {
      throw new Error('timewalk_intake_source_changed_during_read');
    }
    body = fs.readFileSync(fd, 'utf8');
    const after = fs.fstatSync(fd);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs ||
        Buffer.byteLength(body, 'utf8') !== before.size || !body.endsWith('\n')) {
      throw new Error('timewalk_intake_source_incomplete_snapshot');
    }
  } finally {
    fs.closeSync(fd);
  }
  const lines = body.slice(0, -1).split('\n');
  if (lines.length > max_events || lines.some((line) => !line)) {
    throw new Error('timewalk_intake_source_event_limit_or_blank_line');
  }
  const entries = [];
  for (const line of lines) {
    let event;
    try { event = JSON.parse(line); }
    catch { throw new Error('timewalk_intake_source_invalid_json'); }
    if (!event || typeof event !== 'object' || Array.isArray(event) ||
        event.schema !== schema || !HASH.test(event.receipt_hash || '')) {
      throw new Error('timewalk_intake_source_schema_or_hash_invalid');
    }
    const { receipt_hash: _ignored, ...unsigned } = event;
    if (hashBody(unsigned) !== event.receipt_hash) {
      throw new Error('timewalk_intake_source_receipt_integrity_failure');
    }
    entries.push(event);
  }
  return entries;
}

function reconstructAdmissionPacket(candidate, decision) {
  return seal({
    schema: PACKET,
    candidate_id: candidate.candidate_id,
    mission_ref: decision.mission_ref,
    admitted_at: decision.decided_at,
    source_received_at: candidate.received_at,
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
    next_boundary: NEXT_BOUNDARY,
  });
}

/**
 * Read-only, operator-owned snapshot of Intake's three persisted source ledgers.
 *
 * A Systemia admission packet is not itself written into these ledgers:
 * it is reconstructed exactly from signed candidate and signed accepted
 * decision bytes, with a separately validated quarantine-release gate. Only the returned digest-matched packet is usable by the
 * existing authorized Context source reconciler.
 *
 * An operator must enforce current Passport identity before exposing this
 * reader. Do not make it a public callable endpoint or trust a client-
 * supplied state directory. A self-consistently rewritten source is NOT
 * authenticated origin; no new execution or external-contact authority.
 */
export function createIntakeAdmissionLedgerReceiptReader({
  state_dir, max_bytes = MAX_BYTES, max_events = MAX_EVENTS,
} = {}) {
  if (typeof state_dir !== 'string' || !path.isAbsolute(state_dir) ||
      !state_dir.trim()) {
    throw new Error('timewalk_intake_absolute_state_dir_required');
  }
  requireCap(max_bytes, MAX_BYTES, 'max_bytes');
  requireCap(max_events, MAX_EVENTS, 'max_events');
  const root = path.resolve(state_dir);
  let index = null;
  function load() {
    if (index) return index;
    const stat = fs.lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink() ||
        fs.realpathSync(root) !== root ||
        (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)) {
      throw new Error('timewalk_intake_source_directory_untrusted');
    }
    const [candidates, decisions] = FILES.map(([name, schema]) =>
      readCompletePrivateJsonl(root, name, schema, max_bytes, max_events));
    const releases = readCompletePrivateJsonl(
      root, RELEASE_FILE, RELEASE, max_bytes, max_events, true);
    const byCandidate = new Map();
    for (const candidate of candidates) {
      const id = candidate.candidate_id;
      if (typeof id !== 'string' || !id || byCandidate.has(id)) {
        throw new Error('timewalk_intake_duplicate_or_missing_candidate_id');
      }
      byCandidate.set(id, candidate);
    }
    const lastDecision = new Map();
    const seenDecisionId = new Set();
    for (const decision of decisions) {
      if (typeof decision.decision_id !== 'string' || !decision.decision_id ||
          seenDecisionId.has(decision.decision_id) ||
          !byCandidate.has(decision.candidate_id)) {
        throw new Error('timewalk_intake_invalid_decision_lineage');
      }
      seenDecisionId.add(decision.decision_id);
      // The native Intake implementation returns the final event for a
      // candidate, using storage insertion order, not a client timestamp.
      lastDecision.set(decision.candidate_id, decision);
    }
    const byReleasedCandidate = new Map();
    const releaseIds = new Set();
    for (const release of releases) {
      const candidate = byCandidate.get(release.candidate_id);
      if (!candidate || candidate.quarantine_required !== true ||
          typeof release.release_id !== 'string' || !release.release_id ||
          releaseIds.has(release.release_id) ||
          byReleasedCandidate.has(release.candidate_id) ||
          typeof release.authority_grant_id !== 'string' || !release.authority_grant_id ||
          typeof release.actor_ref !== 'string' || !release.actor_ref ||
          typeof release.evidence_ref !== 'string' || !release.evidence_ref ||
          typeof release.reason !== 'string' || !release.reason ||
          !Number.isFinite(Date.parse(release.released_at)) ||
          !Number.isFinite(Date.parse(candidate.received_at)) ||
          Date.parse(release.released_at) < Date.parse(candidate.received_at)) {
        throw new Error('timewalk_intake_invalid_quarantine_release_lineage');
      }
      // This is only a hash-consistent release *claim*. Verifying that the
      // cited grant was actually valid requires separate Passport history.
      releaseIds.add(release.release_id);
      byReleasedCandidate.set(release.candidate_id, release);
    }
    const rebuilt = new Map();
    for (const [id, decision] of lastDecision) {
      if (decision.decision !== 'accept') continue;
      const candidate = byCandidate.get(id);
      if (candidate.quarantine_required === true) {
        const release = byReleasedCandidate.get(id);
        if (!release) continue;
        // Backdated or reordered release claims cannot make an earlier
        // acceptance look authorized. Hold, do not silently repair history.
        if (!Number.isFinite(Date.parse(decision.decided_at)) ||
            Date.parse(release.released_at) > Date.parse(decision.decided_at)) {
          continue;
        }
      }
      if (decision.execution_authority_granted !== false ||
          decision.external_side_effects_authorized !== false ||
          decision.candidate_id !== candidate.candidate_id ||
          typeof decision.mission_ref !== 'string' ||
          !decision.mission_ref.trim()) {
        throw new Error('timewalk_intake_invalid_admission_boundary');
      }
      const packet = reconstructAdmissionPacket(candidate, decision);
      if (rebuilt.has(packet.receipt_hash)) {
        throw new Error('timewalk_intake_duplicate_reconstructed_packet');
      }
      rebuilt.set(packet.receipt_hash, packet);
    }
    index = rebuilt;
    return index;
  }
  return function readIntakeAdmissionReceipt({
    source_receipt_schema, source_receipt_hash,
  } = {}) {
    if (source_receipt_schema !== PACKET ||
        !HASH.test(String(source_receipt_hash || ''))) return null;
    return load().get(source_receipt_hash) || null;
  };
}
