import test from 'node:test';
import assert from 'node:assert/strict';
import {assessPortfolioQaDeviceCapacity} from '../systemia/saban/qa-device-admission.mjs';
const now='2026-11-15T20:00:00Z',fingerprint='a'.repeat(64);
const capacity={
 protocol:'evercraft.capacity.v1',node_id:'node001-test',
 device_fingerprint:fingerprint,zero_cost:true,allocation_auth:'bearer',
 attestation_supported:true,placement_labels:['operator-authorized'],
 supported_workloads:['saban.multiplier-assignment.v1','systemia.content-hash.v1'],
 expires_at:'2026-11-15T20:00:35Z'
};
const params={capacity,expectedNodeId:'node001-test',expectedFingerprint:fingerprint,operatorApproved:true,now};
test('unapproved physical nodes stay held even with matching advertisement',()=>{
 const r=assessPortfolioQaDeviceCapacity({...params,operatorApproved:false});
 assert.equal(r.state,'held');
 assert.ok(r.reasons.includes('operator_approval_required'));
 assert.equal(r.operational_execution_authorized,false);
});
test('matching operator-approved node remains a candidate, never an executed device test',()=>{
 const r=assessPortfolioQaDeviceCapacity(params);
 assert.equal(r.state,'candidate_for_private_pairing');
 assert.equal(r.operational_execution_authorized,false);
 assert.equal(r.physical_qa_execution_verified,false);
 assert.match(r.receipt_hash,/^sha256:[a-f0-9]{64}$/);
});
test('fingerprint change, stale advert, missing workload or nonzero cost are blocked',()=>{
 for(const change of [
  {expectedFingerprint:'b'.repeat(64)}, {capacity:{...capacity,expires_at:'2026-11-15T19:59:59Z'}},
  {capacity:{...capacity,zero_cost:false}},
  {capacity:{...capacity,allocation_auth:'loopback_only'}},
  {capacity:{...capacity,supported_workloads:['systemia.content-hash.v1']}},
  {capacity:{...capacity,device_fingerprint:'c'.repeat(64)}},
  {capacity:{...capacity,placement_labels:[]}},
 ]){
  const r=assessPortfolioQaDeviceCapacity({...params,...change});
  assert.equal(r.state,'held',JSON.stringify(change));
 }
});
