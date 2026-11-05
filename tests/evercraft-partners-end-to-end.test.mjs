import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {startFabricLocalRuntime} from '../systemia/mcp/fabric-local-runtime.mjs';
import {
 validatePartnerApplication,readPrivatePartnerApplication,
 createPartnerApplicationDispatcher,reconcilePartnerApplicationAlerts,
 PARTNERS_ORIGINS,
} from '../systemia/mcp/partners-public-inquiry.mjs';

const ORIGIN=PARTNERS_ORIGINS[0];
const key=crypto.randomBytes(32);
const dir=()=>fs.mkdtempSync(path.join(os.tmpdir(),'saban-partners-'));
const uuid=()=>crypto.randomUUID();
const input=(more={})=>({name:'Sample Applicant',email:'applicant@example.test',
 audience:'Business owners & executives',region:'United States',profile:'https://example.test/profile',
 consent:true,request_id:uuid(),website_honey:'',...more});
const post=(url,data,origin=ORIGIN)=>fetch(url+'/api/partners/inquiry',{method:'POST',
 headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)});
async function boot(folder,{secret=key}={}){
 fs.mkdirSync(path.join(folder,'alert-outbox'),{recursive:true,mode:0o700});
 return startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false,
 partnersLeadsDir:folder,partnersIntakeKey:secret});
}
function cleanup(folder){fs.rmSync(folder,{recursive:true,force:true})}

test('Saban admission: strict minimal consent, URL, UUID, anti-spam validation',()=>{
 assert.ok(validatePartnerApplication(input()).value);
 assert.equal(validatePartnerApplication(input({name:'A'})).error,'invalid_application');
 assert.equal(validatePartnerApplication(input({email:'not-email'})).error,'invalid_application');
 assert.equal(validatePartnerApplication(input({consent:false})).error,'consent_required');
 assert.equal(validatePartnerApplication(input({profile:'http://not-secure.test'})).error,'profile_must_be_https_url');
 assert.equal(validatePartnerApplication(input({request_id:'invented'})).error,'invalid_application');
 assert.equal(validatePartnerApplication(input({website_honey:'filled'})).honeypot,true);
 assert.equal(validatePartnerApplication(input({name:'A'.repeat(130)})).error,'invalid_application');
});
test('Saban visitor: public static landing, terms and module delivered by owned Fabric',async()=>{
 const folder=dir();const rt=await boot(folder);
 try{
  for(const [route,type] of [['/partners/','text/html'],['/partners/app.mjs','text/javascript'],['/partners/mark.svg','image/svg+xml'],['/partners/terms.html','text/html']]){
   const res=await fetch(rt.url+route);
   assert.equal(res.status,200,route);
   assert.ok(res.headers.get('content-type').includes(type),route);
   assert.ok((await res.text()).length>150);
  }
  const page=await fetch(rt.url+'/partners/');
  assert.match(await page.text(),/id="partner-application"/);
  const method=await fetch(rt.url+'/partners/',{method:'POST'});
  assert.equal(method.status,405);
 }finally{await rt.close();cleanup(folder)}
});
test('Saban path: true CORS readiness -> POST -> encrypted record -> exact public receipt',async()=>{
 const folder=dir();const rt=await boot(folder);const body=input();
 try{
  const ready=await fetch(rt.url+'/api/partners/readiness',{headers:{origin:ORIGIN}});
  assert.equal(ready.status,200);
  assert.equal(ready.headers.get('access-control-allow-origin'),ORIGIN);
  assert.deepEqual(await ready.json(),{schema:'evercraft.partners.intake-readiness.v1',intake_available:true});
  const options=await fetch(rt.url+'/api/partners/inquiry',{method:'OPTIONS',headers:{origin:ORIGIN}});
  assert.equal(options.status,204);
  const response=await post(rt.url,body);assert.equal(response.status,201);
  assert.equal(response.headers.get('access-control-allow-origin'),ORIGIN);
  const result=await response.json();
  assert.equal(result.received,true);assert.match(result.reference,/^EVP-[A-F0-9]{24}$/);
  assert.match(result.message,/No partner account or payment/);
  const ciphertext=fs.readFileSync(path.join(folder,result.reference+'.enc'),'utf8');
  assert.doesNotMatch(ciphertext,/Sample Applicant|applicant@example|Business owners/i);
  assert.equal(fs.statSync(path.join(folder,result.reference+'.enc')).mode&0o777,0o600);
  assert.equal(fs.statSync(folder).mode&0o777,0o700);
  const recovered=readPrivatePartnerApplication({storeDir:folder,key,reference:result.reference});
  assert.equal(recovered.name,body.name);assert.equal(recovered.email,body.email);
  assert.equal(recovered.state,'PENDING_HUMAN_REVIEW');
  assert.equal(recovered.partner_activated,false);
  assert.equal(recovered.payment_created,false);assert.equal(recovered.outbound_authorized,false);
  assert.throws(()=>readPrivatePartnerApplication({storeDir:folder,key:crypto.randomBytes(32),reference:result.reference}));
  assert.throws(()=>readPrivatePartnerApplication({storeDir:folder,key,reference:'../traversal'}));
  const queued=fs.readFileSync(path.join(folder,'alert-outbox',result.reference+'.json'),'utf8');
  assert.doesNotMatch(queued,/applicant@example|Sample Applicant/);
  assert.equal(JSON.parse(queued).contains_customer_pii,false);
 }finally{await rt.close();cleanup(folder)}
});
test('Saban recovery: double-click and network retry produce one stored application',async()=>{
 const folder=dir();const rt=await boot(folder);const data=input();
 try{
  const [a,b]=await Promise.all([post(rt.url,data),post(rt.url,data)]);
  assert.deepEqual([a.status,b.status].sort(),[200,201]);
  const refs=await Promise.all([a.json(),b.json()]);
  assert.equal(refs[0].reference,refs[1].reference);
  assert.equal(fs.readdirSync(folder).filter(x=>x.endsWith('.enc')).length,1);
  assert.equal((await post(rt.url,data)).status,200);
  // Reusing an ID with edited fields must not claim a new, unrecorded application.
  assert.equal((await post(rt.url,{...data,audience:'Altered audience'})).status,409);
  assert.equal(fs.readdirSync(path.join(folder,'alert-outbox')).length,1);
 }finally{await rt.close();cleanup(folder)}
});
test('Saban adversarial: cross origin, null origin, malformed requests and trap do not store PII',async()=>{
 const folder=dir();const rt=await boot(folder);
 try{
  const body=input();
  assert.equal((await post(rt.url,body,'https://hostile.example')).status,403);
  assert.equal((await post(rt.url,body,'null')).status,403);
  assert.equal((await post(rt.url,{...body,consent:false})).status,422);
  assert.equal((await post(rt.url,{...body,website_honey:'spam'})).status,202);
  assert.equal((await post(rt.url,{...body,name:'N'.repeat(7000)})).status,413);
  assert.equal((await fetch(rt.url+'/api/partners/inquiry',{method:'POST',headers:{origin:ORIGIN,'content-type':'text/plain'},body:'bad'})).status,415);
  assert.equal((await fetch(rt.url+'/api/partners/inquiry',{method:'GET',headers:{origin:ORIGIN}})).status,405);
  assert.equal(fs.readdirSync(folder).filter(x=>x.endsWith('.enc')).length,0);
 }finally{await rt.close();cleanup(folder)}
});
test('Saban admission gate: missing key never grants readiness or writes an application',async()=>{
 const folder=dir();const rt=await boot(folder,{secret:'invalid'});
 try{
  const readiness=await fetch(rt.url+'/api/partners/readiness',{headers:{origin:ORIGIN}});
  assert.equal((await readiness.json()).intake_available,false);
  const response=await post(rt.url,input());
  assert.equal(response.status,503);
  assert.equal((await response.json()).error,'intake_unavailable');
  assert.equal(fs.readdirSync(folder).filter(x=>x.endsWith('.enc')).length,0);
 }finally{await rt.close();cleanup(folder)}
});
test('Saban capacity: per-email rate limiting never conflates accepted with rejected',async()=>{
 const folder=dir();const rt=await boot(folder);
 try{
  for(let i=0;i<3;i++)assert.equal((await post(rt.url,input())).status,201);
  const fourth=await post(rt.url,input());
  assert.equal(fourth.status,429);
  assert.equal((await fourth.json()).error,'too_many_requests');
  assert.equal(fs.readdirSync(folder).filter(x=>x.endsWith('.enc')).length,3);
 }finally{await rt.close();cleanup(folder)}
});
test('Saban crash loop: missing alert after durable write reconstructed once',async()=>{
 const folder=dir();const rt=await boot(folder);
 let ref;
 try{
  const r=await post(rt.url,input());assert.equal(r.status,201);ref=(await r.json()).reference;
 }finally{await rt.close()}
 try{
  fs.unlinkSync(path.join(folder,'alert-outbox',ref+'.json'));
  assert.equal(reconcilePartnerApplicationAlerts({storeDir:folder,key}).recovered,1);
  assert.equal(reconcilePartnerApplicationAlerts({storeDir:folder,key}).recovered,0);
  const restored=fs.readFileSync(path.join(folder,'alert-outbox',ref+'.json'),'utf8');
  assert.doesNotMatch(restored,/Sample Applicant|example.test/);
 }finally{cleanup(folder)}
});
test('Saban Relay path: reference-only alert, durable ack, no duplicate delivery',async()=>{
 const folder=dir();const rt=await boot(folder);
 let ref;
 try{const r=await post(rt.url,input());ref=(await r.json()).reference}
 finally{await rt.close()}
 const sent=[];
 const dispatcher=createPartnerApplicationDispatcher({folder,key,recipient:'owner-test',notify:async msg=>{
  sent.push(msg);return {inboxed:1};
 }});
 try{
  assert.equal((await dispatcher.dispatch()).accepted,1);
  assert.equal(sent[0].product,'evercraft-partners');
  assert.equal(sent[0].data.contains_customer_pii,false);
  assert.doesNotMatch(JSON.stringify(sent),/Sample Applicant|example.test/);
  assert.equal(fs.existsSync(path.join(folder,'alert-outbox',ref+'.json')),false);
  assert.equal(fs.existsSync(path.join(folder,'alert-receipts',ref+'.json')),true);
  assert.equal((await dispatcher.dispatch()).accepted,0);
  assert.equal(sent.length,1);
 }finally{dispatcher.stop();cleanup(folder)}
});
test('Saban fail closed: Relay outage preserves durable private alert for retry',async()=>{
 const folder=dir();const rt=await boot(folder);
 let ref;
 try{ref=(await (await post(rt.url,input())).json()).reference}finally{await rt.close()}
 const failed=createPartnerApplicationDispatcher({folder,key,recipient:'owner',notify:async()=>{throw Error('offline')}});
 const healthy=createPartnerApplicationDispatcher({folder,key,recipient:'owner',notify:async()=>({inboxed:1})});
 try{
  assert.equal((await failed.dispatch()).failed,1);
  assert.equal(fs.existsSync(path.join(folder,'alert-outbox',ref+'.json')),true);
  assert.equal((await healthy.dispatch()).accepted,1);
  assert.equal(fs.existsSync(path.join(folder,'alert-outbox',ref+'.json')),false);
 }finally{failed.stop();healthy.stop();cleanup(folder)}
});
