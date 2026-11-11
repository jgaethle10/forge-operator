#!/usr/bin/env node
// Infinite Classroom: adult-supervised, LOOPBACK-ONLY private tutor pilot.
// No public bind, hosted model, durable student data, analytics or Base44 fallback.
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createClassroomTutor,CLASSROOM_ROOMS} from './tutor-core.mjs';
import {createHttpInferenceAdapter} from '../raven/team-review-runtime.mjs';

const ownFile=fileURLToPath(import.meta.url);
function fail(code){throw Error(code)}
function isLoopback(value){
 try{
  const url=new URL(value);
  return url.protocol==='http:'&&['127.0.0.1','localhost','[::1]','::1'].includes(url.hostname)&&
    (!url.pathname||url.pathname==='/')&&!url.username&&!url.password&&!url.search&&!url.hash;
 }catch{return false}
}
function safeEqual(a,b){
 const aa=Buffer.from(String(a||'')),bb=Buffer.from(String(b||''));
 return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);
}
function readSecretFile(filename){
 if(typeof filename!=='string'||!filename.trim())fail('secret_file_path_required');
 const stat=fs.lstatSync(filename);
 if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)fail('private_secret_file_required');
 const token=fs.readFileSync(filename,'utf8').trim();
 if(Buffer.byteLength(token)<32||Buffer.byteLength(token)>512)fail('secret_minimum_length_invalid');
 return token;
}
function secureHeaders(){
 return {
  'content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY',
  'referrer-policy':'no-referrer','permissions-policy':'microphone=(), camera=(), geolocation=()'
 };
}
function reply(res,status,data,ctype='application/json; charset=utf-8'){
 const bytes=Buffer.from(ctype.startsWith('application/json')?JSON.stringify(data):String(data));
 res.writeHead(status,{...secureHeaders(),'content-type':ctype,'content-length':bytes.length});
 res.end(bytes);
}
function bearer(req){
 const auth=String(req.headers.authorization||'');
 return auth.startsWith('Bearer ')?auth.slice(7):'';
}
async function readJson(req,max=5000){
 if(!/^application\/json(?:;|$)/i.test(String(req.headers['content-type']||'')))fail('json_required');
 let total=0,chunks=[];
 for await(const chunk of req){total+=chunk.length;if(total>max)fail('payload_too_large');chunks.push(chunk)}
 try{
  const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!body||typeof body!=='object'||Array.isArray(body))fail('invalid_json');
  return body;
 }catch{fail('invalid_json')}
}
export function makeLocalRavenTutor({origin='http://127.0.0.1:4322',token,fetchImpl=globalThis.fetch}={}){
 if(!isLoopback(origin))fail('raven_must_be_loopback');
 if(typeof token!=='string'||token.length<32)fail('raven_authority_required');
 const base=new URL(origin).origin;
 const adapter=createHttpInferenceAdapter({origin:base,token,fetchImpl,timeoutMs:25000});
 async function getJson(path,{method='GET',body=null,authorized=false}={}){
  const response=await fetchImpl(base+path,{
   method,headers:{accept:'application/json',...(body?{'content-type':'application/json'}:{}),
    ...(authorized?{authorization:'Bearer '+token}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),
   signal:AbortSignal.timeout(8000)
  });
  if(!response.ok)fail('raven_validation_unavailable');
  return response.json();
 }
 return {
  async validate(){
   const health=await getJson('/health');
   if(health.ok!==true||health.service!=='raven-inference-gateway'||health.provider!=='ollama'||health.loopback_only!==true)
    fail('raven_local_ollama_only_required');
   const checked=await getJson('/v1/validate',{
    method:'POST',authorized:true,body:{schema:'evercraft.raven.inference-validation.request.v1'}
   });
   if(checked.status!=='available'||checked.provider!=='ollama'||checked.base44_used!==false)
    fail('raven_local_model_not_validated');
   return {provider:'ollama',model:checked.model,local_only:true};
  },
  async infer({request_id,role,prompt}){
   const result=await adapter.infer({request_id,role,prompt});
   return {...result,status:'completed'};
  }
 };
}

export async function startPrivateClassroomPilot({
 host='127.0.0.1',port=8793,accessToken,infer,localModelVerified=false,
 pageFile=new URL('./pilot.html',import.meta.url),now=Date.now
}={}){
 if(!['127.0.0.1','::1'].includes(host))fail('classroom_loopback_only');
 if(typeof accessToken!=='string'||accessToken.length<32)fail('classroom_private_access_required');
 if(typeof infer!=='function')fail('classroom_inference_required');
 if(localModelVerified!==true)fail('classroom_owned_model_validation_required');
 const tutor=createClassroomTutor({infer,now});
 let recent=[],closed=false;
 const server=http.createServer(async(req,res)=>{
  try{
   const path=new URL(req.url||'/',"http://localhost").pathname;
   if(req.method==='GET'&&path==='/health')
    return reply(res,200,{ok:!closed,service:'infinite-classroom-private-pilot',
      exposure:'loopback',public_release_authorized:false,
      child_safety_certified:false,active_model:'local_ollama'});
   if(req.method==='GET'&&(path==='/'||path==='/pilot/')){
    return reply(res,200,fs.readFileSync(pageFile,'utf8'),'text/html; charset=utf-8');
   }
   if(!path.startsWith('/api/classroom/'))return reply(res,404,{ok:false,error:'not_found'});
   if(!safeEqual(bearer(req),accessToken))return reply(res,401,{ok:false,error:'private_access_required'});
   if(req.method==='GET'&&path==='/api/classroom/status')
    return reply(res,200,{ok:true,mode:'adult_supervised_local_tutor_pilot',
      model:'owned_local_ollama',safety_verified:false,public_youth_access:false,
      conversation_retention:'volatile_memory_30_minutes',rooms:Object.keys(CLASSROOM_ROOMS),
      ...tutor.status()});
   if(req.method!=='POST')return reply(res,405,{ok:false,error:'method_not_allowed'});
   const origin=String(req.headers.origin||'');
   if(origin && origin!=='http://'+host+':'+server.address().port)
    return reply(res,403,{ok:false,error:'origin_denied'});
   const at=now();recent=recent.filter(t=>at-t<60000);
   if(recent.length>=12)return reply(res,429,{ok:false,error:'pilot_rate_limit'});
   recent.push(at);
   const data=await readJson(req);
   if(path==='/api/classroom/session'){
    const session=tutor.start(data.room);
    return reply(res,201,{ok:true,...session});
   }
   if(path==='/api/classroom/message'){
    const response=await tutor.say(data);
    return reply(res,200,{ok:true,...response});
   }
   if(path==='/api/classroom/end'){
    if(typeof data.session_id!=='string')return reply(res,422,{ok:false,error:'invalid_session'});
    tutor.close(data.session_id);
    return reply(res,200,{ok:true,ended:true});
   }
   return reply(res,404,{ok:false,error:'not_found'});
  }catch(error){
   const code=String(error?.message||'unknown');
   const safe=new Set(['invalid_json','payload_too_large','json_required','invalid_room','session_not_found',
    'session_expired','session_busy','session_turn_limit','invalid_message','invalid_homework_flag',
    'pilot_capacity_reached','local_inference_unavailable','local_inference_unverified',
    'local_output_unusable','homework_answer_guard_blocked','output_guard_blocked']);
   return reply(res,code.startsWith('local_')||code==='homework_answer_guard_blocked'?503:422,
    {ok:false,error:safe.has(code)?code:'request_blocked'});
  }
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve)});
 return {
  url:'http://'+host+':'+server.address().port,
  async close(){if(closed)return;closed=true;await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))}
 };
}
function arg(name){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]||'':''}
if(process.argv[1]&&fileURLToPath(new URL('file://'+process.argv[1]))===ownFile){
 try{
  const accessToken=readSecretFile(arg('--access-token-file'));
  const ravenToken=readSecretFile(arg('--raven-token-file'));
  const raven=makeLocalRavenTutor({origin:arg('--raven-origin')||'http://127.0.0.1:4322',token:ravenToken});
  await raven.validate();
  const port=Number(arg('--port')||8793);
  if(!Number.isInteger(port)||port<1024||port>65535)fail('invalid_port');
  const service=await startPrivateClassroomPilot({accessToken,infer:raven.infer,localModelVerified:true,port});
  process.stdout.write(JSON.stringify({service:'infinite-classroom-private-pilot',url:service.url,
   validated_local_model:true,public_youth_release:false,no_child_profile_storage:true})+'\n');
  const exit=async()=>{await service.close();process.exit(0)};
  process.on('SIGINT',exit);process.on('SIGTERM',exit);
 }catch(error){process.stderr.write('Classroom pilot held: '+String(error?.message||'unavailable')+'\n');process.exitCode=1}
}
