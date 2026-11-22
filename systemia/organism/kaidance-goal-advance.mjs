/**
 * One admitted Systemia goal task per existing KAIDANCE five-minute invocation.
 * This is a resident opt-in to the EXISTING service, not another scheduler.
 * The only admitted adapter consumes a fresh, locally executed Worlds proof.
 * No model code-writing, payments, outreach, publishing or remote side effects.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readGoalState} from './goal-store.mjs';
import {refreshGoal} from './goal-runtime.mjs';
import {createCapabilityRegistry} from './capability-runtime.mjs';
import {executePersistedGoalWork} from './goal-durable-dispatch.mjs';
import {sourceFingerprint} from './kaidance-source-fingerprint.mjs';

const WORK_TYPE='worlds-source-proof';
const PROOF_MAX_AGE_MS=15*60*1000;
const hold=(reason,goalKey=null)=>({
 schema:'evercraft.kaidance.admitted-goal-beat.v1',
 configured:Boolean(goalKey),executed:false,ok:false,reason,
 goal_key:goalKey,work_key:null,external_effect_verified:false,
 code_changes:0,production_deployments:0,provider_deliveries:0,
});

function privateGoalFile(goalFile,sourceRoot){
 if(typeof goalFile!=='string'||!path.isAbsolute(goalFile))throw Error('absolute_private_goal_file_required');
 const file=path.resolve(goalFile),root=fs.realpathSync(sourceRoot);
 const real=fs.realpathSync(file);
 if(file!==real||real===root||real.startsWith(root+path.sep))throw Error('private_goal_outside_checkout_required');
 const info=fs.lstatSync(file);
 if(!info.isFile()||info.isSymbolicLink()||(info.mode&0o077)!==0)throw Error('private_goal_file_mode_0600_required');
 return file;
}
function validateWorldsProof({report,sourceRoot,now}){
 if(report?.schema!=='evercraft.kaidance.company-heartbeat.v1')return null;
 const observed=Date.parse(report.observed_at),at=new Date(now).getTime();
 if(!Number.isFinite(at)||!Number.isFinite(observed)||observed>at+60000||
    at-observed>PROOF_MAX_AGE_MS)return null;
 if(report.proof?.status!=='passed'||report.proof?.executed!==true)return null;
 const lane=report.lanes?.find(x=>x.lane_key==='worlds');
 if(lane?.source_proof?.tests_verified!==true)return null;
 const manifest=JSON.parse(fs.readFileSync(path.join(sourceRoot,'registry/kaidance-company-lanes.v1.json'),'utf8'));
 const worlds=manifest.lanes?.find(x=>x.lane_key==='worlds');
 if(!worlds?.source_files?.length)return null;
 const actual=sourceFingerprint(sourceRoot,worlds.source_files);
 if(actual!==lane.source_proof.source_fingerprint)return null;
 const digest='sha256:'+createHash('sha256').update(JSON.stringify({
  observed_at:report.observed_at,worlds_fingerprint:actual,
  status:report.proof.status,executed:report.proof.executed
 })).digest('hex');
 return {fingerprint:actual,digest};
}

/**
 * Goal files must have been independently admitted through Systemia goal-cli.
 * We neither synthesize missions from product inventory nor auto-approve gates.
 * Existing durable dispatch checkpoints before invoking its read-only adapter.
 */
export async function advanceAdmittedCompanyGoal({
 goalFile='',companyReport=null,sourceRoot=process.cwd(),now=new Date(),
 dispatch=executePersistedGoalWork
}={}){
 if(!goalFile)return hold('private_goal_not_configured');
 const file=privateGoalFile(goalFile,sourceRoot);
 const state=await readGoalState(file);
 if(!state.mission_key||!state.goal_key||!Array.isArray(state.tasks))throw Error('invalid_admitted_goal_state');
 if(state.status==='complete')return {...hold('goal_complete',state.goal_key),completed_goal:true};
 const ready=refreshGoal(state,now).next_work_keys;
 const work=state.tasks.find(x=>ready.includes(x.work_key)&&
  x.work_type===WORK_TYPE&&x.status==='pending'&&x.attempt===0&&
  !x.human_gate_required&&!x.human_gate_unresolved&&!x.impact&&
  !x.provider_key&&!x.recovery_hold);
 if(!work)return hold('no_admitted_readonly_work_ready',state.goal_key);
 const proof=validateWorldsProof({report:companyReport,sourceRoot,now});
 if(!proof)return hold('fresh_executed_worlds_proof_required',state.goal_key);
 const registry=createCapabilityRegistry([{
  capability_key:'kaidance-worlds-source-proof',
  work_types:[WORK_TYPE],authority:'read-only',human_gate_required:false,
  provider_key:'',
  execute:async()=>({
   result:'complete',
   receipt_ref:'source:kaidance-worlds:'+proof.digest,
   evidence_refs:['source:worlds:'+proof.fingerprint],
  }),
 }]);
 const receipt=await dispatch({filePath:file,workKey:work.work_key,registry,now});
 return {
  schema:'evercraft.kaidance.admitted-goal-beat.v1',
  configured:true,goal_key:state.goal_key,mission_key:state.mission_key,
  work_key:work.work_key,executed:receipt.executed===true,ok:receipt.ok===true,
  reason:receipt.result||receipt.reason||'held',
  attempt_key:receipt.attempt_key||null,
  goal_status:receipt.state?.status||null,
  evidence_refs:receipt.ok===true?[proof.digest,proof.fingerprint]:[],
  external_effect_verified:false,code_changes:0,production_deployments:0,provider_deliveries:0,
 };
}
export function goalBeatMissionSnapshot(beat,now=new Date()){
 const succeeded=beat?.executed===true&&beat?.ok===true;
 const attempted=beat?.executed===true;
 return {
  schema:'evercraft.kaidance.mission-snapshot.v1',
  snapshot_ref:'sha256:'+createHash('sha256').update(JSON.stringify({
   at:new Date(now).toISOString(),goal:beat?.goal_key||'',work:beat?.work_key||'',
   attempt:beat?.attempt_key||'',ok:succeeded,reason:beat?.reason||''
  })).digest('hex'),
  observed_at:new Date(now).toISOString(),
  counts:{scanned:beat?.configured?1:0,changed:succeeded?1:0,
   admitted:attempted?1:0,held:!succeeded&&beat?.configured&&!beat?.completed_goal?1:0},
  evidence_refs:succeeded?beat.evidence_refs:[],
 };
}
