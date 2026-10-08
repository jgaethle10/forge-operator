/**
 * Conservative, provider-independent inspection of potentially interrupted work.
 * A stale heartbeat is not proof that the worker died or the side effect failed.
 * This module can HOLD an attempt for reconciliation, never replay or dispatch it.
 */
import { refreshGoal } from './goal-runtime.mjs';

function clean(value) { return String(value ?? '').trim(); }
function clock(now) {
  const stamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(stamp)) throw new Error('valid now required');
  return stamp;
}
function threshold(value) {
  if (!Number.isSafeInteger(value) || value < 60000) throw new Error('staleAfterMs must be >= 60000');
  return value;
}
export function inspectInterruptedGoalWork({state, now=new Date(), staleAfterMs=3600000}={}) {
  if (!state || state.schema!=='evercraft.goal.state.v1' || !Array.isArray(state.tasks)) {
    throw new Error('valid goal state required');
  }
  const at=clock(now);
  threshold(staleAfterMs);
  return {
    schema:'evercraft.systemia.interrupted-work-inspection.v1',
    mission_key:state.mission_key,
    goal_key:state.goal_key,
    inspected_at:new Date(at).toISOString(),
    stale_after_ms:staleAfterMs,
    execution_authority_granted:false,
    auto_retry_allowed:false,
    suspected_work:state.tasks.filter(task=>task.status==='executing').map(task=>{
      const seen=Date.parse(task.updated_at||'');
      const validAttempt=Number.isInteger(task.attempt) && task.attempt>=1;
      const age=Number.isFinite(seen)?at-seen:null;
      const classification=!validAttempt || age===null
        ? 'unknown_attempt_or_timestamp_requires_review'
        : age < 0
          ? 'future_heartbeat_requires_review'
          : age >= staleAfterMs
            ? 'suspected_interruption_requires_owner_check'
            : 'within_heartbeat_window';
      return {
        work_key:task.work_key,attempt:task.attempt,
        attempt_key:task.attempt_key||`${task.dedupe_key}:attempt:${task.attempt}`,
        last_update_at:task.updated_at||null,
        age_ms:age,
        classification,
        replay_authorized:false,
        external_effect_unknown:true,
      };
    }),
  };
}
export function holdInterruptedGoalWork({
  state,workKey,expectedAttempt,expectedUpdatedAt,
  now=new Date(),staleAfterMs=3600000
}={}){
  const inspection=inspectInterruptedGoalWork({state,now,staleAfterMs});
  const next=structuredClone(state);
  const task=next.tasks.find(t=>t.work_key===clean(workKey));
  if(!task)throw new Error('unknown work_key');
  if(task.status!=='executing')throw new Error('only executing work can enter recovery hold');
  if(!Number.isInteger(expectedAttempt)||task.attempt!==expectedAttempt) {
    throw new Error('attempt changed: refuse stale recovery hold');
  }
  if(!clean(expectedUpdatedAt)||task.updated_at!==expectedUpdatedAt) {
    throw new Error('heartbeat changed: refuse stale recovery hold');
  }
  const candidate=inspection.suspected_work.find(t=>t.work_key===task.work_key);
  if(candidate?.classification!=='suspected_interruption_requires_owner_check'){
    throw new Error('work is not sufficiently stale for conservative hold');
  }
  const stamp=inspection.inspected_at;
  task.status='blocked';
  task.last_result='interrupted_outcome_unknown';
  task.recovery_hold={
    schema:'evercraft.systemia.interrupted-attempt-hold.v1',
    attempt:task.attempt,
    attempt_key:candidate.attempt_key,
    last_heartbeat_at:expectedUpdatedAt,
    held_at:stamp,
    effect_state:'unknown',
    producer_outcome_verified:false,
    require_authoritative_reconciliation:true,
    auto_replay_allowed:false,
  };
  task.blockers=[...new Set([...(task.blockers||[]),
    'interrupted_attempt_requires_authoritative_outcome_reconciliation'])];
  task.updated_at=stamp;
  next.revision+=1;
  next.updated_at=stamp;
  return refreshGoal(next,now);
}
