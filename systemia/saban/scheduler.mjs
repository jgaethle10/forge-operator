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
  statePath = null,
  onStateObservation = null
}) {
  if (!adapter || typeof adapter.runAssignment !== 'function') {
    throw new Error('Scheduler requires an adapter with runAssignment().');
  }

  const workerCount = Math.max(1, Number.parseInt(String(physicalWorkers || 1), 10) || 1);
  if(onStateObservation!==null && typeof onStateObservation!=='function')
    throw new Error('Saban observation must be a synchronous callback');
  let observed=0,observationFailures=0;
  const sendObservation=(kind)=>{
    if(!onStateObservation)return;
    // Only totals enter the callback. No job/worker identifiers or payloads.
    const counts={queued:0,leased:0,completed:0,dead_letter:0};
    for(const job of Object.values(state.jobs||{})){
      if(!Object.hasOwn(counts,job.state)){
        observationFailures++;
        return;
      }
      counts[job.state]++;
    }
    try{
      const result=onStateObservation({kind,at:new Date().toISOString(),
        total:Object.keys(state.jobs||{}).length,counts});
      if(result&&typeof result.then==='function')
        throw new Error('Saban observation callback must be synchronous');
      observed++;
    }catch{
      // A failed graphics observer never converts a successful task into a
      // scheduler failure, nor causes another execution attempt.
      observationFailures++;
    }
  };

  async function runWorker(index) {
    const workerId = `worker-${String(index + 1).padStart(3, '0')}`;

    while (true) {
      const leased = leaseNext(state, { workerId });
      if (!leased) return;
      if (statePath) saveWorkState(statePath, state);
      sendObservation('leased');

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
        sendObservation('completed');
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
        sendObservation(state.jobs[leased.job_id].state==='queued'?'retry_queued':'dead_letter');
      }
    }
  }

  await Promise.all(
    Array.from({ length: workerCount }, (_, index) => runWorker(index))
  );

  if (statePath) saveWorkState(statePath, state);
  const summary=summarizeWorkState(state);
  sendObservation('scheduler_finished');

  return {
    schema: 'evercraft.saban.scheduler-receipt.v1',
    generated_at: new Date().toISOString(),
    worker_count: workerCount,
    summary,
    observation_summary:{
      enabled:onStateObservation!==null,emitted:observed,
      failures:observationFailures,
      locally_observed_only:true,
      event_history_complete:false,
      callback_gaps:observationFailures>0
    },
    state
  };
}
