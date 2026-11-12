import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHmac} from 'node:crypto';
import fs from 'node:fs';
const path='/tmp/growth-signal-test-'+process.pid+'.ndjson';
const secret='test-secret-is-at-least-32-chars-long-1234';
const reader='read-test-token-is-also-32-characters-long';
const port=18800+Math.floor(Math.random()*400);
const proc=spawn(process.execPath,['systemia/growth-signal/client001/signal-service.mjs'],{cwd:process.cwd(),env:{...process.env,SIGNAL_PORT:String(port),SIGNAL_CLIENT_APPROVED:'true',SIGNAL_INGEST_HMAC_SECRET:secret,SIGNAL_READ_TOKEN:reader,SIGNAL_LEDGER_PATH:path},stdio:['ignore','pipe','pipe']});
let ready=false;let stderr='';proc.stdout.on('data',b=>{if(String(b).includes('listening'))ready=true});proc.stderr.on('data',b=>{stderr+=String(b)});
const url=`http://127.0.0.1:${port}`;
async function req(route,data,headers={}){const body=JSON.stringify(data),sig=createHmac('sha256',secret).update(body).digest('hex');const r=await fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json','x-evercraft-signature':sig,...headers},body});return {status:r.status,data:await r.json()}}
try{
 for(let i=0;i<100&&!ready;i++)await new Promise(r=>setTimeout(r,50));assert.ok(ready,stderr);
 let health=await(await fetch(url+'/health')).json();assert.equal(health.integrationLive,false);
 const stamp=new Date().toISOString();
 let publicEvt={id:'sample_click_001',campaign:'EC-EN-001',action:'call_button_click',occurred_at:stamp};
 let a=await req('/v1/observation',publicEvt);assert.equal(a.status,201);assert.equal(a.data.trust,'unverified_public_event');
 a=await req('/v1/observation',publicEvt);assert.equal(a.status,200);assert.equal(a.data.duplicate,true);
 a=await req('/v1/observation',{...publicEvt,id:'sample_click_002',amount_cents:12000});assert.equal(a.status,422);
 const payment={id:'sample_payment_001',campaign:'EC-EN-001',action:'payment_completed',occurred_at:stamp,merchant_evidence_ref:'square_demo_payment_abc',amount_cents:12000,currency:'USD'};
 a=await req('/v1/merchant',payment);assert.equal(a.status,403);
 a=await req('/v1/merchant',payment,{'x-evercraft-adapter':'square-verified-server-adapter'});assert.equal(a.status,201);
 const summary=await(await fetch(url+'/v1/summary',{headers:{Authorization:'Bearer '+reader}})).json();
 assert.equal(summary.merchant_collected_cents,12000);assert.equal(summary.attributed_first_visit_cents,null);assert.equal(summary.incremental_growth_cents,null);assert.equal(summary.by_campaign['EC-EN-001'].observations,1);
 const denied=await fetch(url+'/v1/summary');assert.equal(denied.status,401);
 const count=fs.readFileSync(path,'utf8').trim().split('\n').length;assert.equal(count,2);
 console.log(JSON.stringify({passed:true,tests:['health','public event','idempotent dedupe','no public payment claims','merchant adapter gate','source-bound collected revenue','no unproven attribution','unauthorized read denied','append-only receipts'],sampleSummary:summary},null,2));
}finally{proc.kill();try{fs.unlinkSync(path)}catch{}}