import { createWorkState, leaseNext, complete, fail, summarizeWorkState } from '../saban/work-state.mjs';

export const PARALLEL_SCHEMA = 'evercraft.production.parallel-slate.v1';
const TERMINAL = new Set(['RELEASED_VERIFIED', 'PARKED_INTENTIONALLY']);
const PROTECTED = new Set(['canon', 'rights', 'publication', 'outreach', 'spending']);
const ID = /^[a-z0-9][a-z0-9._-]{2,79}$/;

/**
 * Admit every independently actionable project to a Saban-shaped queue.
 * There is no global serial "one book at a time" gate.
 * The queue is a private artifact, NOT a dispatch receipt or a finished book.
 */
export function buildParallelSlate(ledger, { maxInFlight = 6, createdAt = Date.now() } = {}) {
  if (ledger?.schema !== 'evercraft.production.continuity.v1' || !Array.isArray(ledger.projects)) {
    throw new Error('Expected private continuity ledger');
  }
  if (!Number.isInteger(maxInFlight) || maxInFlight < 2 || maxInFlight > 12) {
    throw new Error('Parallelism must be 2..12');
  }
  const assignments = [], holds = [], seen = new Set(), owner_counts = {};
  for (const p of ledger.projects) {
    if (!p || !ID.test(p.project_id || '') || seen.has(p.project_id)) throw new Error('Invalid/duplicate project');
    seen.add(p.project_id);
    const action = p.next_action;
    if (TERMINAL.has(p.current_stage) || p.current_stage === 'FOUNDER_DECISION'
      || p.current_stage === 'READY_FOR_RELEASE' || !action?.kind || !action?.owner
      || PROTECTED.has(action?.requires_gate)) {
      holds.push({ project_id: p.project_id, reason: 'needs_explicit_gate_or_valid_owner' });
      continue;
    }
    // Never put source URLs, draft text, plot lines, or titles into PUBLIC repo/CI.
    assignments.push({
      agent_id: action.owner,
      role: 'private_production_lane',
      idempotency_key: 'production:' + p.project_id + ':' + action.kind,
      work: { kind: action.kind, key: p.project_id, private_only: true },
      item: { project_id: p.project_id, lane: action.owner, release_authorized: false },
    });
    owner_counts[action.owner] = (owner_counts[action.owner] || 0) + 1;
  }
  const queue = createWorkState({
    softwareId: 'evercraft-private-production-slate', assignments,
    leaseSeconds: 300, maxAttempts: 2, createdAt
  });
  if (Object.keys(queue.jobs).length !== assignments.length) {
    throw new Error('Saban assignment collision; fail closed rather than drop a project');
  }
  return {
    schema: PARALLEL_SCHEMA, queue, max_in_flight: maxInFlight, owner_counts,
    queued_count: assignments.length, held_count: holds.length, holds,
    dispatched: false, producer_attached: false, publication_performed: false
  };
}

/**
 * Only an EXPLICIT trusted private adapter can run actual work. The callback
 * receives the leased job. A job returning without a result artifact is not
 * completed. Work-state is in-memory; caller must persist via owned Saban.
 *
 * Completion here is only a Saban job outcome. Production progress still
 * requires reconcileSabanArtifacts() to verify actual private artifact bytes.
 */
export async function executeParallelSlate(batch, { worker, maxInFlight = batch?.max_in_flight } = {}) {
  if (batch?.schema !== PARALLEL_SCHEMA || !batch?.queue?.jobs) throw new Error('Invalid parallel batch');
  if (typeof worker !== 'function') throw new Error('A trusted private worker adapter is required');
  if (!Number.isInteger(maxInFlight) || maxInFlight < 2 || maxInFlight > 12) throw new Error('Invalid worker count');
  const state = structuredClone(batch.queue), failures = [];
  let in_flight = 0, peak_in_flight = 0;
  const runners = Array.from({ length: Math.min(maxInFlight, Object.keys(state.jobs).length) }, (_, i) => (async () => {
    const workerId = 'private-slate-worker-' + (i + 1);
    while (true) {
      const leased = leaseNext(state, { workerId });
      if (!leased) return;
      in_flight++;
      peak_in_flight = Math.max(peak_in_flight, in_flight);
      try {
        const outcome = await worker(leased);
        // Never accept an empty response or an implicit published result.
        if (outcome?.schema !== 'evercraft.production.artifact-result.v1'
          || outcome?.project_id !== leased.work.key
          || outcome?.action_kind !== leased.work.kind
          || !outcome?.artifact_relpath || !/^[a-f0-9]{64}$/.test(outcome?.artifact_sha256 || '')
          || outcome?.publication_performed || outcome?.canon_modified || outcome?.release_claimed) {
          throw new Error('missing_or_invalid_artifact_claim');
        }
        complete(state, { jobId: leased.job_id, workerId, result: outcome });
      } catch (_error) {
        // One lane failing may not starve unrelated books or research projects.
        fail(state, { jobId: leased.job_id, workerId, retry: false,
          error: { code: 'private_worker_failed', message: 'See private worker evidence; no completion verified' } });
        failures.push({ project_id: leased.work.key, reason: 'worker_failed_or_unverified' });
      } finally {
        in_flight--;
      }
    }
  })());
  await Promise.all(runners);
  return {
    schema: 'evercraft.production.parallel-run.v1',
    state, work_state_summary: summarizeWorkState(state),
    peak_in_flight, attempted_count: Object.keys(state.jobs).length,
    failures, artifact_validation_required: true,
    public_release_verified: false,
    // Caller should not infer this means a real connected Systemia mission.
    execution_environment: 'supplied_trusted_adapter',
  };
}
