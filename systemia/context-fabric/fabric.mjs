import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { EvercraftPassport } from '../passport/passport.mjs';

const EVIDENCE_STATES = new Set([
  'observed',
  'public',
  'licensed',
  'user_supplied',
  'inferred',
  'modeled',
  'generated',
]);

const VISIBILITY = new Set(['public', 'internal', 'restricted']);
const CONTENT_TRUST_STATES = new Set([
  'trusted_internal_receipt',
  'verified_external_evidence',
  'untrusted_external',
  'derived_summary',
  'unknown',
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

function namespaceValue(value) {
  const namespace = requiredString(value, 'namespace').toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(namespace)) {
    throw new Error('namespace_invalid');
  }
  return namespace;
}

function evidenceState(value) {
  const state = requiredString(value, 'evidence_state').toLowerCase();
  if (!EVIDENCE_STATES.has(state)) throw new Error('evidence_state_invalid');
  return state;
}

function visibilityValue(value) {
  const visibility = requiredString(value, 'visibility').toLowerCase();
  if (!VISIBILITY.has(visibility)) throw new Error('visibility_invalid');
  return visibility;
}

function contentTrustState(value) {
  const state = requiredString(value, 'content_trust_state').toLowerCase();
  if (!CONTENT_TRUST_STATES.has(state)) throw new Error('content_trust_state_invalid');
  return state;
}

function normalizedList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [values])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean)
  )].sort();
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonical(child)])
    );
  }
  return value;
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

function tokenize(value) {
  return [...new Set(
    String(value || '')
      .toLowerCase()
      .normalize('NFKC')
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
  )];
}

function scoreRecord(record, query, terms) {
  const title = String(record.title || '').toLowerCase();
  const text = String(record.text || '').toLowerCase();
  const tags = new Set(record.tags || []);
  const entity = String(record.entity_ref || '').toLowerCase();
  const predicate = String(record.predicate || '').toLowerCase();
  const q = String(query || '').trim().toLowerCase();

  let score = 0;
  const matched = [];
  if (q && title.includes(q)) {
    score += 24;
    matched.push('title_phrase');
  }
  if (q && text.includes(q)) {
    score += 8;
    matched.push('text_phrase');
  }

  for (const term of terms) {
    if (title.includes(term)) {
      score += 8;
      matched.push('title:' + term);
    }
    if (tags.has(term)) {
      score += 10;
      matched.push('tag:' + term);
    }
    if (entity.includes(term)) {
      score += 7;
      matched.push('entity:' + term);
    }
    if (predicate.includes(term)) {
      score += 7;
      matched.push('predicate:' + term);
    }
    if (text.includes(term)) {
      score += 2;
      matched.push('text:' + term);
    }
  }

  return { score, matched: [...new Set(matched)] };
}

function claimValueKey(value) {
  return JSON.stringify(canonical(value));
}

export class EvercraftContextFabric {
  constructor({ stateDir, passportStateDir } = {}) {
    if (!stateDir) throw new Error('context_fabric_state_dir_required');
    if (!passportStateDir) throw new Error('passport_state_dir_required');

    this.stateDir = path.resolve(stateDir);
    this.recordsFile = path.join(this.stateDir, 'records.jsonl');
    this.retractionsFile = path.join(this.stateDir, 'retractions.jsonl');
    this.lockDir = path.join(this.stateDir, '.mutation-lock');
    this.passport = new EvercraftPassport({ stateDir: passportStateDir });

    this.records = new Map();
    this.ingestIdempotency = new Map();
    this.retractions = new Map();
    this.retractIdempotency = new Map();
    this.#reload();
  }

  #reload() {
    this.records.clear();
    this.ingestIdempotency.clear();
    this.retractions.clear();
    this.retractIdempotency.clear();

    for (const record of readJsonl(this.recordsFile)) {
      this.records.set(record.record_id, record);
      this.ingestIdempotency.set(record.idempotency_key, record);
    }
    for (const retraction of readJsonl(this.retractionsFile)) {
      this.retractions.set(retraction.record_id, retraction);
      this.retractIdempotency.set(retraction.idempotency_key, retraction);
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
    throw new Error('context_fabric_mutation_lock_timeout');
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

  #authorizeWrite({ actorRef, namespace, at }) {
    return this.passport.authorize({
      subject_ref: actorRef,
      product: 'evercraft-context',
      scope: 'context.write.' + namespace,
      at,
    });
  }

  #canRead(record, actorRef, at) {
    if (record.visibility === 'public') return true;
    if (!actorRef) return false;
    const decision = this.passport.authorize({
      subject_ref: actorRef,
      product: 'evercraft-context',
      scope: record.required_scope,
      at,
    });
    return decision.decision === 'allow';
  }

  ingestRecord(input) {
    return this.#mutate(() => {
      const idempotencyKey = requiredString(input?.idempotency_key, 'idempotency_key');
      const duplicate = this.ingestIdempotency.get(idempotencyKey);
      if (duplicate) {
        return {
          state: 'duplicate',
          record: duplicate,
          receipt: stableReceipt({
            schema: 'evercraft.context.record-receipt.v1',
            state: 'duplicate',
            record_id: duplicate.record_id,
            idempotency_key: idempotencyKey,
          }),
        };
      }

      const namespace = namespaceValue(input?.namespace);
      const actorRef = requiredString(input?.actor_ref, 'actor_ref');
      const observedAt = iso(input?.observed_at || new Date().toISOString(), 'observed_at');
      const authorization = this.#authorizeWrite({
        actorRef,
        namespace,
        at: observedAt,
      });
      if (authorization.decision !== 'allow') throw new Error('context_write_not_authorized');

      const visibility = visibilityValue(input?.visibility || 'internal');
      const text = requiredString(input?.text, 'text');
      const title = requiredString(input?.title, 'title');
      const sourceRef = requiredString(input?.source_ref, 'source_ref');
      const recordId = input?.record_id
        ? requiredString(input.record_id, 'record_id')
        : 'ctx_' + randomUUID();

      const supersedesRecordId = optionalString(input?.supersedes_record_id);
      if (supersedesRecordId) {
        const prior = this.records.get(supersedesRecordId);
        if (!prior) throw new Error('superseded_record_not_found');
        if (prior.namespace !== namespace) throw new Error('cross_namespace_supersession_forbidden');
        if (prior.visibility !== visibility) throw new Error('cross_visibility_supersession_forbidden');
        if ((prior.entity_ref || null) !== (optionalString(input?.entity_ref) || null)) {
          throw new Error('supersession_entity_mismatch');
        }
        if ((prior.predicate || null) !== (optionalString(input?.predicate) || null)) {
          throw new Error('supersession_predicate_mismatch');
        }
      }

      const validFrom = input?.valid_from ? iso(input.valid_from, 'valid_from') : null;
      const validTo = input?.valid_to ? iso(input.valid_to, 'valid_to') : null;
      if (validFrom && validTo && new Date(validTo) <= new Date(validFrom)) {
        throw new Error('validity_window_invalid');
      }

      const requiredScope = visibility === 'public'
        ? null
        : optionalString(input?.required_scope) || 'context.read.' + namespace;

      const record = stableReceipt({
        schema: 'evercraft.context.record.v1',
        record_id: recordId,
        idempotency_key: idempotencyKey,
        namespace,
        kind: optionalString(input?.kind) || 'context',
        title,
        text,
        tags: normalizedList(input?.tags || []),
        entity_ref: optionalString(input?.entity_ref),
        predicate: optionalString(input?.predicate),
        claim_value: Object.prototype.hasOwnProperty.call(input || {}, 'claim_value')
          ? canonical(input.claim_value)
          : null,
        evidence_state: evidenceState(input?.evidence_state),
        content_trust_state: contentTrustState(input?.content_trust_state || 'unknown'),
        content_is_instruction: false,
        source_authority_inherited: false,
        visibility,
        required_scope: requiredScope,
        source_ref: sourceRef,
        source_sha256: optionalString(input?.source_sha256),
        content_sha256: sha256(text),
        observed_at: observedAt,
        valid_from: validFrom,
        valid_to: validTo,
        supersedes_record_id: supersedesRecordId,
        authority_grant_id: authorization.grant_id,
        created_at: new Date().toISOString(),
      });

      this.records.set(recordId, record);
      this.ingestIdempotency.set(idempotencyKey, record);
      appendJsonl(this.recordsFile, record);

      return {
        state: 'recorded',
        record,
        receipt: stableReceipt({
          schema: 'evercraft.context.record-receipt.v1',
          state: 'recorded',
          record_id: recordId,
          namespace,
          evidence_state: record.evidence_state,
          visibility,
          source_ref: sourceRef,
          content_sha256: record.content_sha256,
        }),
      };
    });
  }

  retractRecord(input) {
    return this.#mutate(() => {
      const idempotencyKey = requiredString(input?.idempotency_key, 'idempotency_key');
      const duplicate = this.retractIdempotency.get(idempotencyKey);
      if (duplicate) {
        return {
          state: 'duplicate',
          retraction: duplicate,
          receipt: stableReceipt({
            schema: 'evercraft.context.retraction-receipt.v1',
            state: 'duplicate',
            record_id: duplicate.record_id,
            idempotency_key: idempotencyKey,
          }),
        };
      }

      const recordId = requiredString(input?.record_id, 'record_id');
      const record = this.records.get(recordId);
      if (!record) throw new Error('record_not_found');
      if (this.retractions.has(recordId)) throw new Error('record_already_retracted');

      const actorRef = requiredString(input?.actor_ref, 'actor_ref');
      const retractedAt = iso(input?.retracted_at || new Date().toISOString(), 'retracted_at');
      const authorization = this.#authorizeWrite({
        actorRef,
        namespace: record.namespace,
        at: retractedAt,
      });
      if (authorization.decision !== 'allow') throw new Error('context_write_not_authorized');

      const retraction = stableReceipt({
        schema: 'evercraft.context.retraction.v1',
        retraction_id: 'retract_' + randomUUID(),
        idempotency_key: idempotencyKey,
        record_id: recordId,
        namespace: record.namespace,
        actor_ref: actorRef,
        reason: requiredString(input?.reason, 'reason'),
        evidence_ref: requiredString(input?.evidence_ref, 'evidence_ref'),
        authority_grant_id: authorization.grant_id,
        retracted_at: retractedAt,
      });

      this.retractions.set(recordId, retraction);
      this.retractIdempotency.set(idempotencyKey, retraction);
      appendJsonl(this.retractionsFile, retraction);

      return {
        state: 'retracted',
        retraction,
        receipt: stableReceipt({
          schema: 'evercraft.context.retraction-receipt.v1',
          state: 'retracted',
          record_id: recordId,
          namespace: record.namespace,
          evidence_ref: retraction.evidence_ref,
        }),
      };
    });
  }

  query(input) {
    this.#reload();
    const query = requiredString(input?.query, 'query');
    const at = iso(input?.at || new Date().toISOString(), 'at');
    const actorRef = optionalString(input?.actor_ref);
    const namespaceFilter = input?.namespaces
      ? new Set((Array.isArray(input.namespaces) ? input.namespaces : [input.namespaces]).map(namespaceValue))
      : null;
    const evidenceFilter = input?.evidence_states
      ? new Set((Array.isArray(input.evidence_states) ? input.evidence_states : [input.evidence_states]).map(evidenceState))
      : null;
    const includeHistory = input?.include_history === true;
    const maxResults = Math.min(Math.max(Number(input?.max_results || 12), 1), 100);
    const maxChars = Math.min(Math.max(Number(input?.max_chars || 6000), 200), 50000);
    const terms = tokenize(query);

    const authorized = [...this.records.values()].filter((record) => {
      if (namespaceFilter && !namespaceFilter.has(record.namespace)) return false;
      if (evidenceFilter && !evidenceFilter.has(record.evidence_state)) return false;
      if (!this.#canRead(record, actorRef, at)) return false;
      if (record.valid_from && new Date(at) < new Date(record.valid_from)) return false;
      if (record.valid_to && new Date(at) >= new Date(record.valid_to)) return false;
      return true;
    });

    const retracted = new Set(this.retractions.keys());
    const superseded = new Set(
      authorized
        .filter((record) => !retracted.has(record.record_id))
        .map((record) => record.supersedes_record_id)
        .filter(Boolean)
    );

    const candidates = authorized
      .filter((record) =>
        includeHistory ||
        (!retracted.has(record.record_id) && !superseded.has(record.record_id))
      )
      .map((record) => {
        const scored = scoreRecord(record, query, terms);
        return { record, ...scored };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) =>
        b.score - a.score ||
        new Date(b.record.observed_at) - new Date(a.record.observed_at) ||
        a.record.record_id.localeCompare(b.record.record_id)
      );

    const results = [];
    let usedChars = 0;
    for (const row of candidates) {
      if (results.length >= maxResults || usedChars >= maxChars) break;
      const remaining = maxChars - usedChars;
      if (remaining <= 0) break;

      const overhead = Math.min(180, remaining);
      const textBudget = Math.max(0, remaining - overhead);
      if (textBudget <= 0) break;

      const fullText = row.record.text;
      const snippet = fullText.length <= textBudget
        ? fullText
        : fullText.slice(0, Math.max(0, textBudget - 1)).trimEnd() + '…';

      const result = {
        record_id: row.record.record_id,
        namespace: row.record.namespace,
        kind: row.record.kind,
        title: row.record.title,
        snippet,
        tags: row.record.tags,
        entity_ref: row.record.entity_ref,
        predicate: row.record.predicate,
        claim_value: row.record.claim_value,
        evidence_state: row.record.evidence_state,
        content_trust_state: row.record.content_trust_state || 'unknown',
        content_is_instruction: false,
        source_authority_inherited: false,
        source_ref: row.record.source_ref,
        source_sha256: row.record.source_sha256,
        content_sha256: row.record.content_sha256,
        observed_at: row.record.observed_at,
        valid_from: row.record.valid_from,
        valid_to: row.record.valid_to,
        supersedes_record_id: row.record.supersedes_record_id,
        score: row.score,
        matched_on: row.matched,
        citation: 'context:' + row.record.record_id,
      };

      let size = JSON.stringify(result).length;
      if (size > remaining) {
        const excess = size - remaining;
        if (result.snippet.length > excess + 1) {
          result.snippet =
            result.snippet.slice(0, Math.max(0, result.snippet.length - excess - 1)).trimEnd() + '…';
          size = JSON.stringify(result).length;
        }
      }
      if (size > remaining) {
        if (results.length > 0) break;
        continue;
      }
      results.push(result);
      usedChars += size;
    }

    const claims = new Map();
    for (const result of results) {
      if (!result.entity_ref || !result.predicate || result.claim_value === null) continue;
      const key = result.entity_ref + '|' + result.predicate;
      const bucket = claims.get(key) || [];
      bucket.push(result);
      claims.set(key, bucket);
    }

    const conflicts = [];
    for (const [key, rows] of claims) {
      const distinct = new Map();
      for (const row of rows) {
        const valueKey = claimValueKey(row.claim_value);
        (distinct.get(valueKey) || distinct.set(valueKey, []).get(valueKey)).push(row);
      }
      if (distinct.size <= 1) continue;
      const [entityRef, predicate] = key.split('|');
      conflicts.push({
        entity_ref: entityRef,
        predicate,
        values: [...distinct.entries()].map(([valueKey, valueRows]) => ({
          value: JSON.parse(valueKey),
          record_ids: valueRows.map((row) => row.record_id),
          evidence_states: [...new Set(valueRows.map((row) => row.evidence_state))].sort(),
          source_refs: [...new Set(valueRows.map((row) => row.source_ref))].sort(),
        })),
        resolution: 'unresolved_conflict_preserved',
      });
    }

    return stableReceipt({
      schema: 'evercraft.context.packet.v1',
      query,
      actor_ref: actorRef,
      retrieval_mode: 'deterministic_lexical_metadata_v1',
      semantic_embedding_used: false,
      authority_filter_applied: true,
      namespaces: namespaceFilter ? [...namespaceFilter].sort() : null,
      evidence_states: evidenceFilter ? [...evidenceFilter].sort() : null,
      include_history: includeHistory,
      max_results: maxResults,
      max_chars: maxChars,
      result_count: results.length,
      context_chars: usedChars,
      results,
      conflicts,
      conflict_count: conflicts.length,
      queried_at: at,
      query_persisted: false,
      truth_boundary: {
        no_unauthorized_record_metadata_returned: true,
        evidence_state_preserved: true,
        content_never_becomes_instruction_by_retrieval: true,
        source_authority_never_inherited: true,
        contradictions_not_silently_resolved: true,
        lexical_retrieval_is_not_semantic_understanding: true,
      },
    });
  }

  getRecord(recordId, { actor_ref = null, at = new Date().toISOString(), include_history = false } = {}) {
    this.#reload();
    const id = requiredString(recordId, 'record_id');
    const instant = iso(at, 'at');
    const record = this.records.get(id);
    if (!record) return null;
    if (!this.#canRead(record, optionalString(actor_ref), instant)) return null;
    if (!include_history && this.retractions.has(id)) return null;

    return {
      ...record,
      retraction: this.retractions.get(id) || null,
    };
  }
}
