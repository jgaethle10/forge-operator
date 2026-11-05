import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {
 createCirclesInterestHandler,readPrivateCirclesInterest,
 circlesInterestReadiness,validateCirclesInterest,CIRCLES_ALLOWED_ORIGINS
} from '../systemia/circles/founding-intake.mjs';

const ORIGIN=CIRCLES_ALLOWED_ORIGINS[0];
const valid={
 name:'Example Founder',email:'example@example.test',region:'Yakima, WA',
 profession:'General contractor',interest:'found',
 note:'Interested in a locally trusted roster.',consent:true,
 request_id:'11111111-1111-4111-8111-111111111111'
};
async function service(){
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'circles-owned-intake-'));
 fs.mkdirSync(path.join(folder,'alert-outbox'),{mode:0o700});
 const key=randomBytes(32).toString('base64');
 const seen=[];
 const handle=createCirclesInterestHandler({storeDir:folder,key,onAlertQueued:id=>seen.push(id)});
 const server=http.createServer((req,res)=>void handle(req,res));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();
 return {folder,key,seen,base:'http://127.0.0.1:'+address.port,
  close:async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(folder,{recursive:true,force:true})}};
}
async function send(base,{origin=ORIGIN,method='POST',data=valid,url='/api/circles/inquiry'}={}){
 const headers={origin};
 if(method==='POST')headers['content-type']='application/json';
 const r=await fetch(base+url,{method,headers,
  ...(method==='POST'?{body:JSON.stringify(data)}:{})});
 return {status:r.status,body:await r.json(),headers:r.headers};
}
test('Founding input rejects missing consent, unrecognized intentions and excessive data',()=>{
 assert.equal(validateCirclesInterest({...valid,consent:false}).error,'consent_required');
 assert.equal(validateCirclesInterest({...valid,interest:'auto-enroll'}).error,'invalid_interest');
 assert.equal(validateCirclesInterest({...valid,note:'x'.repeat(501)}).error,'invalid_interest');
 assert.equal(validateCirclesInterest({...valid,website_honey:'bot'}).honeypot,true);
 assert.equal(validateCirclesInterest(valid).value.email,'example@example.test');
});
test('Requires preprovisioned, private folder and key before intake can be available',()=>{
 assert.equal(circlesInterestReadiness({storeDir:'/nonexistent/path/evercraft-circles',key:''}).intake_available,false);
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'circles-access-'));
 try{
  fs.chmodSync(folder,0o755);
  assert.equal(circlesInterestReadiness({storeDir:folder,key:randomBytes(32).toString('base64')}).intake_available,false);
 }finally{fs.rmSync(folder,{recursive:true,force:true})}
});
test('Owned consented intake stores encrypted private record, issues a real receipt and is idempotent',async()=>{
 const api=await service();
 try{
  const ready=await send(api.base,{method:'GET',url:'/api/circles/readiness'});
  assert.equal(ready.status,200);
  assert.equal(ready.body.intake_available,true);
  assert.equal(ready.body.membership_live,false);
  assert.equal(ready.body.checkout_ready,false);
  const first=await send(api.base);
  assert.equal(first.status,201);
  assert.equal(first.body.received,true);
  assert.equal(first.body.membership_created,false);
  assert.equal(first.body.payment_created,false);
  assert.match(first.body.reference,/^EVC-[A-F0-9]{24}$/);
  assert.equal(api.seen.length,1);
  const raw=fs.readFileSync(path.join(api.folder,first.body.reference+'.enc'),'utf8');
  assert.doesNotMatch(raw,/Example Founder|example@example\.test|Yakima/);
  const stat=fs.statSync(path.join(api.folder,first.body.reference+'.enc'));
  assert.equal(stat.mode&0o077,0);
  const saved=readPrivateCirclesInterest({storeDir:api.folder,key:api.key,reference:first.body.reference});
  assert.equal(saved.state,'PENDING_HUMAN_REVIEW');
  assert.equal(saved.note,valid.note);
  assert.equal(saved.payment_created,false);
  assert.equal(saved.membership_created,false);
  const alert=JSON.parse(fs.readFileSync(path.join(api.folder,'alert-outbox',first.body.reference+'.json'),'utf8'));
  assert.equal(alert.contains_personal_data,false);
  assert.equal(JSON.stringify(alert).includes('example@example.test'),false);
  const replay=await send(api.base);
  assert.equal(replay.status,200);
  assert.equal(replay.body.reference,first.body.reference);
  assert.equal(replay.body.duplicate,true);
  const conflict=await send(api.base,{data:{...valid,profession:'Roofing'}});
  assert.equal(conflict.status,409);
 }finally{await api.close()}
});
test('Enforces origin, consent and allowed methods; no unilateral membership or payment',async()=>{
 const api=await service();
 try{
  assert.equal((await send(api.base,{origin:'https://untrusted.example'})).status,403);
  assert.equal((await send(api.base,{data:{...valid,consent:false}})).status,422);
  assert.equal((await send(api.base,{data:{...valid,interest:'pay-now'}})).status,422);
  assert.equal((await send(api.base,{method:'GET',url:'/api/circles/inquiry'})).body.checkout_ready,false);
  assert.equal(fs.readdirSync(api.folder).filter(x=>x.endsWith('.enc')).length,0);
 }finally{await api.close()}
});
test('Circles site is responsive and all interactive routing stays on owned intake or manual email',()=>{
 const html=fs.readFileSync(new URL('../public/circles/index.html',import.meta.url),'utf8');
 const app=fs.readFileSync(new URL('../public/circles/app.mjs',import.meta.url),'utf8');
 const fabric=fs.readFileSync(new URL('../systemia/mcp/fabric-local-runtime.mjs',import.meta.url),'utf8');
 assert.match(html,/<meta name="viewport"/);
 assert.match(html,/@media\(max-width:650px\)/);
 assert.match(html,/Founding interest is not membership approval/);
 assert.match(app,/\/api\/circles/);
 assert.match(app,/body\.received!==true/);
 assert.match(app,/mailto:/);
 assert.match(fabric,/createCirclesInterestHandler/);
 assert.match(fabric,/circlesRoute==='\/api\/circles\/inquiry'/);
 assert.doesNotMatch(app,/\blocalStorage\b|\bsessionStorage\b|base44\.app/);
});
