import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {inspectStudioOwnerIntake} from '../scripts/studio-owner-intake-status.mjs';

function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'studio-private-status-test-'));
  fs.chmodSync(root,0o700);
  for(const d of ['alert-outbox','alert-receipts'])fs.mkdirSync(path.join(root,d),{mode:0o700});
  t.after(()=>fs.rmSync(root,{force:true,recursive:true}));
  return root;
}
const ref=n=>'EC-STUDIO-'+String(n).padStart(20,'0');
function record(id,fields={}){
  return {schema:'evercraft.studio.inquiry.v1',id,received_at:'2026-11-23T03:32:44.000Z',
    state:'UNREVIEWED_NO_COMMITMENT',consent:true,
    automated_payment:false,agent_execution_authorized:false,
    name:'Do not disclose this name',email:'private@example.invalid',
    goal:'Customer brief is private',...fields};
}
function addLedger(root,rows){
 fs.writeFileSync(path.join(root,'inquiries.ndjson'),
  rows.map(x=>JSON.stringify(x)).join('\n')+'\n',{mode:0o600});
}
function addAlert(root,d,id){
 fs.writeFileSync(path.join(root,d,id+'.json'),'{}\n',{mode:0o600});
}

test('empty owner-private inbox is safe, claims no Relay configuration',t=>{
 const root=fixture(t);
 const status=inspectStudioOwnerIntake({directory:root});
 assert.equal(status.inquiries_total,0);
 assert.equal(status.awaiting_relay_dispatch,0);
 assert.equal(status.all_alerts_relay_accepted,false);
 assert.equal(status.newest_inquiry_at_utc,null);
 assert.equal(status.customer_content_exposed,false);
 assert.equal(status.messages_sent,0);
 assert.equal(status.payment_authorized,false);
});
test('private intake status reports queued, accepted, and missing alerts without customer data',t=>{
 const root=fixture(t);
 addLedger(root,[record(ref(1)),record(ref(2)),record(ref(3))]);
 addAlert(root,'alert-outbox',ref(1));
 addAlert(root,'alert-receipts',ref(2));
 const before=fs.readFileSync(path.join(root,'inquiries.ndjson'));
 const status=inspectStudioOwnerIntake({directory:root});
 assert.equal(status.inquiries_total,3);
 assert.equal(status.awaiting_relay_dispatch,1);
 assert.equal(status.relay_inbox_accepted,1);
 assert.equal(status.alert_recovery_needed,1);
 assert.equal(status.all_alerts_relay_accepted,false);
 assert.equal(status.newest_inquiry_at_utc,'2026-11-23T03:32:44.000Z');
 const exposed=JSON.stringify(status);
 assert.doesNotMatch(exposed,/Do not disclose|private@example.invalid|Customer brief/);
 assert.deepEqual(fs.readFileSync(path.join(root,'inquiries.ndjson')),before);
});
test('duplicate Relay acceptance and still-pending alert is accounted for',t=>{
 const root=fixture(t);
 addLedger(root,[record(ref(4))]);
 addAlert(root,'alert-outbox',ref(4));addAlert(root,'alert-receipts',ref(4));
 const r=inspectStudioOwnerIntake({directory:root});
 assert.equal(r.relay_inbox_accepted,1);
 assert.equal(r.duplicate_pending_and_accepted,1);
 assert.equal(r.all_alerts_relay_accepted,false);
});
test('private status fails closed for unknown outbox references',t=>{
 const root=fixture(t);addAlert(root,'alert-outbox',ref(5));
 assert.throws(()=>inspectStudioOwnerIntake({directory:root}),/STUDIO_ORPHAN_ALERT_FILE_HOLD/);
});
test('private status rejects non-private ledger or symlink',t=>{
 const root=fixture(t);
 addLedger(root,[record(ref(1))]);
 fs.chmodSync(path.join(root,'inquiries.ndjson'),0o644);
 assert.throws(()=>inspectStudioOwnerIntake({directory:root}),/STUDIO_PRIVATE_STORAGE_SAFETY_HOLD/);
 fs.chmodSync(path.join(root,'inquiries.ndjson'),0o600);
 const sub=path.join(root,'alert-receipts');
 fs.rmdirSync(sub);
 fs.symlinkSync(path.join(root,'alert-outbox'),sub);
 assert.throws(()=>inspectStudioOwnerIntake({directory:root}),/STUDIO_PRIVATE_STORAGE_SAFETY_HOLD/);
});
test('corrupt or duplicate private row never receives a false clean receipt',t=>{
 const root=fixture(t);
 addLedger(root,[record(ref(1)),record(ref(1))]);
 assert.throws(()=>inspectStudioOwnerIntake({directory:root}),/STUDIO_PRIVATE_LEDGER_CONTRACT_HOLD/);
});
