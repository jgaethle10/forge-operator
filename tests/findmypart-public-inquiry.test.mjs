import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {startFabricLocalRuntime} from '../systemia/mcp/fabric-local-runtime.mjs';
import {validateFindMyPartInquiry,createFindMyPartInquiryAlertDispatcher,readFindMyPartPrivateInquiry,reconcileFindMyPartInquiryOutbox} from '../systemia/mcp/findmypart-public-inquiry.mjs';

const ORIGIN='https://fabric.systemiacommandcenters.com';
const brief={
  part_description:'Broken power selector switch with worn markings, no dealer replacement found',
  equipment_context:'Ford 3600 tractor, late 1970s',
  email:'customer@example.test',consent:true,website:'',
};
const key=crypto.randomBytes(32);
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'findmypart-public-test-'));
const post=(url,data,origin=ORIGIN)=>fetch(url+'/api/findmypart/inquiry',{
  method:'POST',headers:{origin,'content-type':'application/json'},
  body:JSON.stringify(data)
});

test('validator requires only part, equipment, reply email and consent',()=>{
 assert.ok(validateFindMyPartInquiry(brief).value);
 assert.equal(validateFindMyPartInquiry({...brief,part_description:'x'}).error,'missing_part_or_contact_details');
 assert.equal(validateFindMyPartInquiry({...brief,equipment_context:''}).error,'missing_part_or_contact_details');
 assert.equal(validateFindMyPartInquiry({...brief,email:'not an address'}).error,'missing_part_or_contact_details');
 assert.equal(validateFindMyPartInquiry({...brief,consent:false}).error,'consent_required');
 assert.equal(validateFindMyPartInquiry({...brief,website:'honeypot'}).honeypot,true);
});

test('first-party buyer POST is encrypted, private, durable and not a charge',async()=>{
 const dir=temp();
 const rt=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false,
   findMyPartLeadsDir:dir,findMyPartIntakeKey:key});
 try{
  const response=await post(rt.url,brief);
  assert.equal(response.status,201);
  assert.equal(response.headers.get('access-control-allow-origin'),ORIGIN);
  const receipt=await response.json();
  assert.equal(receipt.received,true);
  assert.match(receipt.reference,/^FMP-[A-F0-9]{24}$/);
  assert.match(receipt.message,/No payment or order has been created/);
  const encryptedFile=path.join(dir,receipt.reference+'.enc');
  const ciphertext=fs.readFileSync(encryptedFile,'utf8');
  assert.doesNotMatch(ciphertext,/customer@example\.test|Broken power selector|Ford 3600/);
  assert.equal(fs.statSync(encryptedFile).mode&0o777,0o600);
  const restored=readFindMyPartPrivateInquiry({storeDir:dir,key,reference:receipt.reference});
  assert.equal(restored.email,brief.email);
  assert.equal(restored.part_description,brief.part_description);
  assert.equal(restored.equipment_context,brief.equipment_context);
  assert.equal(restored.state,'NEW_HUMAN_REVIEW_REQUIRED');
  assert.equal(restored.payment_created,false);
  assert.throws(()=>readFindMyPartPrivateInquiry({storeDir:dir,key:Buffer.alloc(32),reference:receipt.reference}));
  assert.throws(()=>readFindMyPartPrivateInquiry({storeDir:dir,key,reference:'../invalid'}));
  assert.equal(fs.statSync(dir).mode&0o777,0o700);
  const alert=JSON.parse(fs.readFileSync(path.join(dir,'alert-outbox',receipt.reference+'.json'),'utf8'));
  assert.equal(alert.has_customer_pii,false);
  assert.equal(alert.reference,receipt.reference);
  assert.doesNotMatch(JSON.stringify(alert),/customer@example|power selector|Ford 3600/);
  const options=await fetch(rt.url+'/api/findmypart/inquiry',{method:'GET',headers:{origin:ORIGIN}});
  assert.equal(options.status,405);
  assert.equal((await options.json()).error,'method_not_allowed');
 }finally{await rt.close();fs.rmSync(dir,{recursive:true,force:true})}
});

test('without operator-managed encryption key request fails closed',async()=>{
 const dir=temp();
 const rt=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false,
   findMyPartLeadsDir:dir,findMyPartIntakeKey:'invalid'});
 try{
  const response=await post(rt.url,brief);
  assert.equal(response.status,503);
  assert.equal((await response.json()).error,'intake_unavailable');
  assert.equal(fs.readdirSync(dir).length,0);
 }finally{await rt.close();fs.rmSync(dir,{recursive:true,force:true})}
});

test('off-origin, nonconsenting, spam and oversized requests never create leads',async()=>{
 const dir=temp();
 const rt=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false,
   findMyPartLeadsDir:dir,findMyPartIntakeKey:key});
 try{
  assert.equal((await post(rt.url,brief,'https://attacker.example')).status,403);
  assert.equal((await post(rt.url,{...brief,consent:false})).status,422);
  const spam=await post(rt.url,{...brief,website:'https://spam.example'});
  assert.equal(spam.status,202);
  assert.equal((await spam.json()).received,false);
  const huge=await post(rt.url,{...brief,part_description:'x'.repeat(6000)});
  assert.equal(huge.status,413);
  assert.equal(fs.readdirSync(dir).length,0);
 }finally{await rt.close();fs.rmSync(dir,{recursive:true,force:true})}
});

test('rate limits repeated buyer email but keeps successful submissions',async()=>{
 const dir=temp();
 const rt=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false,
   findMyPartLeadsDir:dir,findMyPartIntakeKey:key});
 try{
  for(let i=0;i<3;i++)assert.equal((await post(rt.url,{...brief,part_description:brief.part_description+' #'+i})).status,201);
  const limit=await post(rt.url,brief);
  assert.equal(limit.status,429);
  assert.equal((await limit.json()).error,'too_many_requests');
  assert.equal(fs.readdirSync(dir).filter(x=>x.endsWith('.enc')).length,3);
 }finally{await rt.close();fs.rmSync(dir,{recursive:true,force:true})}
});

test('operator notification relay sends only reference, and only counts durable inbox ack',async()=>{
 const dir=temp();fs.mkdirSync(path.join(dir,'alert-outbox'),{recursive:true,mode:0o700});
 const reference='FMP-'+crypto.randomBytes(12).toString('hex').toUpperCase();
 fs.writeFileSync(path.join(dir,'alert-outbox',reference+'.json'),JSON.stringify({
  schema:'evercraft.findmypart.private-alert.v1',reference,received_at:new Date().toISOString(),has_customer_pii:false,
 }),{mode:0o600});
 let notification;
 const relay=createFindMyPartInquiryAlertDispatcher({
  folder:dir,recipient:'evercraft-owner',notify:async x=>{notification=x;return {inboxed:1}},
 });
 try{
  const result=await relay.dispatch();
  assert.equal(result.accepted,1);
  assert.equal(notification.product,'findmypart');
  assert.equal(notification.data.contains_customer_pii,false);
  assert.doesNotMatch(JSON.stringify(notification),/customer@example|power selector/i);
  assert.equal(fs.existsSync(path.join(dir,'alert-outbox',reference+'.json')),false);
  assert.equal(fs.existsSync(path.join(dir,'alert-receipts',reference+'.json')),true);
 }finally{relay.stop();fs.rmSync(dir,{recursive:true,force:true})}
});

test('restart reconciles a missing alert without exposing buyer details or duplicating inbox writes',async()=>{
 const dir=temp();
 const rt=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false,
   findMyPartLeadsDir:dir,findMyPartIntakeKey:key});
 let reference;
 try{
   const response=await post(rt.url,brief);
   assert.equal(response.status,201);
   reference=(await response.json()).reference;
 }finally{await rt.close()}
 const pending=path.join(dir,'alert-outbox',reference+'.json');
 fs.unlinkSync(pending); // Simulate power loss after encrypted fsync and before alert write.
 const repair=reconcileFindMyPartInquiryOutbox({storeDir:dir,key});
 assert.equal(repair.restored,1);
 assert.equal(repair.contains_customer_pii,false);
 const payload=fs.readFileSync(pending,'utf8');
 assert.doesNotMatch(payload,/customer@example|power selector|Ford 3600/);
 assert.deepEqual(JSON.parse(payload).reference,reference);
 assert.equal(reconcileFindMyPartInquiryOutbox({storeDir:dir,key}).restored,0);
 let messages=0;
 const dispatcher=createFindMyPartInquiryAlertDispatcher({
   folder:dir,key,recipient:'evercraft-owner',notify:async()=>{messages++;return {inboxed:1}},
 });
 try{
   const first=await dispatcher.dispatch();
   assert.equal(first.accepted,1);
   assert.equal(messages,1);
   assert.equal(fs.existsSync(pending),false);
   const receipt=path.join(dir,'alert-receipts',reference+'.json');
   assert.equal(fs.existsSync(receipt),true);
   // Simulate power loss between writing successful receipt and deleting outbox.
   fs.writeFileSync(pending,payload,{mode:0o600});
   assert.equal((await dispatcher.dispatch()).accepted,1);
   assert.equal(messages,1,'durable delivery receipt must suppress replay');
   assert.equal(fs.existsSync(pending),false);
   assert.equal(reconcileFindMyPartInquiryOutbox({storeDir:dir,key}).restored,0);
 }finally{dispatcher.stop();fs.rmSync(dir,{recursive:true,force:true})}
});

test('orphan recovery refuses tampered private records and never invents a lead',async()=>{
 const dir=temp();
 const rt=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false,
   findMyPartLeadsDir:dir,findMyPartIntakeKey:key});
 let reference;
 try{
  assert.equal((await post(rt.url,brief)).status,201);
  // Extract the generated reference from the unique private file, never PII.
  reference=fs.readdirSync(dir).find(n=>/^FMP-[A-F0-9]{24}\.enc$/.test(n)).slice(0,-4);
 }finally{await rt.close()}
 fs.unlinkSync(path.join(dir,'alert-outbox',reference+'.json'));
 const record=path.join(dir,reference+'.enc');
 const encrypted=JSON.parse(fs.readFileSync(record,'utf8'));
 encrypted.data='not-authentic';
 fs.writeFileSync(record,JSON.stringify(encrypted),{mode:0o600});
 try{
  assert.equal(reconcileFindMyPartInquiryOutbox({storeDir:dir,key}).restored,0);
  assert.equal(fs.existsSync(path.join(dir,'alert-outbox',reference+'.json')),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('private owner CLI lists only references, reveals PII only with explicit flag',async()=>{
 const dir=temp();const env={...process.env,
  EVERCRAFT_FINDMYPART_LEADS_DIR:dir,EVERCRAFT_FINDMYPART_INTAKE_KEY_B64:key.toString('base64')};
 const rt=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false,
   findMyPartLeadsDir:dir,findMyPartIntakeKey:key});
 const script=path.join(process.cwd(),'scripts/findmypart-owner-inbox.mjs');
 try{
  const response=await post(rt.url,brief);
  const result=await response.json();
  assert.equal(response.status,201);
  const listed=JSON.parse(execFileSync(process.execPath,[script,'list'],{env,encoding:'utf8'}));
  assert.equal(listed.count,1);
  assert.equal(listed.contains_buyer_pii,false);
  assert.equal(listed.entries[0].reference,result.reference);
  assert.doesNotMatch(JSON.stringify(listed),/customer@example|power selector|Ford 3600/);
  assert.throws(()=>execFileSync(process.execPath,[script,'show',result.reference],{env,stdio:'pipe'}));
  const shown=JSON.parse(execFileSync(process.execPath,[script,'show',result.reference,'--reveal'],{env,encoding:'utf8'}));
  assert.equal(shown.reply_email,brief.email);
  assert.equal(shown.part_description,brief.part_description);
  assert.equal(shown.payment_created,false);
  assert.equal(shown.agent_execution_authorized,false);
 }finally{await rt.close();fs.rmSync(dir,{recursive:true,force:true})}
});
