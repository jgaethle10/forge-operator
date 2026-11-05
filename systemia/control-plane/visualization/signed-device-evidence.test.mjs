import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createGoalState, admitGoalPlan, startGoalWork, recordGoalOutcome } from '../../organism/goal-runtime.mjs';
import { signMicroSeedExecutionReceipt } from '../../saban/microseed-receipt-signature.mjs';
import { correlateSignedDeviceEvidence } from './signed-device-evidence.mjs';

const T0 = new Date('2026-11-05T22:55:00.000Z');
const T1 = new Date('2026-11-05T22:56:00.000Z');
const T2 = new Date('2026-11-05T22:57:00.000Z');
const NOW = new Date('2026-11-05T22:58:00.000Z');
function fixture(){
  const {publicKey, privateKey} = generateKeyPairSync('ed25519');
  const goalKey='private-mission-foo';
  const initial = createGoalState({
    goalKey, objective:'Customer private-secret@example.com', now:T0,
  });
  const planned = admitGoalPlan({state:initial,now:T0,plan:[
    {work_key:'private-work-001',work_type:'research'},
  ]});
  const started = startGoalWork({state:planned,workKey:'private-work-001',now:T1});
  const receipt=signMicroSeedExecutionReceipt({
    schema:'evercraft.microseed.execution-receipt.v1',
    device_id:'node002-device',
    workload_class:'systemia.content-hash.v1',
    idempotency_key:started.tasks[0].attempt_key,
    request_hash:'sha256:'+'1'.repeat(64),
    manifest_hash:'sha256:'+'2'.repeat(64),
    safety_receipt_ref:'sha256:'+'3'.repeat(64),
    result:{ok:true,digest:'sha256:'+'4'.repeat(64)},
    execution_location:'device',
    deduplicated:false,
    arbitrary_code_execution:false,
    primary_function_priority:true,
    external_cash_spend_usd:0,
    incremental_energy_cost_state:'not_measured',
    completed_at:new Date('2026-11-05T22:56:30.000Z').toISOString(),
    receipt_hash:'sha256:'+'5'.repeat(64),
  },{privateKey,key_id:'node002-key-v1'});
  const completed = recordGoalOutcome({
    state:started,workKey:'private-work-001',expectedAttempt:1,
    result:'complete',receiptRef:receipt.receipt_hash,now:T2,
  });
  const keys={'node002-key-v1':{
    device_id:'node002-device',
    public_key_pem:publicKey.export({type:'spki',format:'pem'}).toString(),
    allowed_workload_classes:['systemia.content-hash.v1'],
  }};
  return {state:completed,receipt,keys};
}
const view = f => correlateSignedDeviceEvidence(f.state,{
  signedReceipts:[f.receipt],trustedDeviceKeys:f.keys,now:NOW,
});

test('valid device signature is bound to the persisted attempt without proving effect',()=>{
  const f=fixture(),result=view(f);
  assert.equal(result.summary.signed_device_receipts_matched,1);
  assert.equal(result.summary.verified_receipts,0);
  assert.equal(result.provenance.signature_verified,false);
  assert.equal(result.provenance.independent_effect_verified,false);
  assert.equal(result.provenance.execution_authority_granted,false);
  assert.equal(result.nodes[1].status,'reported_complete_unverified');
  assert.equal(result.nodes[1].device_signature_state,'verified_against_pinned_device_key');
  assert.equal(result.receipts[0].outcome_state,'unverified');
  const json=JSON.stringify(result);
  for(const secret of ['private-secret@example.com','private-work-001','private-mission-foo','node002-key-v1','node002-device','sha256:'+ '5'.repeat(64)]){
    assert.ok(!json.includes(secret),'private data leaked: '+secret);
  }
});
test('no supplied receipt remains zero verified and creates no fake success',()=>{
  const f=fixture();
  const result=correlateSignedDeviceEvidence(f.state,{now:NOW});
  assert.equal(result.summary.signed_device_receipts_matched,0);
  assert.deepEqual(result.receipts,[]);
  assert.equal(result.summary.verified_receipts,0);
});
test('signature mismatch or modified signed result fails closed',()=>{
  const f=fixture();f.receipt.result.digest='sha256:'+'9'.repeat(64);
  assert.throws(()=>view(f),/device_signature_rejected/);
});
test('an unknown or mismatched trust key fails closed',()=>{
  const f=fixture();f.keys={};
  assert.throws(()=>view(f),/untrusted_device_key/);
  const g=fixture();g.keys['node002-key-v1'].device_id='other-device';
  assert.throws(()=>view(g),/device_trust_scope_invalid/);
  const h=fixture();h.keys['node002-key-v1'].allowed_workload_classes=['unsafe.shell'];
  assert.throws(()=>view(h),/device_trust_scope_invalid/);
});
test('signed receipt cannot be borrowed by a different persisted attempt or reference',()=>{
  const f=fixture();f.state.tasks[0].attempt_key='forged-attempt';
  assert.throws(()=>view(f),/attempt_not_bound/);
  const g=fixture();g.state.tasks[0].receipt_refs=['sha256:'+'9'.repeat(64)];
  assert.throws(()=>view(g),/goal_receipt_reference_mismatch/);
});
test('failed or pending goal state cannot become verified by signed receipt',()=>{
  const f=fixture();f.state.tasks[0].status='executing';
  assert.throws(()=>view(f),/goal_completion_not_reported/);
});
test('receipt outside attempt window fails closed',()=>{
  const f=fixture();f.state.tasks[0].execution_started_at='2026-11-05T23:00:00.000Z';
  assert.throws(()=>view(f),/receipt_outside_attempt_window/);
});
test('unsafe code or cash spend cannot be silently marked trusted',()=>{
  const f=fixture();f.receipt.arbitrary_code_execution=true;
  assert.throws(()=>view(f),/device_signature_rejected|device_safety_boundary_violation/);
  const g=fixture();g.receipt.external_cash_spend_usd=1;
  assert.throws(()=>view(g),/device_signature_rejected|device_safety_boundary_violation/);
});
test('replay of one signed receipt does not count as two observations',()=>{
  const f=fixture();
  assert.throws(()=>correlateSignedDeviceEvidence(f.state,{signedReceipts:[f.receipt,f.receipt],trustedDeviceKeys:f.keys,now:NOW}),/receipt_reused/);
});
test('unbounded evidence input fails closed',()=>{
  const f=fixture();
  assert.throws(()=>correlateSignedDeviceEvidence(f.state,{signedReceipts:Array(51).fill(f.receipt),trustedDeviceKeys:f.keys,now:NOW}),/receipt_batch_invalid/);
});
