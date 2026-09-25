import {
  leaseNext,
  complete,
  fail,
  summarizeWorkState,
  saveWorkState
} from './work-state.mjs';

export async function runScheduler({
  state,
  adapter,
  physicalWorkers,
  plan,
  contract,
  rootDir = process.cwd(),
  statePath = null
}) {
  if (!adapter || typeof adapter.runAssignment !== 'function') {
    throw new Error('Scheduler requires an adapter with runAssignment().');
  }

  const workerCount = Math.max(1, Number.parseInt(String(physicalWorkers || 1), 10) || 1);

  async function runWorker(index) {
    const workerId = `worker-${String(index + 1).padStart(3, '0')}`;

    while (true) {
      const leased = leaseNext(state, { workerId });
      if (!leased) return;
      if (statePath) saveWorkState(statePath, state);

      const startedAt = Date.now();
      try {
        const result = await adapter.runAssignment({
          assignment: {
            agent_id: leased.agent_id,
            idempotency_key: leased.idempotency_key || null,
            role: leased.role,
            work: leased.work,
            item: leased.item
          },
          plan,
          contract,
          rootDir
        });

        complete(state, {
          jobId: leased.job_id,
          workerId,
          result,
          metrics: {
            duration_ms: Math.max(0, Date.now() - startedAt),
            worker_id: workerId
          }
        });
        if (statePath) saveWorkState(statePath, state);
      } catch (error) {
        fail(state, {
          jobId: leased.job_id,
          workerId,
          error: {
            code: 'adapter_error',
            message: error instanceof Error ? error.message : String(error)
          },
          retry: true
        });
        if (statePath) saveWorkState(statePath, state);
      }
    }
  }

  await Promise.all(
    Array.from({ length: workerCount }, (_, index) => runWorker(index))
  );

  if (statePath) saveWorkState(statePath, state);

  return {
    schema: 'evercraft.saban.scheduler-receipt.v1',
    generated_at: new Date().toISOString(),
    worker_count: workerCount,
    summary: summarizeWorkState(state),
    state
  };
}
