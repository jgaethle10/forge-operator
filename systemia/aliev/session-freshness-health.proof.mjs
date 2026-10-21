import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {freshnessDeploymentPreflight,readFreshnessHealth} from './session-freshness-health.mjs';
import {claimFreshnessSlot} from './session-freshness-slot.mjs';
const at='2026-10-08T02:42:00.000Z';
const receipt={schema:'evercraft.rivet.owned-session-freshness-receipt.v1',ok:true,state:'VERIFIED',
  received_at:'2026-10-08T02:41:12Z',refreshed_at:'2026-10-08T02:41:11Z',source_receipt_id:'aliev-persisted-id',
  latest_observed_at:null};
const ledger=(dir,row)=>{const f=path.join(dir,'receipts.jsonl');fs.writeFileSync(f,JSON.stringify(row)+'\n');return f};
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'aliev-health-proof-'));

test('deployment doctor is held without required configuration and does not expose credentials',()=>{
  const d=freshnessDeploymentPreflight({endpoint:'',machineKey:'not-shown',ledgerPath:'/tmp/rivet-receipt.jsonl',slotStateDir:'/tmp/rivet-slots',enabled:false});
  assert.equal(d.state,'HELD');
  assert.equal(d.ready_for_live_canary,false);
  assert.equal(JSON.stringify(d).includes('not-shown'),false);
  assert.deepEqual(d.gaps,['trusted_refresh_origin_not_pinned','refresh_endpoint_invalid_or_untrusted','resident_not_enabled']);
});
test('configured is not a claim of an authorized invocation or deployment',()=>{
  const d=freshnessDeploymentPreflight({
    endpoint:'https://api.example.org/api/apps/test/functions/refreshSessionFreshness',
    trustedOrigin:'https://api.example.org',
    machineKey:'test-only-secret',ledgerPath:'/var/lib/evercraft/rivet/receipts.jsonl',
    slotStateDir:'/var/lib/evercraft/rivet/slots',enabled:true
  });
  assert.equal(d.state,'CONFIGURED_NOT_YET_LIVE_PROVEN');
  assert.equal(d.live_invocation_verified,false);
  assert.equal(d.deployment_attested,false);
});
test('healthy recent persisted receipt is not mistaken for source observation time',()=>{
  const dir=temp();
  try{
    const f=ledger(dir,receipt);
    const h=readFreshnessHealth({ledgerPath:f,slotStateDir:path.join(dir,'not-created'),now:new Date(at)});
    assert.equal(h.ok,true);
    assert.equal(h.state,'CURRENT_VERIFIED_RECEIPT');
    assert.equal(h.last_verified_source_receipt_id,'aliev-persisted-id');
    assert.equal(h.latest_observed_at,null);
    assert.equal(h.deployment_attested,false);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('missing ledger is explicitly NOT_PROVEN, never zero activity',()=>{
  const dir=temp();
  try{
    const h=readFreshnessHealth({ledgerPath:path.join(dir,'missing.jsonl'),slotStateDir:dir,now:new Date(at)});
    assert.equal(h.ok,false);
    assert.equal(h.state,'NOT_PROVEN');
    assert(h.issues.includes('receipt_ledger_missing'));
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('stale receipt and failed newest receipt are degraded',()=>{
  const dir=temp();
  try{
    const f=ledger(dir,{...receipt,received_at:'2026-10-07T12:00:00Z'});
    let h=readFreshnessHealth({ledgerPath:f,slotStateDir:dir,now:new Date(at)});
    assert.equal(h.state,'STALE');
    ledger(dir,{...receipt,state:'FAILED',ok:false,received_at:'2026-10-08T02:40:00Z'});
    h=readFreshnessHealth({ledgerPath:f,slotStateDir:dir,now:new Date(at)});
    assert.equal(h.state,'DEGRADED');
    assert(h.issues.includes('latest_receipt_not_verified'));
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('unresolved interrupted STARTED slot takes precedence over later good receipts',()=>{
  const dir=temp();
  try{
    const f=ledger(dir,receipt);
    const slots=path.join(dir,'slots');
    claimFreshnessSlot({stateDir:slots,slot:'2026-10-08T01Z',now:()=> '2026-10-08T01:32:01Z'});
    const h=readFreshnessHealth({ledgerPath:f,slotStateDir:slots,now:new Date(at)});
    assert.equal(h.state,'HOLD_UNRESOLVED_SLOT');
    assert.equal(h.ok,false);
    assert.equal(h.unresolved_slot,'2026-10-08T01Z.json');
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('truncated or malformed last receipt cannot be silently accepted',()=>{
  const dir=temp();
  try{
    const f=ledger(dir,receipt);
    fs.appendFileSync(f,'{not-json}\n');
    const h=readFreshnessHealth({ledgerPath:f,slotStateDir:dir,now:new Date(at)});
    assert.equal(h.state,'NOT_PROVEN');
    assert(h.issues.includes('receipt_ledger_invalid_or_unreadable'));
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('source cycle lineage is required for current verification',()=>{
  const dir=temp();
  try{
    const f=ledger(dir,{...receipt,source_receipt_id:null});
    const h=readFreshnessHealth({ledgerPath:f,slotStateDir:dir,now:new Date(at)});
    assert.equal(h.ok,false);
    assert(h.issues.includes('source_cycle_lineage_missing'));
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('complete JSON without trailing newline is a torn append and cannot verify',()=>{
  const dir=temp();
  try{
    const f=ledger(dir,receipt);
    fs.writeFileSync(f,JSON.stringify(receipt));
    const h=readFreshnessHealth({ledgerPath:f,slotStateDir:dir,now:new Date(at)});
    assert.equal(h.ok,false);
    assert(h.issues.includes('receipt_ledger_invalid_or_unreadable'));
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('deployment doctor refuses valid-looking refresh endpoint without independent origin pin',()=>{
  const d=freshnessDeploymentPreflight({
    endpoint:'https://api.example.org/api/apps/test/functions/refreshSessionFreshness',
    trustedOrigin:'',machineKey:'test-only-secret',
    ledgerPath:'/var/lib/evercraft/rivet/receipts.jsonl',
    slotStateDir:'/var/lib/evercraft/rivet/slots',enabled:true
  });
  assert.equal(d.ready_for_live_canary,false);
  assert(d.gaps.includes('trusted_refresh_origin_not_pinned'));
  assert(d.gaps.includes('refresh_endpoint_invalid_or_untrusted'));
  assert.equal(d.configured_endpoint_origin,null);
});
