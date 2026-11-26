import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {planPublicDemandResearch} from './public-demand-intake.mjs';
import {capturePublicDemand} from './public-demand-capture.mjs';
import {createGoalState,admitGoalPlan} from '../organism/goal-runtime.mjs';
import {createGoalStateFile,readGoalState} from '../organism/goal-store.mjs';
import {createCapabilityRegistry} from '../organism/capability-runtime.mjs';
import {executePersistedGoalWork} from '../organism/goal-durable-dispatch.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const mission='kaidance-public-demand-research';
const workKey='capture-original-public-source';
function privateDir(dir){
 if(!path.isAbsolute(dir))throw Error('absolute_private_directory_required');
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const s=fs.lstatSync(dir);
 if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)!==0||s.uid!==process.getuid())throw Error('unsafe_private_directory');
}
function privateRead(file){
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const s=fs.fstatSync(fd);if(!s.isFile()||(s.mode&0o077)!==0||s.uid!==process.getuid()||s.size>2000000)throw Error('unsafe_private_artifact');return fs.readFileSync(fd,'utf8');}finally{fs.closeSync(fd);}
}
function publish(file,body){
 const temp=file+'.'+randomUUID()+'.tmp';
 const fd=fs.openSync(temp,'wx',0o600);
 try{fs.writeFileSync(fd,body);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 try{fs.linkSync(temp,file);const d=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}finally{fs.unlinkSync(temp);}
}
export async function runPublicDemandGoal({directory,job,browse,now=new Date()}={}){
 if(!Number.isFinite(+now)||typeof browse!=='function'||job?.stage!=='source_research_required'||job.qualified!==false||job.contact_authorized!==false||job.execution_authorized!==false)throw Error('invalid_public_demand_goal');
 const canonical=planPublicDemandResearch({hits:[{url:job.source_url,title:job.title,lane:job.lane}],now}).jobs[0];
 if(!canonical||canonical.job_ref!==job.job_ref||canonical.source_url!==job.source_url||new URL(job.source_url).search)throw Error('invalid_source_binding');
 privateDir(directory);
 const goals=path.join(directory,'goals'),captures=path.join(directory,'captures');
 privateDir(goals);privateDir(captures);
 const id=hash(JSON.stringify([canonical.job_ref,canonical.source_url,canonical.title,canonical.lane]));
 const goalKey='public-demand-'+id;
 const file=path.join(goals,goalKey+'.json'),artifact=path.join(captures,id+'.json');
 const contextRef='sha256:'+id;
 const desired=admitGoalPlan({state:createGoalState({goalKey,missionKey:mission,objective:'Capture original public purchasing source for restricted commercial research',successCondition:'Persist a source-bound capture or explicit research hold',contextRefs:[contextRef],now}),plan:[{work_key:workKey,work_type:'public_demand_source_capture',dedupe_key:mission+'|'+id,title:'Capture public purchasing evidence',assigned_agents:['systemia:public-demand-browser'],dependency_keys:[],human_gate_required:false,impact:'read_only_source_review'}],now});
 if(!fs.existsSync(file)){
  try{await createGoalStateFile(file,desired,{now});}catch(e){if(!fs.existsSync(file))throw e;}
 }
 privateRead(file);
 let saved=await readGoalState(file);
 if(saved.goal_key!==goalKey||saved.mission_key!==mission||!saved.context_refs.includes(contextRef)||saved.tasks.length!==1||saved.tasks[0].work_key!==workKey||saved.tasks[0].dedupe_key!==mission+'|'+id)throw Error('goal_identity_conflict');
 let dispatched=false;
 if(saved.next_work_keys.includes(workKey)&&saved.tasks[0].status!=='complete'){
  if(fs.existsSync(artifact))throw Error('orphan_capture_requires_reconciliation');
  const registry=createCapabilityRegistry([{capability_key:'evercraft.revenue.public-demand-capture',authority:'read-only',work_types:['public_demand_source_capture'],human_gate_required:false,execute:async({work})=>{
   dispatched=true;
   const result=await capturePublicDemand({job:canonical,browse,now});
   const body=JSON.stringify({attempt_key:work.attempt_key,assignment_ref:contextRef,capture:result});
   publish(artifact,body);
   return {result:'complete',receipt_ref:'sha256:'+hash(body),evidence_refs:[contextRef]};
  }}]);
  await executePersistedGoalWork({filePath:file,workKey,registry,now});
 }
 saved=await readGoalState(file);
 const complete=saved.tasks[0].status==='complete';
 let capture=null;
 if(complete){
  const raw=privateRead(artifact),record=JSON.parse(raw);
  if(record.assignment_ref!==contextRef||record.attempt_key!==saved.tasks[0].attempt_key||record.capture?.job_ref!==canonical.job_ref||!(saved.tasks[0].receipt_refs||[]).includes('sha256:'+hash(raw)))throw Error('capture_receipt_mismatch');
  capture=record.capture;
 }
 return {schema:'evercraft.public-demand.durable-run.v1',goal_key:goalKey,goal_state:saved.tasks[0].status,dispatched,artifact:complete?artifact:null,capture_state:capture?.state||null,http_status:capture?.http_status??null,source_url:canonical.source_url,local_receipt_verified:complete,qualified:false,contact_authorized:false,execution_authorized:false,send_performed:false};
}
