import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reconcileIncident } from './reconcile.mjs';
const fixture=JSON.parse(readFileSync(new URL('./scenario.synthetic.json',import.meta.url)));
const blackbox={schema_version:'1',operation_id:'synthetic-ticket-001',assessment:'UNKNOWN',externally_verified:false,evidence_count:0};
const clone=o=>structuredClone(o);
test('reconciles synthetic incident without inventing cause, delivery or impact',()=>{
 const x=reconcileIncident(fixture,blackbox);
 assert.equal(x.proof_state,'SYNTHETIC_CONTRACT_TEST_ONLY');
 assert.equal(x.live_integrated,false);
 assert.equal(x.reconstruction.why.value,'UNKNOWN');
 assert.equal(x.reconstruction.external_side_effect_verified,false);
 assert.deepEqual(x.verified_collateral,[]);
 assert.equal(x.possible_downstream.length,3);
 assert.equal(x.systemia.canonical_admission,'NOT_ADMITTED');
 assert.equal(x.chum.distribution,'NOT_PUBLISHED');
 assert.equal(x.evercraft_network.delivery_verified,false);
});
test('deterministic input digest',()=>{
 assert.equal(reconcileIncident(fixture,blackbox).input_sha256,reconcileIncident(fixture,blackbox).input_sha256);
});
test('rejects fake provider verification',()=>{
 assert.throws(()=>reconcileIncident(fixture,{...blackbox,externally_verified:true}),/Provider verification/);
});
test('rejects mismatched Black Box operation',()=>{
 assert.throws(()=>reconcileIncident(fixture,{...blackbox,operation_id:'other'}),/identity mismatch/);
});
test('rejects cross-incident and unlabeled component snapshots',()=>{
 const x=clone(fixture);x.saban.incident_id='other';
 assert.throws(()=>reconcileIncident(x,blackbox),/saban incident identity mismatch/);
 const y=clone(fixture);y.evercraft_network.evidence_state='verified';
 assert.throws(()=>reconcileIncident(y,blackbox),/not labeled synthetic/);
});
test('rejects invented side effects, publishing or rendering',()=>{
 const x=clone(fixture);x.spider_society.action_taken=true;
 assert.throws(()=>reconcileIncident(x,blackbox),/must not claim/);
 const y=clone(fixture);y.fallen.rendered=true;
 assert.throws(()=>reconcileIncident(y,blackbox),/must not claim/);
});
test('rejects production data disguised as proof',()=>{
 const x=clone(fixture);x.synthetic=false;
 assert.throws(()=>reconcileIncident(x,blackbox),/Only explicitly synthetic/);
});
