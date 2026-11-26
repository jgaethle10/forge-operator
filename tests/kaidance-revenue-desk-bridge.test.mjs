import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {reconcileGmailOutreach} from '../systemia/revenue-desk/gmail-reconciliation.mjs';
import {readPrivateRevenueDeskReceipt,classifyRevenueDeskReceipt}
 from '../systemia/organism/kaidance-revenue-desk-bridge.mjs';
import {runCompanyHeartbeat} from '../systemia/organism/kaidance-company-heartbeat-runner.mjs';

const now=new Date('2026-11-25T20:00:00.000Z');
const key='fixture-key-only-not-a-real-hmac-secret-123456789';
const earlier=new Date(+now-600000).toISOString();
const later=new Date(+now-120000).toISOString();
const contact='recipient@example.test',sender='operator@example.test';
function sample({reply=true,afterReplySend=false,hold='unknown',complete=true}={}){
 const messages=[{message_id:'outbound-fixture-01',thread_id:'thread-fixture',direction:'outbound',
   occurred_at:earlier,from_address:sender,to_addresses:[contact]}];
 if(reply)messages.push({message_id:'inbound-fixture-02',thread_id:'thread-fixture',
   direction:'inbound',occurred_at:later,from_address:contact,to_addresses:[sender]});
 if(afterReplySend)messages.push({message_id:'outbound-fixture-03',thread_id:'thread-fixture',
   direction:'outbound',occurred_at:new Date(+now-60000).toISOString(),
   from_address:sender,to_addresses:[contact]});
 return reconcileGmailOutreach({messages,prospects:[{
   prospect_key:'synthetic-case',business_email:contact,stage:'researched',contact_state:hold,
   source_ref:'private-fixture',pain_evidence_ref:'private-fixture',
   official_contact_verified:true,provider_status_verified:true,
   legal_requirements_verified:true,delivery_scope_verified:true,
   passport_exact_message_permit_verified:false
 }],now:now.toISOString(),hmacKey:key,historyComplete:complete,providerDailyCap:500});
}
test('verified private reconciliation raises ONE operator-only inbound action on the existing company heartbeat',()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-revenue-private-'));
 try{
  const input=sample();
  const c=classifyRevenueDeskReceipt(input,now);
  assert.equal(c.status,'verified_private_advisory');
  assert.equal(c.unreviewed_inbound_candidates,1);
  assert.equal(c.review_candidates.length,1);
  assert.match(c.review_candidates[0].work_key,/^revenue:reply:hmac256:[a-f0-9]{64}$/);
  assert.equal(c.review_candidates[0].outreach_authorized,false);
  const out=path.join(state,'company');
  const run=runCompanyHeartbeat({root:'.',outDir:out,now,revenueDeskReceipt:input});
  assert.equal(run.report.revenue_desk_continuity.status,'verified_private_advisory');
  assert.equal(run.next_action.current_next_action.work_key,c.review_candidates[0].work_key);
  assert.equal(run.next_action.execution_performed,false);
  assert.equal(run.mission_snapshot.counts.admitted,0);
  assert.equal(run.queue.candidates.filter(x=>x.work_key.startsWith('revenue:reply:')).length,1);
  for(const p of ['latest.json','queue.json','mission-snapshot.json','next-action.json']){
   const text=fs.readFileSync(path.join(out,p),'utf8');
   assert.ok(!text.includes(contact)&&!text.includes(sender));
   assert.ok(!text.includes('inbound-fixture-02'));
  }
  assert.equal(runCompanyHeartbeat({root:'.',outDir:out,now,revenueDeskReceipt:input}).duplicate,true);
 }finally{fs.rmSync(state,{recursive:true,force:true})}
});
test('an inbound already followed by an outbound is NOT queued as another chase',()=>{
 const c=classifyRevenueDeskReceipt(sample({afterReplySend:true}),now);
 assert.equal(c.status,'verified_private_advisory');
 assert.equal(c.unreviewed_inbound_candidates,0);
 assert.equal(c.review_candidates.length,0);
});
test('suppressed recipients and incomplete private history never become send-ready',()=>{
 const blocked=classifyRevenueDeskReceipt(sample({hold:'customer_hold'}),now);
 assert.equal(blocked.review_candidates.length,0);
 assert.equal(blocked.suppressed_contacts,1);
 const incomplete=classifyRevenueDeskReceipt(sample({complete:false}),now);
 assert.equal(incomplete.status,'held_incomplete_source');
 assert.equal(incomplete.review_candidates.length,0);
 assert.equal(incomplete.outreach_authorized,false);
});
test('stale, forged provider payment, raw personal data and send authority fail closed',()=>{
 const v=sample();
 for(const change of [
  x=>x.generated_at=new Date(+now-3*3600000).toISOString(),
  x=>x.send_performed=true,
  x=>x.paid_revenue_verified=true,
  x=>x.quota.allow_unattended_sending=true,
  x=>x.private_body_exported=true,
  x=>x.prospects[0].prospect_ref='somebody@example.test',
  x=>x.prospects[0].send_authorized=true,
  x=>x.funnel.newly_paid_orders_verified=1
 ]){
  const x=structuredClone(v);change(x);
  const c=classifyRevenueDeskReceipt(x,now);
  assert.ok(['stale','invalid'].includes(c.status));
  assert.equal(c.review_candidates.length,0);
 }
});
test('private receipt file reader requires 0600 file and 0700 parent; blocks symlink',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-revenue-input-'));
 const file=path.join(dir,'reconciled-gmail-report.json');
 try{
  fs.writeFileSync(file,JSON.stringify(sample()),{mode:0o600});
  assert.equal(readPrivateRevenueDeskReceipt(file).schema,'evercraft.systemia.gmail-reconciliation.v1');
  fs.chmodSync(file,0o644);
  assert.throws(()=>readPrivateRevenueDeskReceipt(file),/permissions/);
  fs.chmodSync(file,0o600);
  const link=path.join(dir,'linked.json');fs.symlinkSync(file,link);
  assert.throws(()=>readPrivateRevenueDeskReceipt(link),/symlink/);
  fs.chmodSync(dir,0o755);
  assert.throws(()=>readPrivateRevenueDeskReceipt(file),/permissions/);
 }finally{fs.chmodSync(dir,0o700);fs.rmSync(dir,{recursive:true,force:true})}
});
