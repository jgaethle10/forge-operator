import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { evercraftOsSha256 } from './package-trust.mjs';
import { EvercraftOsIndependentRuntimeGates } from './runtime-independent-gates.mjs';

const NOW=new Date('2026-10-11T12:00:00.000Z');
const ROLES={systemia:'systemia_mission_receipt_hash',execution_gate:'execution_policy_hash',capsule:'capsule_contract_hash',nodeseed:'device_attestation_hash'};
function canon(x){return Array.isArray(x)?x.map(canon):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canon(x[k])])):x;}
function buildFixture(){
  const keys=Object.fromEntries(Object.keys(ROLES).map(role=>[role,generateKeyPairSync('ed25519')]));
  const plan={schema:'evercraft.os.runtime-handoff-plan.v1',subject_ref:'subject:owner',node_id:'node-A',product_key:'proof-app',
    prepared_at:NOW.toISOString(),systemia_mission_receipt_hash:evercraftOsSha256('S'),execution_policy_hash:evercraftOsSha256('E'),
    capsule_contract_hash:evercraftOsSha256('C'),device_attestation_hash:evercraftOsSha256('N'),
    request_fingerprint:evercraftOsSha256('bound-runtime-plan')};
  const handoff={revalidate:({plan:input,subjectRef})=>input===plan&&subjectRef==='subject:owner'
    ? {state:'still_prepared_for_independent_gate_review'}:{state:'held',reason:'runtime_plan_not_current'}};
  const pin=Object.fromEntries(Object.entries(keys).map(([k,v])=>[k,v.publicKey.export({format:'pem',type:'spki'})]));
  const gate=new EvercraftOsIndependentRuntimeGates({handoff,pinnedAuthorityKeys:pin});
  function signGate(role,overrides={},privateKey=keys[role].privateKey){
    const body={schema:'evercraft.os.runtime-independent-gate-decision.v1',role,decision:'allow',
      evidence_hash:plan[ROLES[role]],plan_fingerprint:plan.request_fingerprint,product_key:plan.product_key,
      node_id:plan.node_id,subject_ref:plan.subject_ref,issued_at:NOW.toISOString(),
      expires_at:new Date(NOW.getTime()+120000).toISOString(),...overrides};
    return {schema:'evercraft.os.runtime-independent-gate-attestation.v1',signature_algorithm:'ed25519',body,
      signature_base64:sign(null,Buffer.from(JSON.stringify(canon(body))),privateKey).toString('base64')};
  }
  const bundle=()=>Object.fromEntries(Object.keys(ROLES).map(role=>[role,signGate(role)]));
  const verify=(attestations,extras={})=>gate.verify({plan,subjectRef:plan.subject_ref,attestations,now:NOW,...extras});
  return {keys,pin,gate,plan,signGate,bundle,verify,handoff};
}
test('four independent pinned signatures are verified but do not grant process execution',()=>{
  const f=buildFixture(),r=f.verify(f.bundle());
  assert.equal(r.state,'independent_evidence_verified_for_passport_review',r.reason);
  assert.equal(r.verified_roles.length,4);
  assert.equal(r.execution_authority_granted,false);
  assert.equal(r.permit_minted,false);
  assert.equal(r.process_started_claimed,false);
  assert.equal(r.runtime_health_claimed,false);
});
test('missing a Systemia attestation fails closed',()=>{
  const f=buildFixture(),bundle=f.bundle();delete bundle.systemia;
  assert.match(f.verify(bundle).reason,/exact_four/);
});
test('extra surprise authority is not silently included',()=>{
  const f=buildFixture(),bundle=f.bundle();bundle.root_admin=bundle.systemia;
  assert.match(f.verify(bundle).reason,/exact_four/);
});
test('Execution Gate cannot masquerade as Systemia even if it signs the same body',()=>{
  const f=buildFixture(),bundle=f.bundle();bundle.systemia=f.signGate('systemia',{},f.keys.execution_gate.privateKey);
  assert.match(f.verify(bundle).reason,/signature_not_verified:systemia/);
});
test('one key cannot be enrolled for two independent authority roles',()=>{
  const f=buildFixture();const pin={...f.pin,systemia:f.pin.execution_gate};
  assert.throws(()=>new EvercraftOsIndependentRuntimeGates({handoff:f.handoff,pinnedAuthorityKeys:pin}),/distinct_keys/);
});
test('a role may cryptographically deny and the bundle is held',()=>{
  const f=buildFixture(),bundle=f.bundle();bundle.execution_gate=f.signGate('execution_gate',{decision:'deny'});
  assert.match(f.verify(bundle).reason,/binding_or_decision_mismatch:execution_gate/);
});
test('signed gate decision bound to a different product cannot authorize current plan',()=>{
  const f=buildFixture(),bundle=f.bundle();bundle.capsule=f.signGate('capsule',{product_key:'wrong-product'});
  assert.match(f.verify(bundle).reason,/binding_or_decision_mismatch:capsule/);
});
test('signed gate approval for a different runtime plan is held',()=>{
  const f=buildFixture(),bundle=f.bundle();bundle.nodeseed=f.signGate('nodeseed',{plan_fingerprint:evercraftOsSha256('other-plan')});
  assert.match(f.verify(bundle).reason,/binding_or_decision_mismatch:nodeseed/);
});
test('expired gate approval is refused',()=>{
  const f=buildFixture(),bundle=f.bundle();bundle.execution_gate=f.signGate('execution_gate',{issued_at:new Date(NOW.getTime()-180000).toISOString(),expires_at:new Date(NOW.getTime()-60000).toISOString()});
  assert.match(f.verify(bundle).reason,/not_fresh:execution_gate/);
});
test('signed approval from before the handoff plan is refused',()=>{
  const f=buildFixture(),bundle=f.bundle();bundle.systemia=f.signGate('systemia',{issued_at:new Date(NOW.getTime()-1000).toISOString(),expires_at:new Date(NOW.getTime()+1000).toISOString()});
  assert.match(f.verify(bundle).reason,/not_fresh:systemia/);
});
test('unsigned extra fields are rejected, even when the original signature remains valid',()=>{
  const f=buildFixture(),bundle=f.bundle();bundle.systemia.body.is_root=true;
  assert.match(f.verify(bundle).reason,/fields_invalid:systemia/);
});
test('post-signing tampering is rejected',()=>{
  const f=buildFixture(),bundle=f.bundle();bundle.execution_gate.signature_base64=f.signGate('systemia').signature_base64;
  assert.match(f.verify(bundle).reason,/signature_not_verified:execution_gate/);
});
test('unavailable, held handoff preflight stops gate evidence review',()=>{
  const f=buildFixture();
  assert.match(f.verify(f.bundle(),{subjectRef:'subject:other'}).reason,/handoff_not_current/);
});
test('invalid signature encoding is rejected',()=>{
  const f=buildFixture(),bundle=f.bundle();bundle.nodeseed.signature_base64='garbage';
  assert.match(f.verify(bundle).reason,/envelope_invalid:nodeseed/);
});
test('stale authority policy reference fails even when signature itself is genuine',()=>{
  const f=buildFixture(),bundle=f.bundle();bundle.execution_gate=f.signGate('execution_gate',{evidence_hash:evercraftOsSha256('old-policy')});
  assert.match(f.verify(bundle).reason,/binding_or_decision_mismatch:execution_gate/);
});
