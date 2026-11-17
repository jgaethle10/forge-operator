// NextGen-only registered Compute workload for Infinite Classroom.
// No arbitrary command/URL/source, no learner input, no service management.
// Execution is disabled unless the owner has enabled this exact device capability.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {makeLocalLlamaTutor} from './tutor-runtime.mjs';

export const CLASSROOM_NODE_WORKLOAD='systemia.classroom-nextgen-proof.v1';
const NODE='evercraft-node002-nextgen';
const SCHEMA='evercraft.classroom.nextgen-probe-request.v1';
const SYNTHETIC='I want to learn algebra for fun. Please give one gentle example with marbles, then ask me a question.';
const sha=value=>'sha256:'+createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?
 Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
const digest=value=>sha(JSON.stringify(stable(value)));
function fail(code){throw Error(code)}
export function validateClassroomProbePayload(payload){
 if(!payload||typeof payload!=='object'||Array.isArray(payload))fail('classroom_payload_invalid');
 const keys=Object.keys(payload).sort();
 if(keys.join(',')!=='operation,schema')fail('classroom_payload_unrecognized_fields');
 if(payload.schema!==SCHEMA||!['readiness','synthetic_turn'].includes(payload.operation))
  fail('classroom_operation_not_allowed');
 return {schema:SCHEMA,operation:payload.operation};
}
function safeDirectory(directory){
 const st=fs.lstatSync(directory);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0)fail('classroom_state_not_private');
}
function saveExclusive(file,data){
 const dir=path.dirname(file);
 safeDirectory(dir);
 const fd=fs.openSync(file,'wx',0o600);
 try{fs.writeFileSync(fd,JSON.stringify(data)+'\n');fs.fsyncSync(fd)}
 finally{fs.closeSync(fd)}
}
export function createClassroomNodeProbeWorker({
 nodeId,
 stateDir,
 port=Number(process.env.EVERCRAFT_CLASSROOM_LLAMA_PORT||8080),
 enabled=process.env.EVERCRAFT_CLASSROOM_NODE002_PROBE_ENABLED==='true',
 fetchImpl=globalThis.fetch,
 now=()=>new Date().toISOString(),
}={}){
 if(nodeId!==NODE)fail('classroom_expected_node002_only');
 if(!stateDir)fail('classroom_state_dir_required');
 if(!Number.isInteger(port)||port<1024||port>65535)fail('classroom_local_port_invalid');
 const folder=path.resolve(stateDir);
 const inFlight=new Map();
 function ready(){
  if(enabled!==true)fail('classroom_workload_disabled');
  if(fs.existsSync(folder))safeDirectory(folder);
  else fs.mkdirSync(folder,{recursive:true,mode:0o700});
  safeDirectory(folder);
 }
 async function model(operation){
  const origin='http://127.0.0.1:'+port;
  // Restrict even an injected transport to exact local-model endpoints;
  // hard-cap each request and forbid redirects.
  async function transport(url,options={}){
   const u=new URL(url);
   if(u.origin!==origin || !(
    (u.pathname==='/v1/models'&&options.method==='GET')||
    (u.pathname==='/v1/chat/completions'&&options.method==='POST')
   ))fail('classroom_transport_scope_denied');
   const signal=AbortSignal.any([options.signal||AbortSignal.timeout(13000),
     AbortSignal.timeout(6500)]);
   return fetchImpl(url,{...options,signal,redirect:'error'});
  }
  const backend=makeLocalLlamaTutor({origin,fetchImpl:transport});
  const validation=await backend.validate();
  if(validation.provider!=='llama.cpp'||validation.local_only!==true)
   fail('classroom_model_identity_unverified');
  const base={schema:'evercraft.classroom.node002-result.v1',
   operation, node_id:NODE, provider:'llama.cpp', origin_scope:'loopback_only',
   model_id_sha256:sha(validation.model),
   source_ref_is_deployment_proof:false,
   real_model_process_attested:false,
   youth_safety_certified:false, academic_integrity_certified:false,
   child_data_used:false, public_endpoint_opened:false};
  if(operation==='readiness')return {...base,state:'LOCAL_MODEL_METADATA_OBSERVED',
   model_response_observed:false};
  const result=await backend.infer({prompt:SYNTHETIC});
  const answer=String(result?.text||'').trim();
  if(result?.status!=='completed'||result?.provider!=='llama.cpp'||
    !/^sha256:[a-f0-9]{64}$/.test(String(result?.provider_receipt||''))||
    answer.length<10||answer.length>1700)fail('classroom_model_response_not_verified');
  return {...base,state:'SYNTHETIC_LOCAL_API_RESPONSE_OBSERVED',
   model_response_observed:true,
   model_response_sha256:sha(answer),
   model_response_char_count:answer.length,
   response_relevance_human_review_pending:true};
 }
 async function execute({payload,idempotencyKey}={}){
  ready();
  const request=validateClassroomProbePayload(payload);
  const key=String(idempotencyKey||'');
  if(!/^[A-Za-z0-9._:-]{12,128}$/.test(key))fail('classroom_idempotency_key_invalid');
  const file=path.join(folder,sha(NODE+'|'+key).slice(7)+'.json');
  const request_hash=digest({nodeId:NODE,key,request});
  if(fs.existsSync(file)){
   const st=fs.lstatSync(file);
   if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0)
    fail('classroom_receipt_unsafe');
   const existing=JSON.parse(fs.readFileSync(file,'utf8'));
   if(existing.request_hash!==request_hash)fail('classroom_idempotency_conflict');
   if(existing.schema!=='evercraft.classroom.node002-worker-receipt.v1'||
      existing.receipt_hash!==digest(Object.fromEntries(Object.entries(existing)
       .filter(([k])=>k!=='receipt_hash'))))fail('classroom_receipt_integrity_error');
   return {...existing,deduplicated:true};
  }
  const active=inFlight.get(key);
  if(active){
   if(active.hash!==request_hash)fail('classroom_idempotency_conflict');
   const receipt=await active.promise;
   return {...receipt,deduplicated:true};
  }
  const promise=(async()=>{
   const result=await model(request.operation);
   const body={schema:'evercraft.classroom.node002-worker-receipt.v1',
    node_id:NODE,workload_class:CLASSROOM_NODE_WORKLOAD,
    idempotency_key:key,request_hash,result,
    deduplicated:false,registered_workload_only:true,
    completed_at:now()};
   const receipt={...body,receipt_hash:digest(body)};
   try{saveExclusive(file,receipt)}
   catch(e){if(e?.code==='EEXIST')fail('classroom_result_conflict');throw e}
   return receipt;
  })();
  inFlight.set(key,{hash:request_hash,promise});
  try{return await promise}finally{inFlight.delete(key)}
 }
 return {execute,enabled:()=>enabled===true};
}
