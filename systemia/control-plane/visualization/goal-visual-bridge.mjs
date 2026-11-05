/**
 * Systemia goal-store -> Living Graph v0.1.
 *
 * Read-only projection of an operator-selected local goal-state file.
 * Does not authenticate runtime truth, paid state, signatures, or Passport.
 * All raw customer/mission/agent/receipt identifiers remain excluded.
 */
import { lstat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readGoalState } from '../../organism/goal-store.mjs';

export const SNAPSHOT_SCHEMA = 'evercraft.systemia.visual-snapshot.v1';
const GOAL_SCHEMA = 'evercraft.goal.state.v1';
const MAX_INPUT_BYTES = 524288;
const MAX_TASKS = 50;
const MAX_AGE_MS = 15*60*1000;
const FUTURE_SKEW_MS = 2*60*1000;
const STATES = new Set(['planning','ready','waiting','executing','blocked','complete','skipped','pending']);
const isObject = x => x!==null && typeof x==='object' && !Array.isArray(x);
const requireValid = (condition,reason) => { if(!condition)throw Error('goal_visual_bridge_'+reason); };
const validDate = x => typeof x==='string' && x.length<=40 && Number.isFinite(Date.parse(x)) && new Date(x).toISOString()===x;
const present = x => typeof x==='string' && x.trim().length>0;

function classify({status,ageMs,hasReceipt,gate,providedTimestamp}){
  if(!providedTimestamp || ageMs< -FUTURE_SKEW_MS)return 'unknown';
  if(ageMs>MAX_AGE_MS)return 'stale';
  if(status==='blocked'||gate)return 'held';
  if(status==='complete'&&!hasReceipt)return 'held_missing_receipt';
  if(status==='complete')return 'reported_complete_unverified';
  if(status==='executing')return 'reported_executing_unverified';
  if(status==='ready'||status==='pending')return 'reported_pending_unverified';
  if(status==='skipped')return 'reported_skipped_unverified';
  return 'unknown';
}

/**
 * Convert a goal state to a read-only public-safe structure.
 * The output may be inspected offline, but it has NOT passed Passport,
 * Context Fabric, independent outcome verification or signature checks.
 */
export function projectGoalToVisualSnapshot(state,{now=new Date()}={}){
  requireValid(isObject(state)&&state.schema===GOAL_SCHEMA,'schema');
  requireValid(present(state.goal_key)&&present(state.mission_key),'identity');
  requireValid(Number.isSafeInteger(state.revision)&&state.revision>=1,'revision');
  requireValid(Array.isArray(state.tasks)&&state.tasks.length<=MAX_TASKS,'task_count');
  requireValid(validDate(state.updated_at),'updated_at');
  requireValid(Object.values(STATES).length>0,'state_config');
  const clock=now instanceof Date?now.getTime():new Date(now).getTime();
  requireValid(Number.isFinite(clock),'clock');
  const recordAge=clock-Date.parse(state.updated_at);
  const sourceFreshness=recordAge>MAX_AGE_MS?'stale':recordAge< -FUTURE_SKEW_MS?'unknown':'recent';
  const taskIds=new Map();
  for(let i=0;i<state.tasks.length;i++){
    const task=state.tasks[i];
    requireValid(isObject(task)&&present(task.work_key)&&task.work_key.length<=256,'work_key');
    requireValid(!taskIds.has(task.work_key),'duplicate_work_key');
    taskIds.set(task.work_key,'task-'+String(i+1).padStart(3,'0'));
    requireValid(Array.isArray(task.dependency_keys),'dependencies');
    requireValid(task.dependency_keys.length<=MAX_TASKS,'dependency_count');
    requireValid(Array.isArray(task.receipt_refs),'receipt_refs');
    requireValid(Array.isArray(task.evidence_refs),'evidence_refs');
    requireValid(task.receipt_refs.length<=500&&task.evidence_refs.length<=500,'reference_count');
    requireValid(STATES.has(task.status),'task_status');
  }
  const nodes=[{
    id:'mission',name:'Mission (redacted)',kind:'mission',
    status:sourceFreshness==='stale'?'stale':sourceFreshness==='unknown'?'unknown':'reported_state_unverified',
    observed_at:state.updated_at,
    timestamp_source:'persisted_goal_state.updated_at',
    receipt_id:null, source:'systemia.goal-store',
    evidence_state:'local_file_only_unverified',
    reported_status:typeof state.status==='string'&&STATES.has(state.status)?state.status:'unknown',
    source_revision:state.revision,
  }];
  const edges=[];
  let receiptCount=0,evidenceCount=0,missingReceiptCount=0,heldCount=0;
  for(let i=0;i<state.tasks.length;i++){
    const task=state.tasks[i];
    const taskId=taskIds.get(task.work_key);
    const hasTime=validDate(task.updated_at);
    const when=hasTime?task.updated_at:state.updated_at;
    const age=clock-Date.parse(when);
    const hasReceipt=task.receipt_refs.length>0;
    const gate=task.human_gate_unresolved===true||task.recovery_hold!=null;
    const status=classify({status:task.status,ageMs:age,hasReceipt,gate,providedTimestamp:hasTime});
    if(status==='held'||status==='held_missing_receipt')heldCount++;
    if(task.status==='complete'&&!hasReceipt)missingReceiptCount++;
    receiptCount+=task.receipt_refs.length;
    evidenceCount+=task.evidence_refs.length;
    nodes.push({
      id:taskId,name:'Work '+String(i+1).padStart(3,'0'),kind:'mission_task',
      status,observed_at:when,
      timestamp_source:hasTime?'persisted_task.updated_at':'persisted_goal_state.updated_at_fallback',
      receipt_id:null, source:'systemia.goal-store',
      reported_status:task.status,
      evidence_state:'local_file_only_unverified',
      receipt_reference_count:task.receipt_refs.length,
      evidence_reference_count:task.evidence_refs.length,
      human_gate_unresolved:task.human_gate_unresolved===true,
      recovery_hold_present:task.recovery_hold!=null,
    });
    edges.push({from:'mission',to:taskId,relationship:'contains_declared'});
    for(const dep of task.dependency_keys){
      requireValid(taskIds.has(dep),'unknown_dependency');
      edges.push({from:taskId,to:taskIds.get(dep),relationship:'depends_on_declared'});
    }
  }
  return {
    schema:SNAPSHOT_SCHEMA,
    observed_at:state.updated_at,
    exported_at:new Date(clock).toISOString(),
    source:'systemia.goal-store.operator-local-projection.v1',
    provenance:{
      trust:'operator_selected_local_file_unverified',
      source_schema:GOAL_SCHEMA,
      source_revision:state.revision,
      freshness:sourceFreshness,
      persisted_observation_at:state.updated_at,
      signature_verified:false,
      passport_authorization_verified:false,
      independent_effect_verified:false,
      execution_authority_granted:false,
      production_promotion_allowed:false,
      raw_content_exported:false,
      note:'This snapshot shows claims in a locally persisted goal state, not independently verified runtime or outcome evidence.'
    },
    summary:{
      tasks:state.tasks.length,
      reported_receipt_references:receiptCount,
      reported_evidence_references:evidenceCount,
      completed_tasks_missing_receipt_reference:missingReceiptCount,
      held_tasks:heldCount,
      verified_receipts:0,
    },
    nodes,edges,
    // Caller-provided references are not independently authenticated receipts.
    receipts:[],
  };
}

export async function exportGoalVisualSnapshot({inputFile,outputFile,now=new Date()}={}){
  requireValid(present(inputFile)&&present(outputFile),'files_required');
  const inputPath=resolve(inputFile),outputPath=resolve(outputFile);
  requireValid(inputPath!==outputPath,'same_input_output');
  const inputInfo=await lstat(inputPath);
  requireValid(inputInfo.isFile()&&!inputInfo.isSymbolicLink()&&inputInfo.size<=MAX_INPUT_BYTES,'unsafe_input_file');
  const state=await readGoalState(inputPath);
  const output=projectGoalToVisualSnapshot(state,{now});
  await writeFile(outputPath,JSON.stringify(output,null,2)+'\n',{flag:'wx',mode:0o600});
  return output;
}

async function main(){
  if(process.argv.length!==4)throw Error('Usage: node goal-visual-bridge.mjs GOAL_STATE.json OUTPUT.json');
  const data=await exportGoalVisualSnapshot({inputFile:process.argv[2],outputFile:process.argv[3]});
  console.log(JSON.stringify({ok:true,schema:data.schema,task_count:data.summary.tasks,receipt_references_unverified:data.summary.reported_receipt_references,source_freshness:data.provenance.freshness,output_created:true,execution_authority_granted:false}));
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(error=>{console.error(JSON.stringify({ok:false,error:error.message}));process.exitCode=1;});
}
