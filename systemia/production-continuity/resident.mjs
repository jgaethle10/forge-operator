import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditProductionLedger } from './ledger.mjs';
import { planSabanRecovery, reconcileSabanArtifacts } from './receipt-bridge.mjs';

export const RESIDENT_SCHEMA = 'evercraft.production.continuity.resident-state.v1';
const PRIVATE_INPUT = 'ledger.json';
const RESIDENT_FILE = 'resident-state.json';

function sha(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function readSecret(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw new Error('Private file must be regular, owner-only, and not symlinked');
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function assertPrivateDirectory(dir) {
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) throw new Error('Absolute private directory required');
  // Block inadvertent placement inside public source checkouts.
  const actual = path.resolve(dir);
  let walk = actual;
  while (walk !== path.dirname(walk)) {
    if (fs.existsSync(path.join(walk, '.git'))) throw new Error('Private state inside source repository refused');
    walk = path.dirname(walk);
  }
  fs.mkdirSync(actual, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(actual);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw new Error('Private directory requires owner-only access; chmod 700 first');
  }
  return fs.realpathSync(actual);
}
function validateState(state) {
  if (state?.schema !== RESIDENT_SCHEMA || !Number.isSafeInteger(state.sequence) || state.sequence < 1
      || !/^[a-f0-9]{64}$/.test(state.digest || '')) throw new Error('Invalid resident state');
  const copy = { ...state };
  delete copy.digest;
  if (sha(copy) !== state.digest) throw new Error('Resident state integrity check failed');
  if (state.ledger?.schema !== 'evercraft.production.continuity.v1') throw new Error('Invalid carried ledger');
  return state;
}
function atomicPrivateWrite(file, data) {
  const temporary = file + '.pending-' + crypto.randomBytes(6).toString('hex');
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify(data, null, 2) + '\n', 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(temporary, file);
    const directoryFd = fs.openSync(path.dirname(file), 'r');
    try { fs.fsyncSync(directoryFd); } finally { fs.closeSync(directoryFd); }
  } finally {
    if (fd !== null && fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temporary)) fs.rmSync(temporary);
  }
}

/**
 * One bounded, restart-safe cycle. The private state is authoritative after
 * the first cycle; a fresh seed file cannot overwrite tracked progress.
 * No action leaves this machine, no agent is actually dispatched.
 */
export function runResidentCycle({ privateDir, now = Date.now(), staleAfterHours = 24 } = {}) {
  if (!Number.isFinite(now)) throw new Error('Invalid clock');
  const root = assertPrivateDirectory(privateDir);
  const lockFile = path.join(root, '.resident.lock');
  let lockFd;
  try {
    // Exclusive creation rejects concurrent cycles. After a crash, operator
    // must inspect/remove the stale lock; never silently steal a live lease.
    lockFd = fs.openSync(lockFile, 'wx', 0o600);
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('Resident cycle already locked; inspect prior owner before recovery');
    throw error;
  }
  try {
    const destination = path.join(root, RESIDENT_FILE);
    const prior = fs.existsSync(destination) ? validateState(readSecret(destination)) : null;
    const input = prior?.ledger ?? readSecret(path.join(root, PRIVATE_INPUT));
    if (input?.schema !== 'evercraft.production.continuity.v1' || !Array.isArray(input.projects)) {
      throw new Error('Invalid private ledger');
    }
    if (prior && now < Date.parse(prior.saved_at)) throw new Error('Resident clock rollback refused');
    const saban = path.join(root, 'saban-work-state.json');
    let reconciled = {
      ledger: structuredClone(input),
      summary: { schema: 'evercraft.production.continuity.reconciliation.v1',
        imported_count: 0, rejected_count: 0, observed: [], rejected: [],
        dispatch_performed: false, publication_performed: false, canon_modified: false }
    };
    if (fs.existsSync(saban)) {
      reconciled = reconcileSabanArtifacts(input, readSecret(saban), {
        artifactRoot: path.join(root, 'artifacts'), now
      });
    }
    const audit = auditProductionLedger(reconciled.ledger, { now, staleAfterHours });
    const plan = planSabanRecovery(audit);
    const withoutDigest = {
      schema: RESIDENT_SCHEMA, sequence: (prior?.sequence ?? 0) + 1,
      previous_digest: prior?.digest ?? null, saved_at: new Date(now).toISOString(),
      ledger: reconciled.ledger, audit, plan, reconciliation: reconciled.summary,
      agent_dispatch_performed: false, publication_performed: false, canon_modified: false
    };
    const saved = { ...withoutDigest, digest: sha(withoutDigest) };
    atomicPrivateWrite(destination, saved);
    return {
      schema: 'evercraft.production.continuity.resident-cycle-receipt.v1',
      sequence: saved.sequence, digest: saved.digest, projects: audit.project_count,
      need_attention: audit.attention_count,
      verified_artifacts_imported: reconciled.summary.imported_count,
      proposed_recovery_assignments: plan.assignments.length,
      worker_execution_verified: false, agent_dispatch_performed: false,
      publication_performed: false, canon_modified: false
    };
  } finally {
    fs.closeSync(lockFd);
    fs.unlinkSync(lockFile);
  }
}

export function defaultPrivateDir() {
  return path.join(os.homedir(), '.local', 'share', 'evercraft', 'production-continuity');
}
