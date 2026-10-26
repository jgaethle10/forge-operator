import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {enqueueStudioAlert,deliverStudioAlerts,alertIntent,createStudioAlertDispatcher} from '../systemia/mcp/studio-lead-relay.mjs';
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
