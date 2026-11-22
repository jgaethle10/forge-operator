// The first real KAIDANCE -> Systemia durable goal -> registered Saban
// read-only assignment. This reviews the *owned Mossmere source bridge*;
// it is not code generation, public deployment, a full 23-role swarm, or a
// review of live Seattle/Yakima terrain.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {initialWorld} from '../../public/worlds/world-core.mjs';
import {toEngineWorld} from '../../public/worlds/world-bridge.mjs';
import {loadMultiplicationRegistry,resolveMultiplicationContract} from '../saban/multiplier.mjs';
import {admitMultiplicationRequest} from '../saban/admission.mjs';
import {runRegisteredAssignment} from '../saban/registered-worker.mjs';
import {createGoalState,admitGoalPlan,goalSnapshot} from './goal-runtime.mjs';
import {createGoalStateFile,readGoalState} from './goal-store.mjs';
import {createCapabilityRegistry} from './capability-runtime.mjs';
import {executePersistedGoalWork} from './goal-durable-dispatch.mjs';

const DEFAULT_ROOT=fileURLToPath(new URL('../../',import.meta.url));
const INPUTS=Object.freeze([
 'public/worlds/world-core.mjs','public/worlds/world-bridge.mjs',
 'systemia/world-engine/saban-adapter.mjs','systemia/saban/registered-worker.mjs',
 'systemia/saban/multiplication-registry.json'
]);
const WORK='worlds-mossmere-source-architect-review';
const MISSION='evercraft-worlds-source-development';
const hash=value=>createHash('sha256').update(value).digest('hex');
const makeRef=value=>'sha256:'+hash(value);
export function worldsSabanSourceFingerprint(root=DEFAULT_ROOT){
 const h=createHash('sha256');
 for(const relative of INPUTS){
  const file=path.join(path.resolve(root),relative);
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink())throw Error('kaidance_worlds_saban_source_untrusted');
  h.update(relative+'\0');
  h.update(fs.readFileSync(file));
  h.update('\0');
 }
 return 'sha256:'+h.digest('hex');
}
function privatePath(file){
 const base=path.dirname(file);
 fs.mkdirSync(base,{recursive:true,mode:0o700});
 if(fs.lstatSync(base).isSymbolicLink())throw Error('kaidance_saban_private_dir_symlink');
 if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error('kaidance_saban_private_file_symlink');
}
function atomicJson(file,value){
 privatePath(file);
 const temp=file+'.'+process.pid+'.'+randomBytes(6).toString('hex')+'.tmp';
 try{fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(temp,file)}
 finally{if(fs.existsSync(temp))fs.unlinkSync(temp)}
}
export function makeSabanWorldReviewGoal(fingerprint,now=new Date()){
 if(!/^sha256:[a-f0-9]{64}$/.test(fingerprint))throw Error('kaidance_worlds_saban_fingerprint_invalid');
 const goalKey='mossmere-engine-review-'+fingerprint.slice(7,31);
 const plan=[{work_key:WORK,work_type:'worlds_source_architecture_review',
  dedupe_key:MISSION+'|'+fingerprint,
  title:'Review canonical Mossmere World Engine source with registered Saban architect',
  assigned_agents:['saban:world-engine-review:engine_architect'],
  dependency_keys:[],human_gate_required:false,impact:'read_only_source_review'}];
 return admitGoalPlan({
  state:createGoalState({goalKey,missionKey:MISSION,
   objective:'Verify the owned Mossmere World Engine source architecture under the same persistent Kaidance goal',
   successCondition:'Read-only Saban architect receipt matches canonical world schema and source fingerprint',
   contextRefs:['source:public/worlds/world-core.mjs','source:public/worlds/world-bridge.mjs',fingerprint],now}),
  plan,now
 });
}
export async function runKaidanceWorldsSabanReview({
 root=DEFAULT_ROOT,outDir,now=new Date(),registeredAssignment=runRegisteredAssignment,
 persistedDispatch=executePersistedGoalWork
}={}){
 if(!outDir||!path.isAbsolute(outDir))throw Error('kaidance_saban_private_absolute_output_required');
 const at=new Date(now);
 if(!Number.isFinite(at.getTime()))throw Error('kaidance_saban_clock_invalid');
 const repo=path.resolve(root),out=path.resolve(outDir);
 if(out===repo||out.startsWith(repo+path.sep)&&!out.includes(path.sep+'artifacts'+path.sep))
  throw Error('kaidance_saban_output_not_allowlisted');
 const fingerprint=worldsSabanSourceFingerprint(repo);
 const desired=makeSabanWorldReviewGoal(fingerprint,at);
 const file=path.join(out,'goals',desired.goal_key+'.json');
 privatePath(file);
 try{await createGoalStateFile(file,desired,{now:at})}
 catch(error){
  // Only a truly concurrent create can be reused. A corrupt or conflicting
  // preexisting goal is never overwritten or silently promoted.
  if(!fs.existsSync(file))throw error;
 }
 const stored=await readGoalState(file);
 if(stored.goal_key!==desired.goal_key||stored.mission_key!==MISSION||
    stored.tasks.length!==1||stored.tasks[0].work_key!==WORK||
    !stored.context_refs.includes(fingerprint)||stored.tasks[0].dedupe_key!==MISSION+'|'+fingerprint)
  throw Error('kaidance_saban_existing_goal_identity_conflict');

 const reg=loadMultiplicationRegistry(path.join(repo,'systemia/saban/multiplication-registry.json'));
 const contract=resolveMultiplicationContract('world-engine-review',reg);
 if(contract.side_effects?.default!=='deny'||
    contract.side_effects?.external_network!==false||
    contract.side_effects?.production_mutation!==false||
    contract.side_effects?.automatic_publication!==false)
  throw Error('kaidance_saban_review_contract_not_read_only');
 const admission=admitMultiplicationRequest({contract,
  requestedLogicalAgents:1,requestedPhysicalWorkers:1,requestedWorkItems:1,
  requestedAttempts:1,budget:{max_logical_agents:1,max_physical_workers:1,
   max_work_items:1,max_attempts_per_job:1}});
 if(!admission.admitted||admission.grant.logical_agents!==1||
    admission.grant.physical_workers!==1)
  throw Error('kaidance_saban_review_capacity_refused');

 let result=null,actuallyRan=false;
 if(stored.status!=='complete'&&stored.next_work_keys.includes(WORK)){
  const registry=createCapabilityRegistry([{
   capability_key:'evercraft.worlds.saban.source-architect',
   authority:'read-only',work_types:['worlds_source_architecture_review'],
   human_gate_required:false,
   execute:async({work})=>{
    actuallyRan=true;
    const world=toEngineWorld(initialWorld());
    if(world.schema!=='evercraft.world-engine.world.v1'||world.id!=='worlds-mossmere-v1')
     throw Error('kaidance_saban_world_bridge_contract_invalid');
    const assignment={agent_id:'kaidance-worlds-engine-architect-v1',
     idempotency_key:work.attempt_key,role:'engine_architect',
     work:{kind:'world_engine_review',key:world.id},
     item:{raw:{world}}};
    const evidence=await registeredAssignment({
     software:'world-engine-review',assignment,rootDir:repo,executionContext:{}
    });
    const note=evidence?.result;
    if(evidence?.software_id!=='world-engine-review'||
      note?.schema!=='evercraft.world-engine.saban-review-note.v1'||
      note?.status!=='completed'||note?.role!=='engine_architect'||
      note?.world_id!=='worlds-mossmere-v1'||(note?.findings||[]).length||
      note?.boundaries?.no_publication_authority!==true||
      note?.boundaries?.no_payment_authority!==true||
      note?.boundaries?.no_canon_mutation!==true)
      throw Error('kaidance_saban_registered_review_not_accepted');
    const receiptRef=makeRef(JSON.stringify({fingerprint,
      assignment_key:work.attempt_key,software:evidence.software_id,
      role:note.role,world_id:note.world_id,review:note.review}));
    return {result:'complete',receipt_ref:receiptRef,
     evidence_refs:[fingerprint,'saban:registered:world-engine-review:engine_architect']};
   }
  }]);
  result=await persistedDispatch({filePath:file,workKey:WORK,registry,
   now:at,context:{source_fingerprint:fingerprint}});
 }
 const saved=await readGoalState(file);
 const complete=saved.tasks[0].status==='complete';
 const report={schema:'evercraft.kaidance.saban-world-review.v1',
  observed_at:at.toISOString(),mission_key:MISSION,goal_key:desired.goal_key,
  source_fingerprint:fingerprint,source:'owned_mossmere_world_builder_to_engine_v1',
  worker_kind:'local_registered_saban_assignment',
  workload:'world-engine-review',review_role:'engine_architect',
  registered_contract_verified:true,capacity_admission_verified:true,
  goal_checkpoint_present:saved.revision>=2,
  state:saved.tasks[0].status,attempt:saved.tasks[0].attempt,
  actual_assignment_ran_this_cycle:actuallyRan,
  local_readonly_completed:complete,
  new_verified_source_review_this_cycle:actuallyRan&&result?.ok===true,
  receipt_refs:saved.tasks[0].receipt_refs||[],
  execution_receipt_verified:complete&&(saved.tasks[0].receipt_refs||[]).length>0,
  source_code_changes:0,features_deployed:0,
  physical_nodeseed_dispatched:false,
  full_23_role_saban_review:false,
  claimed_autonomous_code_generation:false,
  payment_mutations:0,publication_actions:0,
  existing_goal_reused:!actuallyRan,
  operator_reconciliation_required:Boolean(saved.tasks[0].recovery_hold)
 };
 const changed=report.new_verified_source_review_this_cycle?1:0;
 const held=!complete?1:0;
 const snapshot={schema:'evercraft.kaidance.mission-snapshot.v1',
  snapshot_ref:makeRef(JSON.stringify({fingerprint,goal:desired.goal_key,
   revision:saved.revision,status:saved.status,changed,held})),
  observed_at:at.toISOString(),
  counts:{scanned:1,changed:Math.max(changed,held),admitted:changed,held},
  evidence_refs:[fingerprint,...(saved.tasks[0].receipt_refs||[])].slice(0,20)};
 atomicJson(path.join(out,'latest.json'),report);
 atomicJson(path.join(out,'mission-snapshot.json'),snapshot);
 return {report,snapshot,goal:goalSnapshot(saved)};
}
