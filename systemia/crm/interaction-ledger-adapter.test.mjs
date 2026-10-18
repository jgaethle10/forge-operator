import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {projectInteractionEvents,readPrivateInteractionLedger,resolveCrmSource} from './interaction-ledger-adapter.mjs';
import {buildCrmHeartbeat,writeCrmHeartbeatArtifacts} from './heartbeat.mjs';

const NOW=new Date('2026-10-17T20:00:00Z');
const sha=value=>'sha256:'+createHash('sha256').update(JSON.stringify(value)).digest('hex');
function event(event_id,patch={}) {
  const body={
    schema:'evercraft.interaction-ledger.event.v1',event_id,
    idempotency_key:event_id,subject_ref:'contact:private-person',
    channel:'email',direction:'system',event_type:'note',
    content_fingerprint:null,commitment_ref:null,due_at:null,
    evidence_ref:'private:evidence:'+event_id,
    occurred_at:'2026-10-17T12:00:00Z',
    recorded_at:'2026-10-17T12:01:00Z',
    raw_message_body_stored:false,...patch
  };
  return {...body,receipt_hash:sha(body)};
}
function makeLog(events) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'crm-interactions-'));
  fs.chmodSync(root,0o700);
  fs.writeFileSync(path.join(root,'interaction-events.jsonl'),events.map(x=>JSON.stringify(x)).join('\n')+'\n',{mode:0o600});
  return root;
}
test('overdue verified commitment and unresponded inbound produce review-only signals',()=>{
  const data=projectInteractionEvents([
    event('open',{event_type:'commitment_opened',commitment_ref:'promise:private-one',due_at:'2026-10-17T14:00:00Z'}),
    event('out',{direction:'outbound',event_type:'message',occurred_at:'2026-10-17T13:00:00Z'}),
    event('in',{direction:'inbound',event_type:'reply',occurred_at:'2026-10-17T15:00:00Z'})
  ],{now:NOW});
  assert.equal(data.signals.length,2);
  assert.deepEqual(data.signals.map(s=>s.kind).sort(),['commitment_overdue','reply_waiting']);
  assert.deepEqual(data.signals.map(s=>s.evidence_state).sort(),['reported','verified']);
  const {report,snapshot}=buildCrmHeartbeat(data,{now:NOW});
  assert.equal(report.coverage.due,2);
  assert.equal(report.state,'degraded'); // no Payments, EPS, Havenly or partners connected
  assert.equal(snapshot.counts.admitted,0);
  assert.equal(report.contact_permission_granted,false);
  const publicOut=JSON.stringify({report,snapshot});
  for(const sensitive of ['contact:private-person','promise:private-one','private:evidence','out','in']) {
    if(sensitive.length<5)continue;
    assert.equal(publicOut.includes(sensitive),false);
  }
});
test('fulfilled commitment and responded conversation stop triggering review',()=>{
  const data=projectInteractionEvents([
    event('open',{event_type:'commitment_opened',commitment_ref:'promise:one',due_at:'2026-10-17T14:00:00Z'}),
    event('done',{event_type:'commitment_fulfilled',commitment_ref:'promise:one',occurred_at:'2026-10-17T15:00:00Z'}),
    event('in',{direction:'inbound',event_type:'reply',occurred_at:'2026-10-17T15:00:00Z'}),
    event('out',{direction:'outbound',event_type:'message',occurred_at:'2026-10-17T17:00:00Z'})
  ],{now:NOW});
  assert.equal(data.signals.length,0);
});
test('future due date is valid but never prematurely overdue',()=>{
  const data=projectInteractionEvents([
    event('future',{event_type:'commitment_opened',commitment_ref:'promise:future',due_at:'2026-12-31T14:00:00Z'})
  ],{now:NOW});
  assert.equal(data.signals.length,0);
});
test('opted out channel is not falsely presented as an outreach opportunity',()=>{
  const data=projectInteractionEvents([
    event('in',{direction:'inbound',event_type:'reply',occurred_at:'2026-10-17T12:00:00Z'}),
    event('optout',{direction:'inbound',event_type:'opt_out',occurred_at:'2026-10-17T13:00:00Z'})
  ],{now:NOW});
  assert.equal(data.signals.length,0);
});
test('tampered hashes, duplicate events and future occurred_at are rejected',()=>{
  const one=event('x');
  assert.throws(()=>projectInteractionEvents([{...one,subject_ref:'contact:altered'}],{now:NOW}),/receipt_mismatch/);
  assert.throws(()=>projectInteractionEvents([one,one],{now:NOW}),/duplicate/);
  assert.throws(()=>projectInteractionEvents([event('future',{occurred_at:'2030-01-01T00:00:00Z'})],{now:NOW}),/occurred_at_invalid/);
});
test('private ledger adapter rereads actual JSONL and never writes source changes',()=>{
  const root=makeLog([event('open',{event_type:'commitment_opened',commitment_ref:'promise:one',due_at:'2026-10-17T14:00:00Z'})]);
  try{
    const file=path.join(root,'interaction-events.jsonl');
    const original=fs.readFileSync(file,'utf8');
    const a=readPrivateInteractionLedger(root,{now:NOW});
    const out=path.join(root,'receipts');
    const {report}=writeCrmHeartbeatArtifacts({inputData:a,inputPath:'',outDir:out,now:NOW});
    assert.equal(report.coverage.open,1);
    assert.equal(fs.readFileSync(file,'utf8'),original);
    assert.equal(fs.readFileSync(path.join(out,'latest.json'),'utf8').includes('contact:private-person'),false);
    fs.appendFileSync(file,JSON.stringify(event('done',{event_type:'commitment_fulfilled',commitment_ref:'promise:one',occurred_at:'2026-10-17T16:00:00Z'}))+'\n');
    const b=readPrivateInteractionLedger(root,{now:NOW});
    assert.equal(b.signals.length,0);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('unconfigured/missing/insecure inputs hold rather than report zero',()=>{
  assert.equal(resolveCrmSource({now:NOW}).holdReason,'source_not_configured');
  assert.equal(resolveCrmSource({ledgerStateDir:'/private/does-not-exist',now:NOW}).holdReason,'source_missing');
  const root=makeLog([]);
  try{
    fs.chmodSync(path.join(root,'interaction-events.jsonl'),0o644);
    assert.equal(resolveCrmSource({ledgerStateDir:root,now:NOW}).holdReason,'source_permissions_or_type_invalid');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
