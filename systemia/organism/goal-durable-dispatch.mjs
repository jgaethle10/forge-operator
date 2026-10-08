/**
 * Owned file-adapter dispatch with a durable execution checkpoint BEFORE any
 * capability callback. It is an explicit operator library, not a resident
 * scheduler or grant of external execution authority.
 */
import {readGoalState,mutateGoalState} from './goal-store.mjs';
import {startGoalWork,recordGoalOutcome,refreshGoal,goalSnapshot} from './goal-runtime.mjs';
import {selectCapabilityAdapter} from './capability-runtime.mjs';

const clean=x=>String(x??'').trim();
const nowIso=now=>now instanceof Date?now.toISOString():new Date(now).toISOString();
const unique=values=>[...new Set((values||[]).map(clean).filter(Boolean))].slice(0,100);

function boundAdapter(registry,work){
 const adapter=selectCapabilityAdapter(registry,work);
 if(!adapter)return {adapter:null,reason:'no_adapter'};
 if(adapter.human_gate_required&&!work.human_gate_required){
  return {adapter:null,reason:'adapter_requires_human_gate'};
 }
 if(work.provider_key&&adapter.provider_key!==work.provider_key){
  return {adapter:null,reason:'provider_binding_mismatch'};
 }
 return {adapter,reason:null};
}

function quarantineUncertainOutcome({state,workKey,expectedAttempt,now=new Date(),sourceResult='unknown'}){
 const next=structuredClone(state);
 const task=next.tasks.find(x=>x.work_key===workKey);
 if(!task||task.status!=='executing'||task.recovery_hold||
   task.attempt!==expectedAttempt||!Number.isSafeInteger(expectedAttempt)||
   expectedAttempt<1)throw Error('attempt changed: refuse uncertain-outcome quarantine');
 const stamp=nowIso(now);
 task.status='blocked';
 task.last_result='external_effect_unknown_after_dispatch';
 task.recovery_hold={
  schema:'evercraft.systemia.interrupted-attempt-hold.v1',
  attempt:task.attempt,attempt_key:task.attempt_key,
  last_heartbeat_at:task.last_heartbeat_at||task.updated_at,
  held_at:stamp,effect_state:'unknown',
  producer_outcome_verified:false,
  require_authoritative_reconciliation:true,
  auto_replay_allowed:false,
  source_reported_result:clean(sourceResult).slice(0,60),
 };
 task.blockers=[...new Set([...(task.blockers||[]),
  'dispatched_attempt_requires_authoritative_provider_reconciliation'])];
 task.updated_at=stamp;
 next.revision+=1;
 next.updated_at=stamp;
 return refreshGoal(next,now);
}

export async function executePersistedGoalWork({
 filePath,workKey,registry,context={},trustedPublicKeys={},now=new Date()
}={}){
 if(!clean(filePath)||!clean(workKey))throw Error('filePath and workKey required');
 const workName=clean(workKey);
 const latest=await readGoalState(filePath);
 const planned=latest.tasks.find(t=>t.work_key===workName);
 if(!planned)throw Error('unknown work key');
 const selection=boundAdapter(registry,planned);
 if(!selection.adapter){
  return {schema:'evercraft.goal.durable-dispatch-receipt.v1',
   executed:false,ok:false,reason:selection.reason,
   state:goalSnapshot(latest),dispatch_authorized:false};
 }
 const adapter=selection.adapter;
 // Read/validate/start/persist happens in a CAS transaction. Never keep the
 // file lock during the network call. If the write fails, do NOT call adapter.
 const started=await mutateGoalState(filePath,state=>{
  const current=state.tasks.find(t=>t.work_key===workName);
  if(!current)throw Error('unknown work key');
  const nextSelection=boundAdapter(registry,current);
  if(nextSelection.adapter!==adapter)throw Error('adapter eligibility changed');
  return startGoalWork({state,workKey:workName,trustedPublicKeys,now});
 });
 const startedState=started.state;
 const liveWork=startedState.tasks.find(t=>t.work_key===workName);
 const attempt=liveWork.attempt;
 let outcome,exception=false;
 try {
  outcome=await adapter.execute({
   work:structuredClone(liveWork),
   goal:goalSnapshot(startedState),
   context:structuredClone(context),
  });
 } catch {
  // Never store provider error bodies: these may contain tokens or customer PII.
  outcome={result:'exception'};
  exception=true;
 }
 const result=clean(outcome?.result).toLowerCase();
 const receiptRef=clean(outcome?.receipt_ref);
 const evidenceRefs=unique(outcome?.evidence_refs);
 const localReadonlyComplete=adapter.authority==='read-only'&&
   !adapter.human_gate_required&&!liveWork.human_gate_required&&
   result==='complete'&&(Boolean(receiptRef)||evidenceRefs.length>0)&&!exception;

 // A provider's self-reported complete, skipped, retry, or exception is NOT
 // an independently checked external outcome. Only demonstrably scoped
 // read-only work may complete from its local adapter receipt.
 const finished=await mutateGoalState(filePath,state=>localReadonlyComplete
  ? recordGoalOutcome({state,workKey:workName,expectedAttempt:attempt,
     result:'complete',receiptRef,evidenceRefs,now})
  : quarantineUncertainOutcome({state,workKey:workName,
     expectedAttempt:attempt,sourceResult:result||'invalid',now})
 );
 return {
  schema:'evercraft.goal.durable-dispatch-receipt.v1',
  mission_key:finished.state.mission_key,goal_key:finished.state.goal_key,
  work_key:workName,attempt,attempt_key:liveWork.attempt_key,
  adapter_capability_key:adapter.capability_key,
  source_adapter_authority:adapter.authority,
  execution_checkpoint_persisted:true,
  start_storage_revision:started.receipt.revision,
  end_storage_revision:finished.receipt.revision,
  executed:true,ok:localReadonlyComplete,
  state:goalSnapshot(finished.state),
  result:localReadonlyComplete?'local_readonly_completed':'provider_reconciliation_required',
  external_effect_verified:false,
  provider_outcome_independently_refetched:false,
  replay_authorized:false,
  side_effect_authority_from_this_receipt:false,
 };
}
