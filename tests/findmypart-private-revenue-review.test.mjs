import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes,createCipheriv} from 'node:crypto';
import {reviewFindMyPartInbound} from '../systemia/organism/findmypart-private-revenue-review.mjs';
import {runFindMyPartCycle} from '../systemia/organism/kaidance-findmypart-execution.mjs';
import {runCompanyHeartbeat} from '../systemia/organism/kaidance-company-heartbeat-runner.mjs';
const now=new Date('2026-11-26T22:00:00Z'),key=randomBytes(32);
const sample={schema:'evercraft.findmypart.customer-inquiry.v1',received_at:'2026-11-26T21:00:00Z',email:'buyer@example.test',part_description:'Obsolete hydraulic switch with worn serial markings',equipment_context:'Ford 3600 tractor',consent:true,state:'NEW_HUMAN_REVIEW_REQUIRED',payment_created:false,agent_execution_authorized:false};
function put(dir,n,overrides={}){
 const reference='FMP-'+String(n).padStart(24,'0');
 const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);
 const encrypted=Buffer.concat([c.update(JSON.stringify({...sample,...overrides,reference})),c.final()]);
 fs.writeFileSync(path.join(dir,reference+'.enc'),JSON.stringify({v:1,iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),data:encrypted.toString('base64')}),{mode:0o600});
 return reference;
}
test('consented encrypted cases deduplicate by actual identity and preserve separate needs; no raw PII or authority',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fmp-revenue-review-')),outDir=fs.mkdtempSync(path.join(os.tmpdir(),'fmp-cycle-'));
 try{
  const first=put(dir,1);put(dir,2,{email:'BUYER@example.test',received_at:'2026-11-26T21:10:00Z'});put(dir,3,{part_description:'Different obsolete fuel pump part needed'});
  const input={storeDir:dir,key,now,enabled:true};
  const r=reviewFindMyPartInbound(input);
  assert.equal(r.summary.state,'consented_inquiries_require_review');assert.equal(r.summary.observed_inquiries,3);
  assert.equal(r.summary.unique_case_candidates,2);assert.equal(r.summary.duplicate_inquiries,1);
  assert.equal(r.rows[0].reference,first);assert.deepEqual(r.rows[0].scope_options.map(x=>x.amount_cents),[1900,4900,9900]);
  assert.equal(r.summary.prior_contact_verified,false);assert.equal(r.summary.buyers_qualified,0);
  assert.doesNotMatch(JSON.stringify(r),/buyer@example|hydraulic switch|Ford 3600/i);
  const cycle=await runFindMyPartCycle({outDir,now,inboxBinding:input});
  assert.equal(cycle.inbound_revenue_review.unique_case_candidates,2);
  assert.equal(cycle.next_action,'reconcile_existing_revenue_desk_inbound_case_before_any_reply');
  assert.doesNotMatch(fs.readFileSync(path.join(outDir,'latest.json'),'utf8'),/FMP-[0-9]{24}|buyer@example|hydraulic switch/i);
  assert.equal(cycle.outreach_authorized,false);assert.equal(cycle.payment_verified,false);
  const companyOut=path.join(outDir,'kaidance-company-heartbeat');
  const company=runCompanyHeartbeat({outDir:companyOut,now,findmypartExecutionReceipt:cycle});
  assert.equal(company.report.findmypart.inbound_revenue_review.unique_case_candidates,2);
  assert.ok(company.queue.candidates.some(x=>x.work_key==='findmypart:consented-inbound-review'));
  assert.equal(company.next_action.current_next_action.work_key,'findmypart:consented-inbound-review');
  assert.equal(company.next_action.customer_contacts,0);
  assert.doesNotMatch(JSON.stringify(company.report),/FMP-[0-9]{24}|buyer@example|hydraulic switch/i);
  const duplicate=await runFindMyPartCycle({outDir,now,inboxBinding:input});
  assert.equal(duplicate.duplicate,true);
 }finally{fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(outDir,{recursive:true,force:true})}
});
test('missing, unsafe, invalid and partial inboxes fail closed',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fmp-revenue-review-'));
 try{
  assert.equal(reviewFindMyPartInbound({}).summary.state,'not_admitted');
  assert.equal(reviewFindMyPartInbound({storeDir:dir,key:'bad',enabled:true,now}).summary.state,'hold_private_inbox_binding');
  assert.equal(reviewFindMyPartInbound({storeDir:dir,key,enabled:true,now}).summary.state,'inbox_empty');
  put(dir,1);put(dir,2,{consent:false});
  const r=reviewFindMyPartInbound({storeDir:dir,key,enabled:true,now});
  assert.equal(r.summary.state,'hold_inbox_integrity');assert.equal(r.summary.invalid_inquiries,1);assert.equal(r.rows.length,0);
  assert.equal(reviewFindMyPartInbound({storeDir:dir,key:randomBytes(32),enabled:true,now}).summary.state,'hold_inbox_integrity');
  fs.chmodSync(dir,0o755);
  assert.equal(reviewFindMyPartInbound({storeDir:dir,key,enabled:true,now}).summary.state,'hold_private_inbox_binding');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('existing owned Gmail metadata reconciliation identifies prior contact without clearing any customer for reply',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fmp-revenue-review-')),outDir=fs.mkdtempSync(path.join(os.tmpdir(),'fmp-cycle-'));
 try{
  const first=put(dir,1);put(dir,2,{email:'new@example.test'});put(dir,3,{email:'buyer@example.test',part_description:'Other part needed for separate project'});
  const mailFile=path.join(dir,'mail.json'),hmacKeyFile=path.join(dir,'hmac.key');
  fs.writeFileSync(hmacKeyFile,'fixture-only-secret-'.repeat(3),{mode:0o600});
  const snapshot={schema:'evercraft.systemia.gmail-owned-metadata-snapshot.v1',source:'authenticated_gmail_readonly_api',observed_at:now.toISOString(),provider_send_performed:false,full_history_confirmed:true,messages:[
   {message_id:'old-send',thread_id:'thread-one',direction:'outbound',occurred_at:'2026-11-25T21:00:00Z',from_address:'owner@example.test',to_addresses:['buyer@example.test']},
   {message_id:'reply',thread_id:'thread-one',direction:'inbound',occurred_at:'2026-11-26T20:00:00Z',from_address:'buyer@example.test',to_addresses:['owner@example.test']},
   {message_id:'auto',thread_id:'thread-two',direction:'inbound',occurred_at:'2026-11-26T21:00:00Z',from_address:'new@example.test',to_addresses:['owner@example.test'],is_auto_reply:true}
  ]};
  const save=doc=>fs.writeFileSync(mailFile,JSON.stringify(doc),{mode:0o600});save(snapshot);
  const input={storeDir:dir,key,now,enabled:true,mailFile,hmacKeyFile};
  const result=reviewFindMyPartInbound(input);
  assert.equal(result.summary.unique_case_candidates,3);
  assert.equal(result.summary.contact_history.state,'local_history_observed_not_authoritative');
  assert.equal(result.summary.contact_history.prior_outbound_observed,2);
  assert.equal(result.summary.contact_history.non_auto_inbound_observed,2);
  assert.equal(result.summary.contact_history.no_matching_mail_observed,1);
  assert.equal(result.rows.find(x=>x.reference===first).next_action,'review_existing_thread_and_commitments_before_any_quote');
  assert.equal(result.rows[1].contact_history.state,'no_match_in_available_snapshot_not_clearance');
  assert.ok(result.rows.every(x=>x.contact_history.contact_clearance_granted===false));
  assert.doesNotMatch(JSON.stringify(result),/buyer@example|new@example|old-send|thread-one|hmac256:/);
  const cycle=await runFindMyPartCycle({outDir,now,inboxBinding:input});
  const company=runCompanyHeartbeat({outDir:path.join(outDir,'kaidance-company-heartbeat'),now,findmypartExecutionReceipt:cycle});
  assert.equal(company.report.findmypart.inbound_contact_history.prior_outbound_observed,2);
  assert.equal(company.report.findmypart.inbound_contact_history.contact_clearance_granted,false);
  assert.equal(company.next_action.customer_contacts,0);
  save({...snapshot,observed_at:'2026-11-24T22:00:00Z'});
  assert.equal(reviewFindMyPartInbound(input).summary.contact_history.state,'hold_history_binding_or_integrity');
  save({...snapshot,messages:[...snapshot.messages,{message_id:'bad',direction:'outbound'}]});
  assert.equal(reviewFindMyPartInbound(input).summary.contact_history.state,'hold_history_binding_or_integrity');
  save(snapshot);fs.chmodSync(mailFile,0o644);
  assert.equal(reviewFindMyPartInbound(input).summary.contact_history.state,'hold_history_binding_or_integrity');
 }finally{fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(outDir,{recursive:true,force:true})}
});
