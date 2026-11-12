#!/usr/bin/env node
// Independent actual-NextGen local inference canary. No fake/mock model in this script.
// Run ONLY on an authorized Evercraft node with a loopback-bound llama-server.
// Synthetic learner dialogue only; raw prompts/responses not logged or persisted.
// A transport proof is NOT proof of pedagogical quality or child-safety readiness.
import {randomBytes,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync,chmodSync,statSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {createClassroomTutor} from '../systemia/classroom/tutor-core.mjs';
import {makeLocalLlamaTutor} from '../systemia/classroom/tutor-runtime.mjs';

function arg(name, fallback=''){
 const i=process.argv.indexOf(name);
 return i>=0?String(process.argv[i+1]||''):fallback;
}
const hostname=arg('--llama-origin','http://127.0.0.1:8080');
const output=arg('--receipt',
 join(homedir(),'.local/state/evercraft/classroom/',
  'nextgen-live-proof-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomBytes(3).toString('hex')+'.json'));
const execute=process.argv.includes('--execute');
const hash=x=>'sha256:'+createHash('sha256').update(String(x)).digest('hex');
function fail(message){throw new Error(message)}
function gitHead(){
 try{return execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',timeout:3000,stdio:['ignore','pipe','ignore']}).trim()}
 catch{return null}
}
function safeSave(filename,payload){
 const target=resolve(filename), folder=dirname(target);
 mkdirSync(folder,{recursive:true,mode:0o700});
 const folderMode=statSync(folder).mode;
 if((folderMode&0o077)!==0)fail('receipt_parent_directory_not_private');
 writeFileSync(target,JSON.stringify(payload,null,2)+'\n',{flag:'wx',mode:0o600});
 chmodSync(target,0o600);
 return target;
}
function nonempty(reply){
 return typeof reply==='string'&&reply.trim().length>=15&&reply.length<=1700;
}
function outputReceipt({status,model,backend,checks,blocker}){
 return {
  schema:'evercraft.infinite-classroom.actual-local-inference-canary.v1',
  state:status,
  scope:'operator_controlled_local_nextgen',
  checked_at:new Date().toISOString(),
  source_ref:gitHead(),
  source_ref_is_deployment_proof:false,
  origin_class:'127.0.0.1_loopback_only',
  provider:backend||null,
  model_ref_sha256:model?hash(model):null,
  challenges:checks,
  model_api_responses_observed:status==='LOOPBACK_MODEL_API_RESPONSES_OBSERVED',
  model_process_independently_attested:false,
  student_content_used:false,
  student_data_saved:false,
  raw_prompts_or_responses_in_receipt:false,
  learner_identity_created:false,
  homework_integrity_certified:false,
  youth_safety_certified:false,
  publicly_reachable:false,
  pedagogy_reviewed:false,
  blocker:blocker||null
 };
}
async function main(){
 if(!execute)fail('explicit_execute_required');
 const backend=makeLocalLlamaTutor({origin:hostname});
 const validated=await backend.validate();
 if(validated.provider!=='llama.cpp'||!validated.local_only)fail('owned_local_backend_unverified');
 const tutor=createClassroomTutor({infer:backend.infer});
 // Only fictional, synthetic text; no child identifiers or real homework.
 const scenarios=[
  {
   room:'math',turns:[
    'I do not have any homework. I just want to learn a little algebra.',
    'Can you explain x using marbles instead of numbers alone?'
   ]
  },
  {
   room:'reading',turns:[
    'Can you tell me a gentle original mystery about a missing key?',
    'What clue should the main character investigate next?'
   ]
  },
  {room:'science',turns:['Can you suggest a safe observation about plant growth?']},
  {room:'language',turns:['What does an adjective do? I want to describe a dragon.']},
  {room:'math',turns:['Does this really work? What kind of help can you give?']}
 ];
 const checks=[];
 for(const scenario of scenarios){
  const opened=tutor.start(scenario.room);
  try{
   let turn=0;
   for(const question of scenario.turns){
    turn++;
    const result=await tutor.say({session_id:opened.session_id,message:question,homework:false});
    if(result.source!=='owned_local_model'||result.model_receipt_verified!==true||!nonempty(result.reply))
     fail('model_dialogue_invalid');
    checks.push({
     room:scenario.room,turn,source:'real_local_inference',
     response_length_bucket:result.reply.length<90?'brief':result.reply.length<360?'short':'long',
     context_turns:result.context_turns,
     receipt_verified:true,
     relevance_human_review_pending:true
    });
   }
  }finally{tutor.close(opened.session_id)}
 }
 return outputReceipt({status:'LOOPBACK_MODEL_API_RESPONSES_OBSERVED',model:validated.model,backend:validated.provider,checks});
}
try{
 const receipt=await main();
 const saved=safeSave(output,receipt);
 process.stdout.write(JSON.stringify({
  state:receipt.state,model_api_responses_observed:receipt.model_api_responses_observed,
  model_process_independently_attested:false,
  synthetic_message_count:receipt.challenges.length,receipt_file:saved,
  youth_safety_certified:false,homework_integrity_certified:false,
  public_release_authorized:false
 },null,2)+'\n');
}catch(error){
 const reason=String(error?.message||'unknown').slice(0,110);
 // Avoid printing underlying backend error with request content or credentials.
 process.stderr.write(JSON.stringify({
  state:'HELD',reason:/^[a-z0-9_]+$/i.test(reason)?reason:'owned_model_or_receipt_unavailable',
  model_api_responses_observed:false,public_release_authorized:false
 })+'\n');
 process.exitCode=1;
}
