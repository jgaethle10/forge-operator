import test from 'node:test';
import assert from 'node:assert/strict';
import {startPrivateClassroomPilot,makeLocalRavenTutor,makeLocalLlamaTutor} from '../systemia/classroom/tutor-runtime.mjs';

const ACCESS='adult-pilot-authority-test-abc123456789'; // Synthetic test-only.
const AUTH={authorization:'Bearer '+ACCESS,'content-type':'application/json'};
const fakeInference=async()=>({
 status:'completed',provider:'ollama',text:'We can explore that together. What example would you like?',
 provider_receipt:'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
});
async function service(){
 return startPrivateClassroomPilot({host:'127.0.0.1',port:0,accessToken:ACCESS,
  infer:fakeInference,localModelVerified:true});
}
async function request(url,path,{method='GET',body=null,headers=AUTH}={}){
 const r=await fetch(url+path,{
  method,headers,...(body?{body:JSON.stringify(body)}:{}),redirect:'manual'
 });
 const ct=r.headers.get('content-type')||'';
 return {status:r.status,body:ct.includes('application/json')?await r.json():await r.text(),headers:r.headers};
}
test('Pilot refuses public bind, unvalidated inference and weak access token',async()=>{
 await assert.rejects(()=>startPrivateClassroomPilot({host:'0.0.0.0',accessToken:ACCESS,
  infer:fakeInference,localModelVerified:true}),/classroom_loopback_only/);
 await assert.rejects(()=>startPrivateClassroomPilot({host:'127.0.0.1',port:0,
  accessToken:ACCESS,infer:fakeInference,localModelVerified:false}),/classroom_owned_model_validation_required/);
 await assert.rejects(()=>startPrivateClassroomPilot({host:'127.0.0.1',port:0,
  accessToken:'bad',infer:fakeInference,localModelVerified:true}),/classroom_private_access_required/);
});
test('Private page is served, but API needs adult bearer token',async()=>{
 const srv=await service();
 try{
  const home=await request(srv.url,'/',{headers:{}});
  assert.equal(home.status,200);assert.match(home.body,/Math Cave/);
  assert.match(home.body,/PRIVATE SUPERVISED PILOT/);
  const noAuth=await request(srv.url,'/api/classroom/status',{headers:{}});
  assert.equal(noAuth.status,401);
  const status=await request(srv.url,'/api/classroom/status');
  assert.equal(status.status,200);
  assert.equal(status.body.model,'owned_local_model');
  assert.equal(status.body.child_safety_certified,undefined);
  assert.equal(status.body.public_youth_access,false);
  assert.equal(status.body.model_safety_certified,false);
  assert.equal(status.headers.get('access-control-allow-origin'),null);
  assert.match(status.headers.get('content-security-policy'),/connect-src 'self'/);
 }finally{await srv.close()}
});
test('Adult can start separate rooms and actually send conversational text to model adapter',async()=>{
 const srv=await service();
 try{
  const opened=await request(srv.url,'/api/classroom/session',{
   method:'POST',body:{room:'math'}});
  assert.equal(opened.status,201);
  const session=opened.body.session_id;
  assert.match(session,/^[0-9a-f-]{36}$/);
  const done=await request(srv.url,'/api/classroom/message',{method:'POST',
   body:{session_id:session,message:"I just want to learn algebra.",homework:false}});
  assert.equal(done.status,200);
  assert.match(done.body.reply,/explore that together/);
  assert.equal(done.body.source,'owned_local_model');
  assert.equal(done.body.no_mastery_awarded,true);
  const ended=await request(srv.url,'/api/classroom/end',{method:'POST',body:{session_id:session}});
  assert.equal(ended.status,200);
  const missing=await request(srv.url,'/api/classroom/message',{method:'POST',body:{session_id:session,message:'Continue please'}});
  assert.equal(missing.status,422);
  assert.equal(missing.body.error,'session_not_found');
 }finally{await srv.close()}
});
test('Cross-origin posting and oversized messages are blocked before inference',async()=>{
 const srv=await service();
 try{
  const invalidOrigin=await request(srv.url,'/api/classroom/session',{method:'POST',
   body:{room:'math'},headers:{...AUTH,origin:'https://evil.example'}});
  assert.equal(invalidOrigin.status,403);
  const over=await request(srv.url,'/api/classroom/session',{method:'POST',
   body:{room:'math',padding:'x'.repeat(6000)}});
  assert.equal(over.status,422);
  assert.equal(over.body.error,'payload_too_large'); // Parser fails closed, no storage.
 }finally{await srv.close()}
});
test('Raven adapter prohibits remote providers, and validates local Ollama before any message',async()=>{
 assert.throws(()=>makeLocalRavenTutor({origin:'https://external.example',
  token:'x'.repeat(44)}),/raven_must_be_loopback/);
 let calls=[];
 const fakeFetch=async(url,config={})=>{
  calls.push({url,config});
  const path=new URL(url).pathname;
  const data=path==='/health'?
   {ok:true,service:'raven-inference-gateway',provider:'ollama',loopback_only:true}:
   path==='/v1/validate'?{status:'available',provider:'ollama',base44_used:false,model:'local-test'}:
   {status:'completed',provider:'ollama',model:'local-test',text:'A gentle guided example',
    provider_receipt:'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'};
  return {ok:true,status:200,json:async()=>data,headers:{get:()=>null}};
 };
 const adapter=makeLocalRavenTutor({origin:'http://127.0.0.1:4322',
  token:'x'.repeat(44),fetchImpl:fakeFetch});
 const valid=await adapter.validate();
 assert.equal(valid.provider,'ollama');
 const result=await adapter.infer({request_id:'test-123',role:'classroom-private-teaching-pilot',prompt:'Welcome'});
 assert.equal(result.status,'completed');
 assert.equal(result.provider,'ollama');
 assert(calls.every(x=>x.url.startsWith('http://127.0.0.1:4322/')));
 assert(calls.some(x=>x.url.endsWith('/v1/infer')));
 const hostile=makeLocalRavenTutor({origin:'http://127.0.0.1:4322',token:'x'.repeat(44),
  fetchImpl:async()=>({ok:true,json:async()=>({
   ok:true,service:'raven-inference-gateway',provider:'openai',loopback_only:true
  })})});
 await assert.rejects(()=>hostile.validate(),/raven_local_ollama_only_required/);
});

test('Existing NextGen llama-server can be validated and queried without Raven or any remote host',async()=>{
 assert.throws(()=>makeLocalLlamaTutor({origin:'https://hosted.example'}),/llama_must_be_loopback/);
 assert.throws(()=>makeLocalLlamaTutor({origin:'http://127.0.0.1:8080/evil/path'}),/llama_must_be_loopback/);
 const calls=[];
 const fetchImpl=async(url,request)=>{
  calls.push({url,request});
  const route=new URL(url).pathname;
  const payload=route==='/v1/models'
    ?{data:[{id:'nextgen-local-model',object:'model'}]}
    :{choices:[{message:{role:'assistant',content:'I hear you. Can we try one friendly example?'}}]};
  return {ok:true,json:async()=>payload};
 };
 const backend=makeLocalLlamaTutor({origin:'http://127.0.0.1:8080',fetchImpl});
 await assert.rejects(()=>backend.infer({prompt:'test'}),/llama_model_not_validated/);
 const ready=await backend.validate();
 assert.deepEqual(ready,{provider:'llama.cpp',model:'nextgen-local-model',local_only:true});
 const r=await backend.infer({prompt:'What is algebra?'});
 assert.equal(r.status,'completed');
 assert.equal(r.provider,'llama.cpp');
 assert.match(r.provider_receipt,/^sha256:[a-f0-9]{64}$/);
 assert.match(r.text,/friendly example/);
 assert(calls.every(x=>x.url.startsWith('http://127.0.0.1:8080/')));
 const data=JSON.parse(calls[1].request.body);
 assert.equal(data.stream,false);
 assert.equal(data.model,'nextgen-local-model');
 assert.equal(data.messages[0].content,'What is algebra?');
 assert.equal(data.messages[0].role,'user');
});
test('llama-server missing model or failed completion holds and never fabricates an answer',async()=>{
 const missing=makeLocalLlamaTutor({origin:'http://127.0.0.1:8080',fetchImpl:async()=>({ok:true,json:async()=>({data:[]})})});
 await assert.rejects(()=>missing.validate(),/llama_model_missing/);
 let count=0;
 const offline=makeLocalLlamaTutor({origin:'http://127.0.0.1:8080',fetchImpl:async()=>{
  count++;
  return count===1?{ok:true,json:async()=>({data:[{id:'local'}]})}:
   {ok:false,json:async()=>({error:'server unavailable'})};
 }});
 await offline.validate();
 await assert.rejects(()=>offline.infer({prompt:'Can we learn?' }),/llama_inference_failed/);
});

test('Adult reset requires authorization and destroys all private room sessions',async()=>{
 const srv=await service();
 try{
  const opened=await request(srv.url,'/api/classroom/session',{method:'POST',body:{room:'reading'}});
  assert.equal(opened.status,201);
  const denied=await request(srv.url,'/api/classroom/reset',{method:'POST',body:{},headers:{'content-type':'application/json'}});
  assert.equal(denied.status,401);
  const done=await request(srv.url,'/api/classroom/reset',{method:'POST',body:{}});
  assert.equal(done.status,200);
  assert.equal(done.body.all_volatile_sessions_erased,true);
  assert.equal(done.body.cleared_count,1);
  const stale=await request(srv.url,'/api/classroom/message',{method:'POST',body:{session_id:opened.body.session_id,message:'What happens next?'}});
  assert.equal(stale.body.error,'session_not_found');
 }finally{await srv.close()}
});
