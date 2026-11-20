import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {enqueueStudioAlert,deliverStudioAlerts,alertIntent,createStudioAlertDispatcher,
  recoverStudioAlerts} from '../systemia/mcp/studio-lead-relay.mjs';
import {startFabricLocalRuntime} from '../systemia/mcp/fabric-local-runtime.mjs';
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-studio-relay-'));
const payload={name:'Test Buyer',email:'buyer@example.test',company:'Example Roofing',
  project:'$50 launch-week 30-second social commercial pilot',
  goal:'Make an approved thirty second promo with supplied photos and footage.',
  website:'',consent:true};
test('accepted studio inquiry leaves private durable Relay alert containing no buyer PII',async()=>{
 const dir=temp();const app=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false,studioLeadsDir:dir});
 try{
   const reply=await fetch(app.url+'/api/commercial-studio/inquiry',{method:'POST',
     headers:{origin:'https://jgaethle10.github.io','content-type':'application/json'},body:JSON.stringify(payload)});
   assert.equal(reply.status,201);
   const {reference}=await reply.json();
   const queue=JSON.parse(fs.readFileSync(path.join(dir,'alert-outbox',reference+'.json'),'utf8'));
   assert.equal(queue.reference,reference);
   assert.equal(queue.pii_stored,false);
   const text=JSON.stringify(queue);
   assert.doesNotMatch(text,/buyer@example\.test|Test Buyer|Example Roofing|supplied photos/);
   assert.equal(fs.statSync(path.join(dir,'alert-outbox',reference+'.json')).mode&0o777,0o600);
 }finally{await app.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('Relay worker delivers no PII, records inbox acceptance, and does not send again',async()=>{
 const dir=temp(),ref='EC-STUDIO-0123456789ABCDEF0123';
 try{
   enqueueStudioAlert({folder:dir,reference:ref,project:payload.project,received_at:'2026-10-25T20:00:00Z'});
   const intents=[];
   const notify=async intent=>{intents.push(intent);return {inboxed:1};};
   const a=await deliverStudioAlerts({folder:dir,recipient:'owner-evercraft',notify});
   assert.equal(a.accepted,1);
   assert.equal(a.failed,0);
   assert.equal(intents[0].purpose,'operational');
   assert.equal(intents[0].recipient_ids[0],'owner-evercraft');
   assert.equal(intents[0].dedupe_key,'studio:'+ref);
   assert.doesNotMatch(JSON.stringify(intents[0]),/buyer@example\.test/);
   const b=await deliverStudioAlerts({folder:dir,recipient:'owner-evercraft',notify});
   assert.equal(b.queued,0);
   assert.equal(intents.length,1);
   const receipt=JSON.parse(fs.readFileSync(path.join(dir,'alert-receipts',ref+'.json'),'utf8'));
   assert.equal(receipt.human_seen,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('unavailable Relay remains pending and cannot be mistaken for acknowledged delivery',async()=>{
 const dir=temp(),ref='EC-STUDIO-AAAABBBBCCCCDDDDEEEE';
 try{
   enqueueStudioAlert({folder:dir,reference:ref,project:payload.project,received_at:'2026-10-25T20:00:00Z'});
   const fail=await deliverStudioAlerts({folder:dir,recipient:'owner-evercraft',notify:async()=>{throw Error('provider_offline');}});
   assert.deepEqual(fail,{queued:1,accepted:0,failed:1});
   assert.equal(fs.existsSync(path.join(dir,'alert-outbox',ref+'.json')),true);
   const reject=await deliverStudioAlerts({folder:dir,recipient:'owner-evercraft',notify:async()=>({accepted:1,inboxed:0})});
   assert.equal(reject.failed,1);
   const success=await deliverStudioAlerts({folder:dir,recipient:'owner-evercraft',notify:async()=>({inboxed:1})});
   assert.equal(success.accepted,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('without configured principal or server ingest secret, no unauthorized push is attempted',()=>{
 const unavailable=createStudioAlertDispatcher({folder:temp(),recipient:'',token:''});
 assert.equal(unavailable.enabled,false);
 assert.throws(()=>alertIntent({schema:'evercraft.studio.operator-alert.v1',
  reference:'EC-STUDIO-0123456789ABCDEF0123',project:payload.project},''),/principal_invalid/);
});


test('saved buyer lead recovers missed Relay alert after a private outbox filesystem error',async()=>{
 const dir=temp(),block=path.join(dir,'alert-outbox');
 // Simulate a durable inquiry write followed by a failed alert-directory create.
 fs.writeFileSync(block,'synthetic directory obstruction',{mode:0o600});
 const app=await startFabricLocalRuntime({
  host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false,studioLeadsDir:dir
 });
 try{
  const reply=await fetch(app.url+'/api/commercial-studio/inquiry',{method:'POST',
   headers:{origin:'https://jgaethle10.github.io','content-type':'application/json'},
   body:JSON.stringify({...payload,project:'$50 introductory 30-second social commercial pilot'})});
  assert.equal(reply.status,201,'buyer must receive truthful durable inquiry receipt');
  const {reference}=await reply.json();
  const ledger=fs.readFileSync(path.join(dir,'inquiries.ndjson'),'utf8');
  assert.match(ledger,new RegExp(reference));
  assert.equal(fs.existsSync(path.join(dir,'alert-receipts',reference+'.json')),false);
  fs.unlinkSync(block);
  const recovered=recoverStudioAlerts({folder:dir});
  assert.equal(recovered.requeued,1);
  const alert=JSON.parse(fs.readFileSync(path.join(dir,'alert-outbox',reference+'.json'),'utf8'));
  assert.equal(alert.project,'$50 introductory 30-second social commercial pilot');
  assert.equal(alert.pii_stored,false);
  assert.doesNotMatch(JSON.stringify(alert),/buyer@example\.test|Test Buyer|Example Roofing/);
  let notifications=0;
  const dispatch=createStudioAlertDispatcher({
   folder:dir,recipient:'owner-evercraft',
   notify:async()=>{notifications++;return {inboxed:1};}
  });
  const delivered=await dispatch.dispatch();
  assert.equal(delivered.accepted,1);
  assert.equal(delivered.recovery.requeued,0);
  assert.equal(notifications,1);
  const again=await dispatch.dispatch();
  assert.equal(again.accepted,0);
  assert.equal(again.recovery.acknowledged,1);
  assert.equal(notifications,1);
 }finally{await app.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('already-accepted Studio reference never becomes a duplicate alert after a queue replay',async()=>{
 const dir=temp(),app=await startFabricLocalRuntime({
  host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false,studioLeadsDir:dir
 });
 try{
  const reply=await fetch(app.url+'/api/commercial-studio/inquiry',{method:'POST',
   headers:{origin:'https://jgaethle10.github.io','content-type':'application/json'},
   body:JSON.stringify(payload)});
  const {reference}=await reply.json();
  const note=async()=>({inboxed:1});
  const first=await deliverStudioAlerts({folder:dir,recipient:'owner-evercraft',notify:note});
  assert.equal(first.accepted,1);
  // Crash/replay simulation: stale outbox recreated after durable Relay acceptance.
  enqueueStudioAlert({folder:dir,reference,project:payload.project,
   received_at:'2026-11-19T20:00:00Z'});
  let duplicateSends=0;
  const dispatcher=createStudioAlertDispatcher({
   folder:dir,recipient:'owner-evercraft',
   notify:async()=>{duplicateSends++;return {inboxed:1};}
  });
  const replay=await dispatcher.dispatch();
  assert.equal(replay.recovery.acknowledged,1);
  assert.equal(replay.accepted,0);
  assert.equal(duplicateSends,0);
  assert.equal(fs.existsSync(path.join(dir,'alert-outbox',reference+'.json')),false);
 }finally{await app.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('malformed private ledger or forged Relay acceptance cannot erase a pending alert',async()=>{
 const dir=temp(),reference='EC-STUDIO-0123456789ABCDEF0123';
 try{
  const ledger=path.join(dir,'inquiries.ndjson');
  fs.writeFileSync(ledger,JSON.stringify({
    schema:'evercraft.studio.inquiry.v1',id:reference,
    received_at:'2026-11-19T20:00:00Z',
    consent:true,agent_execution_authorized:false,automated_payment:false,
    state:'UNREVIEWED_NO_COMMITMENT',project:payload.project
  })+'\n',{mode:0o600});
  enqueueStudioAlert({folder:dir,reference,project:payload.project,
   received_at:'2026-11-19T20:00:00Z'});
  const receipts=path.join(dir,'alert-receipts');fs.mkdirSync(receipts,{mode:0o700});
  fs.writeFileSync(path.join(receipts,reference+'.json'),
   JSON.stringify({schema:'evercraft.studio.relay-acceptance.v1',reference,relay_inboxed:'not-a-number'}),
   {mode:0o600});
  assert.throws(()=>recoverStudioAlerts({folder:dir}),/invalid_acceptance_receipt/);
  assert.equal(fs.existsSync(path.join(dir,'alert-outbox',reference+'.json')),true);
  fs.unlinkSync(path.join(receipts,reference+'.json'));
  fs.appendFileSync(ledger,'{bad json\n');
  assert.throws(()=>recoverStudioAlerts({folder:dir}),/invalid_ledger_row/);
  assert.equal(fs.existsSync(path.join(dir,'alert-outbox',reference+'.json')),true);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
