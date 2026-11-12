import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Read-only Systemia-to-Saban boundary. These are proposals, never execution. */
const SAFE_RECOVERY = new Set([
  'recover_owned_next_action', 'inspect_and_reconcile_receipts',
  'refresh_source_evidence', 'review_due_state', 'verify_release_receipt',
]);
const NON_PROGRESS = new Set(['FOUNDER_DECISION', 'READY_FOR_RELEASE', 'RELEASED_VERIFIED', 'PARKED_INTENTIONALLY']);
const PROTECTED = new Set(['canon', 'publication', 'rights', 'spending', 'outreach']);
const SCHEMA = 'evercraft.production.artifact-result.v1';

export function planSabanRecovery(audit, { maxJobs = 10 } = {}) {
  if (audit?.schema !== 'evercraft.production.continuity.audit.v1') throw new Error('Invalid continuity audit');
  if (!Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > 100) throw new Error('Invalid planning limit');
  const assignments = [];
  const seen = new Set();
  for (const action of audit.proposed_internal_work || []) {
    if (!SAFE_RECOVERY.has(action.kind) || !/^[a-z0-9][a-z0-9._-]{2,79}$/.test(action.project_id)) continue;
    const id = `${action.project_id}:${action.kind}`;
    if (seen.has(id)) continue;
    seen.add(id);
    assignments.push({
      agent_id: 'continuity-private-evidence-review', role: 'read_only_recovery',
      idempotency_key: `continuity:${id}`,
      work: { kind: 'continuity_evidence_probe', key: id, read_only: true },
      item: { project_id: action.project_id, reason_code: 'continuity_attention', probe_kind: action.kind },
    });
    if (assignments.length >= maxJobs) break;
  }
  return { schema: 'evercraft.production.continuity.saban-plan.v1', assignments,
    dispatch_performed: false, requires_private_saban_admission: true };
}

function artifactDigest(root, relative, expected) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(p => p === '..' || !p)) return null;
  if (!/^[a-f0-9]{64}$/.test(expected || '')) return null;
  const trustedRoot = fs.realpathSync(root);
  const target = path.resolve(trustedRoot, relative);
  if (!target.startsWith(trustedRoot + path.sep)) return null;
  // Reject symlinks anywhere in the relative path, not only final file.
  let part = trustedRoot;
  for (const segment of relative.split('/')) {
    part = path.join(part, segment);
    if (fs.lstatSync(part).isSymbolicLink()) return null;
  }
  const s = fs.statSync(target);
  if (!s.isFile() || s.size < 1 || s.size > 40 * 1024 * 1024) return null;
  const actual = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
  return actual === expected ? actual : null;
}

/**
 * Import *verified physical artifacts* from a locally owned Saban work-state.
 * A `completed` job without correct artifact bytes is NOT proof of progress.
 * Never changes canon, publication, hold, or release status.
 */
export function reconcileSabanArtifacts(ledger, saban, { artifactRoot, now = Date.now() } = {}) {
  if (ledger?.schema !== 'evercraft.production.continuity.v1' || !Array.isArray(ledger.projects)) throw new Error('Invalid private ledger');
  if (saban?.schema !== 'evercraft.saban.work-state.v1' || !saban.jobs || typeof saban.jobs !== 'object') throw new Error('Invalid Saban work state');
  if (typeof artifactRoot !== 'string' || !artifactRoot || !Number.isFinite(now)) throw new Error('Private artifact root and clock required');
  const copy = structuredClone(ledger);
  const projects = new Map(copy.projects.map(p => [p.project_id, p]));
  const observed = [], rejected = [];
  const jobs = Object.values(saban.jobs).sort((a, b) => String(a?.updated_at || '').localeCompare(String(b?.updated_at || '')));
  for (const job of jobs) {
    if (job?.state !== 'completed') continue;
    const suppliedId = job?.result?.project_id;
    const id = typeof suppliedId === 'string' && /^[a-z0-9][a-z0-9._-]{2,79}$/.test(suppliedId) ? suppliedId : null;
    const p = projects.get(id);
    const result = job?.result;
    const jobAt = Date.parse(job?.updated_at || '');
    if (!p || !job?.job_id || !Number.isFinite(jobAt) || jobAt > now
      || NON_PROGRESS.has(p.current_stage) || PROTECTED.has(p.next_action?.requires_gate)
      || !p.next_action?.kind || !p.next_action?.owner
      || job.agent_id !== p.next_action.owner
      || job.work?.key !== id || job.work?.kind !== p.next_action.kind
      || result?.schema !== SCHEMA || result?.action_kind !== p.next_action.kind
      || result?.publication_performed === true || result?.canon_modified === true
      || result?.release_claimed === true) {
      rejected.push({ project_id: id || null, reason: 'job_not_authorized_for_progress' });
      continue;
    }
    let digest = null;
    try { digest = artifactDigest(artifactRoot, result.artifact_relpath, result.artifact_sha256); }
    catch { /* Missing paths, unreadable files, and symlink failures are not receipts. */ }
    if (!digest) {
      rejected.push({ project_id: id, reason: 'artifact_not_byte_verified' });
      continue;
    }
    const priorAt = Date.parse(p.last_verified_receipt?.verified_at || '');
    if (p.last_verified_receipt?.artifact_sha256 === digest || (Number.isFinite(priorAt) && jobAt <= priorAt)) continue;
    // A late verification of an old artifact must never refresh its liveness age.
    const verified_at = new Date(jobAt).toISOString();
    p.last_verified_receipt = {
      verified: true, receipt_id: `saban-${crypto.createHash('sha256').update(`${id}:${job.job_id}:${digest}`).digest('hex').slice(0,24)}`,
      source: 'owned_saban_local_artifact_verifier',
      verified_at, artifact_ref: `sha256:${digest}`, artifact_sha256: digest,
      evidence_class: 'internal_work_artifact_not_publication',
    };
    observed.push({ project_id: id, verified_at, artifact_sha256: digest });
  }
  return { ledger: copy, summary: { schema: 'evercraft.production.continuity.reconciliation.v1',
    imported_count: observed.length, rejected_count: rejected.length,
    observed, rejected, publication_performed: false, dispatch_performed: false,
    canon_modified: false } };
}
