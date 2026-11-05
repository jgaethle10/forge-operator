/**
 * Source-only Saban/Goal Store convergence for the signed MicroSeed canary.
 * Reuses Systemia's existing durable goal store and attempt transitions.
 * Does not mint authority, enroll devices, or permit production dispatch.
 */
import {readGoalState,mutateGoalState} from '../organism/goal-store.mjs';
import {startGoalWork,recordGoalOutcome} from '../organism/goal-runtime.mjs';
import {fencedSchedulerWorkDigest} from './fenced-local-scheduler.mjs';

const DIGEST=/^sha256:[0-9a-f]{64}$/;
const goalReceipt=result=>'saban-node:'+result?.worker_receipt?.receipt_hash;

function checkGoal(goal,job,plan,phase){
  if(goal?.schema!=='evercraft.goal.state.v1'||
      !plan?.mission_key||!plan?.goal_key||
      goal.mission_key!==plan.mission_key||goal.goal_key!==plan.goal_key||
      !Array.isArray(goal.tasks)||goal.tasks.length!==1||
      !Array.isArray(goal.next_work_keys)){
    throw Error('fenced_systemia_durable_mission_identity_hold');
  }
  const task=goal.tasks[0];
  const digest=fencedSchedulerWorkDigest(job);
  if(task.work_key!==job.job_id ||
     task.work_type!=='analyze' ||
     task.provider_key!=='saban-fenced-microseed' ||
     task.dedupe_key!=='saban-fenced:'+digest ||
     task.mission_key!==goal.mission_key||
     task.goal_key!==goal.goal_key ||
     task.human_gate_required!==false ||
     task.human_gate_unresolved!==false ||
     (task.authorization_refs||[]).length>0 ||
     (task.dependency_keys||[]).length>0 ||
     task.recovery_hold){
    throw Error('fenced_systemia_goal_job_binding_hold');
  }
  if(phase==='ready'){
    if(task.status!=='pending'||task.attempt!==0||
       !goal.next_work_keys.includes(task.work_key)){
      throw Error('fenced_systemia_goal_not_ready');
    }
  } else if(phase==='executing'){
    if(task.status!=='executing'||task.attempt!==1||
       task.attempt_key!==task.dedupe_key+':attempt:1'){
      throw Error('fenced_systemia_attempt_checkpoint_missing');
    }
  } else if(phase==='complete'){
    const expected=goalReceipt(job.result);
    if(!DIGEST.test(String(job.result?.worker_receipt?.receipt_hash||''))||
       task.status!=='complete'||task.attempt!==1||
       !task.receipt_refs?.includes(expected)){
      throw Error('fenced_systemia_completion_receipt_mismatch');
    }
  } else throw Error('fenced_systemia_unknown_phase');
  return task;
}

export async function verifyFencedGoalAtPreflight({filePath,job,plan}={}){
  if(typeof filePath!=='string'||!filePath.trim())throw Error('fenced_systemia_durable_goal_file_required');
  const stored=await readGoalState(filePath);
  // A completed Saban job must agree with Systemia's durable outcome.
  // Held Saban jobs must NEVER be reset or dispatched by this integration.
  if(job?.state==='queued')checkGoal(stored,job,plan,'ready');
  else if(job?.state==='completed')checkGoal(stored,job,plan,'complete');
  else if(job?.state==='dead_letter'){
    checkGoal(stored,job,plan,'executing');
  } else throw Error('fenced_systemia_unknown_saban_state');
  return {goal_key:stored.goal_key,mission_key:stored.mission_key,
    revision:stored.revision,durable_store_checked:true,
    production_execution_authorized:false};
}

export async function checkpointFencedGoalAttempt({filePath,job,plan,now=new Date()}={}){
  const {state,receipt}=await mutateGoalState(filePath,current=>{
    checkGoal(current,job,plan,'ready');
    return startGoalWork({state:current,workKey:job.job_id,now});
  },{now});
  checkGoal(state,job,plan,'executing');
  return {revision:receipt.revision,attempt:1,
    checkpoint_persisted:true,production_execution_authorized:false};
}

export async function recordFencedGoalCompletion({
  filePath,job,plan,result,now=new Date()
}={}){
  const resultHash=result?.worker_receipt?.receipt_hash;
  if(!DIGEST.test(String(resultHash||'')))throw Error('fenced_systemia_signed_result_required');
  const receiptRef=goalReceipt({result});
  const {state,receipt}=await mutateGoalState(filePath,current=>{
    checkGoal(current,job,plan,'executing');
    return recordGoalOutcome({
      state:current,workKey:job.job_id,expectedAttempt:1,
      result:'complete',receiptRef,
      evidenceRefs:[],now
    });
  },{now});
  const finished={...job,result,state:'completed'};
  checkGoal(state,finished,plan,'complete');
  return {revision:receipt.revision,receipt_ref:receiptRef,
    systemia_durable_goal_completed:true,
    physical_field_authority:false,customer_delivery_verified:false};
}
