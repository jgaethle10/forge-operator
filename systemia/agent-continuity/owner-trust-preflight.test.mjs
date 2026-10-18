import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {LAB_STAGES,assembleLabChain,verifyLabChain} from './detached-receipt-chain.mjs';
import {fingerprintOwnerPublicTrust,assessOwnerTrustAnchor} from './owner-trust-preflight.mjs';
const tenant_id='evercraft',mission_id='evercraft-agent-continuity-fabric-20261016';
const incident_id='schedule-cohort-2026-10-17T17';
function fixture(){
 const hashes=[{event_id:'one',event_sha256:'a'.repeat(64)}];
 const artifact_sha256=createHash('sha256').update(JSON.stringify(hashes)).digest('hex');
 const scope={tenant_id,mission_id,incident_id,artifact_sha256};
 const roles=[],trust={};
 for(const stage of LAB_STAGES){
  const p=generateKeyPairSync('ed25519'),key_id='ci-'+stage;
  roles.push({stage,key_id,private_key_pem:p.privateKey.export({type:'pkcs8',format:'pem'})});
  trust[key_id]={stage,tenant_id,mission_id,public_key_pem:p.publicKey.export({type:'spki',format:'pem'})};
 }
 const receipt_chain=assembleLabChain({...scope,chain_id:'cohort-test',recorded_at:'2026-10-17T17:15:12Z',roles});
 const verification=verifyLabChain(receipt_chain,trust,scope);
 const artifact={schema:'evercraft.blackbox.ci-detached-roles-lab-evidence.v1',
  source_incident_id:incident_id,source_event_count:1,source_event_hashes:hashes,
  source_artifact_sha256:artifact_sha256,
  signer_provisioning:'SAME_CI_JOB_EPHEMERAL_KEY_PAIRS_FOUR_DISTINCT_ROLES',
  producer_delivery_consumer_independence:'NOT_PROVEN',
  verifier_process:'SEPARATE_PROCESS_WITH_PUBLIC_KEY_TRUST',
  original_source_claim:'GITHUB_SCHEDULED_WORKFLOW_RUN_STATE_ONLY',
  systemia_admission:'NOT_ADMITTED',production_authorized:false,
  real_agent_telemetry_verified:false,service_delivery_verified:false,
  external_effect_verified:false,execution_authority:'NONE_READ_ONLY',
  receipt_chain,detached_public_trust:trust,verification};
 return {artifact,trust};
}
test('unconfigured owner trust cannot promote same-artifact signer keys from green CI',()=>{
 const {artifact}=fixture();
 const r=assessOwnerTrustAnchor({artifact});
 assert.equal(r.state,'HELD_OWNER_TRUST_FINGERPRINT_NOT_CONFIGURED');
 assert.equal(r.self_contained_lab_signature_check,'PASSED_NOT_OWNER_AUTHORIZATION');
 assert.equal(r.independently_pinned_trust_verified,false);
 assert.equal(r.canonical_systemia_admission_verified,false);
 assert.equal(r.release_authorized,false);
 assert.equal(r.execution_authority,'NONE_READ_ONLY');
});
test('an owner digest without independently provided public trust still holds',()=>{
 const {artifact,trust}=fixture();
 const r=assessOwnerTrustAnchor({artifact,owner_pinned_sha256:fingerprintOwnerPublicTrust(trust)});
 assert.equal(r.state,'HELD_SEPARATE_OWNER_PUBLIC_TRUST_NOT_CONFIGURED');
 assert.equal(r.release_authorized,false);
});
test('separately supplied owner trust pinned SHA validates only key chain not authority',()=>{
 const {artifact,trust}=fixture();
 const pinned=fingerprintOwnerPublicTrust(trust);
 const r=assessOwnerTrustAnchor({artifact,configured_public_trust:structuredClone(trust),owner_pinned_sha256:pinned});
 assert.equal(r.state,'PINNED_SIGNATURE_SET_VERIFIED_LAB_ONLY');
 assert.equal(r.independently_pinned_trust_verified,true);
 assert.equal(r.independent_passport_issuer_verified,false);
 assert.equal(r.canonical_systemia_admission_verified,false);
 assert.equal(r.live_service_consumer_verified,false);
 assert.equal(r.provider_side_effect_verified,false);
 assert.equal(r.release_authorized,false);
});
test('self-signed forgery plus altered trust keys cannot pass an independent immutable owner fingerprint',()=>{
 const valid=fixture(),pin=fingerprintOwnerPublicTrust(valid.trust);
 const evil=fixture();
 assert.throws(()=>assessOwnerTrustAnchor({artifact:evil.artifact,
   configured_public_trust:evil.artifact.detached_public_trust,owner_pinned_sha256:pin}),/fingerprint mismatch/);
 // An attacker who only changes artifact's embedded trust cannot change configured trust.
 assert.throws(()=>assessOwnerTrustAnchor({artifact:evil.artifact,
   configured_public_trust:valid.trust,owner_pinned_sha256:pin}),/invalid signature/);
});
test('wrong tenant, missing roles, wrong algorithm and wrong digest all fail closed',()=>{
 const {artifact,trust}=fixture();const pin=fingerprintOwnerPublicTrust(trust);
 for(const modify of [
  v=>v['ci-producer_lab'].tenant_id='attacker',
  v=>{delete v['ci-delivery_lab']},
  v=>v['ci-producer_lab'].public_key_pem='not a real key',
  v=>v['ci-producer_lab'].stage='audit_lab'
 ]){
  const changed=structuredClone(trust);modify(changed);
  assert.throws(()=>assessOwnerTrustAnchor({artifact,configured_public_trust:changed,owner_pinned_sha256:pin}),/BLACKBOX_OWNER_TRUST_HELD/);
 }
 assert.throws(()=>assessOwnerTrustAnchor({artifact,configured_public_trust:trust,
   owner_pinned_sha256:'b'.repeat(64)}),/fingerprint mismatch/);
});
