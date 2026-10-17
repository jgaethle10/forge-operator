import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {assembleLabChain,verifyLabChain,verifyLabReceipt,LAB_STAGES} from './detached-receipt-chain.mjs';
const tenant_id='evercraft',mission_id='evercraft-agent-continuity-fabric-20261016',incident_id='schedule-cohort-2026-10-17T16';
const artifact_sha256='a'.repeat(64),chain_id='schedule-batch-001',recorded_at='2026-10-17T16:34:27Z';
const scope={tenant_id,mission_id,incident_id,artifact_sha256};
function fixture(){
 const roles=[],trust={};
 for(let i=0;i<LAB_STAGES.length;i++){
  const pair=generateKeyPairSync('ed25519'),stage=LAB_STAGES[i],key_id='ci-'+stage;
  roles.push({stage,key_id,private_key_pem:pair.privateKey.export({type:'pkcs8',format:'pem'})});
  trust[key_id]={public_key_pem:pair.publicKey.export({type:'spki',format:'pem'}),stage,tenant_id,mission_id};
 }
 return {roles,trust};
}
function signFixture(){
 const {roles,trust}=fixture();return {roles,trust,bundle:assembleLabChain({...scope,chain_id,recorded_at,roles})};
}
function clone(x){return structuredClone(x);}
test('four distinct lab roles, detached out-of-band trust verifies exact source artifact and claims no live authority',()=>{
 const {bundle,trust}=signFixture();
 const result=verifyLabChain(bundle,trust,scope);
 assert.equal(result.chain_length,4);assert.equal(result.same_artifact,true);
 assert.equal(result.role_keys_distinct,true);
 assert.equal(result.signature_state,'FOUR_ROLE_KEYS_VERIFIED_OUT_OF_BAND_TRUST');
 assert.equal(result.live_service_delivery_verified,false);
 assert.equal(result.provider_effect_verified,false);
 assert.equal(result.identity_passport_enrollment_verified,false);
 assert.equal(result.systemia_admission_verified,false);
 assert.equal(result.production_approval,false);
 assert.equal(result.execution_authority,'NONE_READ_ONLY');
 assert.equal(verifyLabReceipt(bundle.receipts[0],trust).verified,'CONFIGURED_PUBLIC_KEY_SIGNATURE_ONLY');
});
test('tamper artifact digest, receipt signature, stage or previous link and fail closed',()=>{
 const {bundle,trust}=signFixture();
 for(const mutate of [
  b=>b.receipts[1].payload.artifact_sha256='b'.repeat(64),
  b=>b.receipts[1].signature='A'.repeat(86)+'==',
  b=>b.receipts[2].payload.previous_receipt_sha256='0'.repeat(64),
  b=>b.receipts[3].payload.stage='producer_lab',
  b=>b.receipts[0].payload.canonical_admission='ADMITTED',
  b=>b.receipts[2].payload.live_service_delivery_verified=true,
  b=>b.receipts[2].payload.operational_effects_verified=true,
  b=>b.receipts[0].payload.execution_authority='AUTO_DISPATCH',
  b=>b.receipts[1].payload.surprise='escalate'
 ]){
  const candidate=clone(bundle);mutate(candidate);
  assert.throws(()=>verifyLabChain(candidate,trust,scope),/BLACKBOX_DETACHED_CHAIN_HELD/);
 }
});
test('reject replay/reorder/drop, cross-tenant scope and wrong artifact expectation',()=>{
 const {bundle,trust}=signFixture();
 for(const modified of [
  {bundle:{...bundle,receipts:bundle.receipts.slice(1)},scope},
  {bundle:{...bundle,receipts:[bundle.receipts[0],bundle.receipts[2],bundle.receipts[1],bundle.receipts[3]]},scope},
  {bundle,scope:{...scope,tenant_id:'tenant-attacker'}},
  {bundle,scope:{...scope,mission_id:'other-mission'}},
  {bundle,scope:{...scope,incident_id:'other-incident'}},
  {bundle,scope:{...scope,artifact_sha256:'b'.repeat(64)}}
 ])assert.throws(()=>verifyLabChain(modified.bundle,trust,modified.scope),/BLACKBOX_DETACHED_CHAIN_HELD/);
});
test('reject signing key substitution, unauthorized key id or in-band public grant',()=>{
 const {bundle,trust}=signFixture();
 const {trust:rogue}=fixture();
 assert.throws(()=>verifyLabChain(bundle,rogue,scope),/BLACKBOX_DETACHED_CHAIN_HELD/);
 const substituted=clone(bundle);substituted.receipts[0].key_id='unknown-new-key';
 assert.throws(()=>verifyLabChain(substituted,trust,scope),/unknown signer key/);
 const added=clone(bundle);added.receipts[0].public_key_pem=trust[bundle.receipts[0].key_id].public_key_pem;
 assert.throws(()=>verifyLabChain(added,trust,scope),/fields mismatch/);
});
test('reject same signing key material reused under different named role grants',()=>{
 const {bundle,trust,roles}=signFixture();
 // Duplicate public material is denied even if malicious signer produces valid signatures.
 const second=roles[1],first=roles[0];
 roles[1]={...second,private_key_pem:first.private_key_pem};
 const spoof=assembleLabChain({...scope,chain_id,recorded_at,roles});
 trust[second.key_id].public_key_pem=trust[first.key_id].public_key_pem;
 assert.throws(()=>verifyLabChain(spoof,trust,scope),/two roles share same key material/);
});
test('no claim of production verification is available even with four valid signatures',()=>{
 const {bundle,trust}=signFixture(),v=verifyLabChain(bundle,trust,scope);
 assert.equal(v.production_approval,false);
 assert.equal(v.independent_organization_custody_verified,false);
 assert.equal(v.identity_passport_enrollment_verified,false);
});
