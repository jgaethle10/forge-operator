import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startFabricLocalRuntime } from '../systemia/mcp/fabric-local-runtime.mjs';
import {
  validateSignalBuyerInquiry, readSignalPrivateInquiry,
  signalBuyerIntakeReadiness, reconcileSignalAlertOutbox,
  createSignalInquiryAlertDispatcher
} from '../systemia/mcp/signal-public-inquiry.mjs';

const ORIGIN='https://jgaethle10.github.io';
const key=crypto.randomBytes(32);
const dir=()=>fs.mkdtempSync(path.join(os.tmpdir(),'signal-intake-test-'));
const request={
  email:'analyst@example.test',
  incident:'Savannah River Site laboratory fire',
  question:'Which public emergency statements conflict, and what records would resolve the differences?',
  location:'South Carolina',
  organization:'Example independent newsroom',
  source:'https://public.srs.gov/2026/10/savannah-river-site-emergency-response-event/',
  consent:true,website:''
};
const post=(base,body,origin=ORIGIN)=>fetch(base+'/api/signal/inquiry',{
  method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)
});
function temporaryRuntime(storeDir,secret=key){
  return startFabricLocalRuntime({
    host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false,
    signalLeadsDir:storeDir,signalIntakeKey:secret
  });
}
test('Signal scope validator enforces a bounded consented request, never authorizes an order',()=>{
  const good=validateSignalBuyerInquiry(request);
  assert.equal(good.value.offer_key,'signal.incident_evidence_brief_250.v1');
  assert.equal(validateSignalBuyerInquiry({...request,email:'invalid'}).error,'invalid_scope_or_contact');
  assert.equal(validateSignalBuyerInquiry({...request,consent:false}).error,'consent_required');
  assert.equal(validateSignalBuyerInquiry({...request,question:'why?'}).error,'invalid_scope_or_contact');
  assert.equal(validateSignalBuyerInquiry({...request,source:'http://example.com'}).error,'public_https_source_required');
  assert.equal(validateSignalBuyerInquiry({...request,source:'https://127.0.0.1/'}).error,'public_https_source_required');
  assert.equal(validateSignalBuyerInquiry({...request,website:'spam'}).honeypot,true);
});
test('owned native intake stores encrypted buyer data and returns a receipt without charging',async()=>{
  const folder=dir(),runtime=await temporaryRuntime(folder);
  try{
    const result=await post(runtime.url,request);
    assert.equal(result.status,201);
    assert.equal(result.headers.get('access-control-allow-origin'),ORIGIN);
    const data=await result.json();
    assert.equal(data.received,true);
    assert.match(data.reference,/^ECS-[A-F0-9]{24}$/);
    assert.match(data.message,/No order, charge, or delivery date/);
    const filename=path.join(folder,data.reference+'.enc');
    const ciphertext=fs.readFileSync(filename,'utf8');
    assert.doesNotMatch(ciphertext,/analyst@example|Savannah River Site laboratory fire/);
    assert.equal(fs.statSync(filename).mode&0o777,0o600);
    const privateRecord=readSignalPrivateInquiry({storeDir:folder,key,reference:data.reference});
    assert.equal(privateRecord.email,'analyst@example.test');
    assert.equal(privateRecord.incident,request.incident);
    assert.equal(privateRecord.payment_created,false);
    assert.equal(privateRecord.scope_accepted,false);
    assert.equal(privateRecord.execution_authorized,false);
    assert.throws(()=>readSignalPrivateInquiry({storeDir:folder,key:Buffer.alloc(32),reference:data.reference}));
    const alertFile=path.join(folder,'alert-outbox',data.reference+'.json');
    assert.ok(fs.existsSync(alertFile));
    const alert=JSON.parse(fs.readFileSync(alertFile,'utf8'));
    assert.equal(alert.reference,data.reference);
    assert.equal(alert.has_customer_pii,false);
    assert.doesNotMatch(JSON.stringify(alert),/analyst@example|Savannah River/);
    const publicGet=await fetch(runtime.url+'/api/signal/inquiry',{headers:{origin:ORIGIN}});
    assert.equal(publicGet.status,405);
  }finally{await runtime.close();fs.rmSync(folder,{recursive:true,force:true})}
});

test('authorized owner can view references and draft a scoped reply without marking payment',async()=>{
  const folder=dir(),runtime=await temporaryRuntime(folder);
  let reference;
  try{
    const response=await post(runtime.url,request);
    assert.equal(response.status,201);
    reference=(await response.json()).reference;
  }finally{await runtime.close()}
  const script=path.join(process.cwd(),'scripts/signal-owner-inbox.mjs');
  const env={...process.env,EVERCRAFT_SIGNAL_LEADS_DIR:folder,EVERCRAFT_SIGNAL_INTAKE_KEY_B64:key.toString('base64')};
  const call=(...args)=>JSON.parse(execFileSync(process.execPath,[script,...args],{env,encoding:'utf8'}));
  try{
    const status=call('status');
    assert.equal(status.records,1);
    assert.equal(status.contains_buyer_pii,false);
    assert.doesNotMatch(JSON.stringify(status),/analyst@example|Savannah River/);
    const list=call('list');
    assert.equal(list.records[0].reference,reference);
    assert.doesNotMatch(JSON.stringify(list),/analyst@example|Savannah River/);
    const draft=call('draft',reference,'--reveal');
    assert.equal(draft.to,request.email);
    assert.equal(draft.sent,false);
    assert.equal(draft.order_created,false);
    assert.equal(draft.payment_verified,false);
    assert.match(draft.body,/Evercraft Payments/);
    const revealed=call('show',reference,'--reveal');
    assert.equal(revealed.email,request.email);
    assert.equal(revealed.incident,request.incident);
  }finally{fs.rmSync(folder,{recursive:true,force:true})}
});

test('unconfigured or missing private key fails closed and never takes customer data',async()=>{
  const folder=dir(),runtime=await temporaryRuntime(folder,'');
  try{
    const readiness=await fetch(runtime.url+'/api/signal/readiness');
    const status=await readiness.json();
    assert.equal(status.intake_available,false);
    assert.equal(status.payment_ready,false);
    const result=await post(runtime.url,request);
    assert.equal(result.status,503);
    assert.equal((await result.json()).error,'intake_unavailable');
    assert.equal(fs.readdirSync(folder).length,0);
  }finally{await runtime.close();fs.rmSync(folder,{recursive:true,force:true})}
});
test('ready state reveals availability without exposing buyer identity, path or secret',async()=>{
  const folder=dir(),runtime=await temporaryRuntime(folder);
  try{
    const response=await fetch(runtime.url+'/api/signal/readiness');
    assert.equal(response.status,200);
    const status=await response.json();
    assert.equal(status.intake_available,true);
    assert.equal(status.payment_verified,false);
    assert.doesNotMatch(JSON.stringify(status),/analyst@example|signal-intake-test|private_key/);
    assert.equal(signalBuyerIntakeReadiness({storeDir:folder,key}).intake_available,true);
  }finally{await runtime.close();fs.rmSync(folder,{recursive:true,force:true})}
});
test('off-origin, no-consent, honeypot and too-large requests are not leads',async()=>{
  const folder=dir(),runtime=await temporaryRuntime(folder);
  try{
    assert.equal((await post(runtime.url,request,'https://attacker.example')).status,403);
    assert.equal((await post(runtime.url,{...request,consent:false})).status,422);
    const honeypot=await post(runtime.url,{...request,website:'fake'});
    assert.equal(honeypot.status,202);
    assert.equal((await honeypot.json()).received,false);
    assert.equal((await post(runtime.url,{...request,question:'z'.repeat(5000)})).status,413);
    assert.equal(fs.readdirSync(folder).filter(n=>n.endsWith('.enc')).length,0);
  }finally{await runtime.close();fs.rmSync(folder,{recursive:true,force:true})}
});
test('buyer email rate limit blocks a fourth repeated inquiry',async()=>{
  const folder=dir(),runtime=await temporaryRuntime(folder);
  try{
    for(let i=0;i<3;i++)assert.equal((await post(runtime.url,{...request,question:request.question+' #'+i})).status,201);
    const fourth=await post(runtime.url,request);
    assert.equal(fourth.status,429);
    assert.equal(fs.readdirSync(folder).filter(n=>n.endsWith('.enc')).length,3);
  }finally{await runtime.close();fs.rmSync(folder,{recursive:true,force:true})}
});
test('private alert dispatcher never forwards PII and deduplicates an inboxed receipt',async()=>{
  const folder=dir(),runtime=await temporaryRuntime(folder);
  let reference;
  try{
    const response=await post(runtime.url,request);
    assert.equal(response.status,201);reference=(await response.json()).reference;
  }finally{await runtime.close()}
  const alerts=[];
  const worker=createSignalInquiryAlertDispatcher({
    folder,key,recipient:'evercraft-owner',
    notify:async intent=>{alerts.push(intent);return {inboxed:1}}
  });
  try{
    const first=await worker.dispatch();
    assert.equal(first.accepted,1);
    assert.equal(alerts.length,1);
    assert.equal(alerts[0].product,'signal');
    assert.equal(alerts[0].data.contains_customer_pii,false);
    assert.doesNotMatch(JSON.stringify(alerts),/analyst@example|Savannah River/);
    const name=reference+'.json',out=path.join(folder,'alert-outbox',name),rc=path.join(folder,'alert-receipts',name);
    assert.ok(fs.existsSync(rc));
    assert.ok(!fs.existsSync(out));
    fs.writeFileSync(out,JSON.stringify({schema:'evercraft.signal.buyer-alert.v1',reference,received_at:new Date().toISOString(),has_customer_pii:false})+'\n',{mode:0o600});
    assert.equal((await worker.dispatch()).accepted,1);
    assert.equal(alerts.length,1);
    fs.rmSync(rc);
    assert.equal(reconcileSignalAlertOutbox({storeDir:folder,key}).repaired,1);
  }finally{worker.stop();fs.rmSync(folder,{recursive:true,force:true})}
});
