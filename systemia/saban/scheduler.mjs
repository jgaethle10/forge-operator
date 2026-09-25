import {
  leaseNext,
  complete,
  fail,
  summarizeWorkState
} from './work-state.mjs';

export async function runScheduler({
  state,
  adapter,
  physicalWorkers,
  plan,
  contract,
  rootDir = process.cwd()
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

      try {
        const result = await adapter.runAssignment({
          assignment: {
            agent_id: leased.agent_id,
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
          result
        });
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
      }
    }
  }

  await Promise.all(
    Array.from({ length: workerCount }, (_, index) => runWorker(index))
  );

  return {
    schema: 'evercraft.saban.scheduler-receipt.v1',
    generated_at: new Date().toISOString(),
    worker_count: workerCount,
    summary: summarizeWorkState(state),
    state
  };
}
