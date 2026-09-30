import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const INTERNALOPS_SNAPSHOT_CONTRACT = 'eps_systemia_read_only_snapshot_v1';
export const INTERNALOPS_MISSION_KEY = 'evercraft-internalops-operations-nexus-v1';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function sanitizeAggregateObject(value, depth = 0) {
  if (depth > 8) throw new Error('snapshot_too_deep');
  if (Array.isArray(value)) return value.map((item) => sanitizeAggregateObject(item, depth + 1));
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'source_app_id') continue;
    out[key] = sanitizeAggregateObject(entry, depth + 1);
  }
  return out;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

export function canonicalJson(value) {
  return JSON.stringify(stable(value));
}

export function validateInternalOpsSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) throw new Error('snapshot_required');
  if (snapshot.ok !== true) throw new Error('snapshot_not_ok');
  if (snapshot.contract !== INTERNALOPS_SNAPSHOT_CONTRACT) throw new Error('snapshot_contract_invalid');

  const authority = snapshot.authority;
  if (!isPlainObject(authority)) throw new Error('snapshot_authority_missing');
  if (authority.read_only !== true) throw new Error('snapshot_must_be_read_only');
  if (authority.contains_personal_contact_data !== false) throw new Error('snapshot_personal_contact_data_forbidden');
  if (authority.contains_tax_or_payment_account_data !== false) throw new Error('snapshot_sensitive_financial_data_forbidden');
  if (authority.may_authorize_mutation !== false) throw new Error('snapshot_mutation_authority_forbidden');

  const generated = new Date(String(snapshot.generated_at || ''));
  if (!Number.isFinite(generated.getTime())) throw new Error('snapshot_generated_at_invalid');

  for (const section of ['jobs', 'crew', 'payroll_integrity', 'reimbursements', 'pipeline', 'record_counts']) {
    if (!isPlainObject(snapshot[section])) throw new Error(`snapshot_section_missing:${section}`);
    for (const [key, value] of Object.entries(snapshot[section])) {
      if (typeof value === 'number' && !finiteNumber(value)) throw new Error(`snapshot_number_invalid:${section}.${key}`);
    }
  }

  return sanitizeAggregateObject(snapshot);
}

function secureEqual(actual, expected) {
  const a = Buffer.from(String(actual || ''), 'utf8');
  const b = Buffer.from(String(expected || ''), 'utf8');
  if (!a.length || !b.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function authorizeInternalOpsMachineKey(supplied, expected) {
  return secureEqual(supplied, expected);
}

function ensureStateDir(stateDir) {
  if (!stateDir) throw new Error('internalops_state_dir_required');
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(stateDir, 0o700); } catch {}
}

function atomicWriteJson(filePath, value) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temp, filePath);
  try { fs.chmodSync(filePath, 0o600); } catch {}
}

export function ingestInternalOpsSnapshot({
  snapshot,
  missionKey,
  sourceCheckpointId = '',
  stateDir,
  now = new Date(),
} = {}) {
  if (String(missionKey || '') !== INTERNALOPS_MISSION_KEY) throw new Error('mission_key_invalid');
  const cleanSnapshot = validateInternalOpsSnapshot(snapshot);
  const payload = canonicalJson(cleanSnapshot);
  const payloadHash = crypto.createHash('sha256').update(payload).digest('hex');
  const snapshotKey = `internalops-snapshot:${payloadHash.slice(0, 24)}`;
  const receiptKey = `internalops-receipt:${payloadHash.slice(0, 24)}`;

  ensureStateDir(stateDir);
  const receiptsDir = path.join(stateDir, 'receipts');
  fs.mkdirSync(receiptsDir, { recursive: true, mode: 0o700 });
  const receiptPath = path.join(receiptsDir, `${payloadHash}.json`);
  const duplicate = fs.existsSync(receiptPath);

  const receivedAt = new Date(now).toISOString();
  const record = {
    schema: 'evercraft.internalops.snapshot-record.v1',
    snapshot_key: snapshotKey,
    receipt_key: receiptKey,
    payload_hash: payloadHash,
    mission_key: INTERNALOPS_MISSION_KEY,
    source_checkpoint_id: String(sourceCheckpointId || '').slice(0, 220),
    generated_at: cleanSnapshot.generated_at,
    received_at: receivedAt,
    authority: 'read_only_aggregate',
    source_system: 'legacy_internalops_adapter',
    snapshot: cleanSnapshot,
  };

  if (!duplicate) {
    atomicWriteJson(receiptPath, {
      schema: 'evercraft.internalops.snapshot-receipt.v1',
      snapshot_key: snapshotKey,
      receipt_key: receiptKey,
      payload_hash: payloadHash,
      mission_key: INTERNALOPS_MISSION_KEY,
      generated_at: cleanSnapshot.generated_at,
      received_at: receivedAt,
      authority: 'read_only_aggregate',
    });
  }
  atomicWriteJson(path.join(stateDir, 'latest.json'), record);

  return {
    ok: true,
    accepted: true,
    duplicate,
    snapshot_key: snapshotKey,
    receipt_key: receiptKey,
    payload_hash: payloadHash,
    generated_at: cleanSnapshot.generated_at,
    received_at: receivedAt,
    authority: 'read_only_aggregate',
  };
}
