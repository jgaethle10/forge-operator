import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {LAB_STAGES,assembleLabChain,verifyLabChain} from './detached-receipt-chain.mjs';
import {consumeDetachedLabArtifact} from './detached-artifact-consumer.mjs';
const tenant_id='evercraft',mission_id='evercraft-agent-continuity-fabric-20261016';
const incident_id='schedule-cohort-2026-10-17T17';
const hashes=[{event_id:'run-1',event_sha256:'a'.repeat(64)},{event_id:'run-2',event_sha256:'b'.repeat(64)}];
function fixture(){
 const artifact_sha256=createHash('sha256').update(JSON.stringify(hashes)).digest('hex');
 const roles=[],trust={};
 for(const stage of LAB_STAGES){
  const pair=generateKeyPairSync('ed25519'),key_id='lab-'+stage;
  roles.push({stage,key_id,private_key_pem:pair.privateKey.export({type:'pkcs8',format:'pem'})});
  trust[key_id]={stage,tenant_id,mission_id,public_key_pem:pair.publicKey.export({type:'spki',format:'pem'})};
 }
 const scope={tenant_id,mission_id,incident_id,artifact_sha256};
 const receipt_chain=assembleLabChain({...scope,chain_id:'test-chain',recorded_at:'2026-10-17T17:00:00Z',roles});
 const verification=verifyLabChain(receipt_chain,trust,scope);
 return {schema:'evercraft.blackbox.ci-detached-roles-lab-evidence.v1',
 source_incident_id:incident_id,source_event_count:hashes.length,source_event_hashes:structuredClone(hashes),
 source_artifact_sha256:artifact_sha256,
 signer_provisioning:'SAME_CI_JOB_EPHEMERAL_KEY_PAIRS_FOUR_DISTINCT_ROLES',
 producer_delivery_consumer_independence:'NOT_PROVEN',
 verifier_process:'SEPARATE_PROCESS_WITH_PUBLIC_KEY_TRUST',
 original_source_claim:'GITHUB_SCHEDULED_WORKFLOW_RUN_STATE_ONLY',
 systemia_admission:'NOT_ADMITTED',
 production_authorized:false,real_agent_telemetry_verified:false,
 service_delivery_verified:false,external_effect_verified:false,execution_authority:'NONE_READ_ONLY',
 receipt_chain,detached_public_trust:trust,verification};
}
test('cross-job reader independently recomputes event-manifest and detached chain hashes',()=>{
 const source=fixture(),result=consumeDetachedLabArtifact(source);
 assert.equal(result.source_event_count,2);
 assert.equal(result.source_event_hash_manifest_sha256,source.source_artifact_sha256);
 assert.equal(result.detached_chain_sha256,source.verification.chain_sha256);
 assert.equal(result.github_job_artifact_transfer_consumed,true);
 assert.equal(result.independent_provisioned_identity_verified,false);
 assert.equal(result.live_chum_spider_consumer_verified,false);
 assert.equal(result.external_provider_effect_verified,false);
 assert.equal(result.systemia_admission_verified,false);
 assert.equal(result.execution_authority,'NONE_READ_ONLY');
});
test('cross-job reader refuses altered manifest, chain, live-service or provider-effect claims',()=>{
 for(const mutate of [
  x=>x.source_event_hashes[0].event_sha256='c'.repeat(64),
  x=>x.source_event_count=100,
  x=>x.receipt_chain.receipts[1].payload.artifact_sha256='c'.repeat(64),
  x=>x.receipt_chain.receipts[3].signature='X',
  x=>x.production_authorized=true,
  x=>x.external_effect_verified=true,
  x=>x.service_delivery_verified=true,
  x=>x.execution_authority='AUTO_RETRY',
  x=>x.verification.chain_sha256='c'.repeat(64),
  x=>x.systemia_admission='ADMITTED'
 ]){
  const a=fixture();mutate(a);
  assert.throws(()=>consumeDetachedLabArtifact(a),/BLACKBOX_(CROSS_JOB_CONSUMER|DETACHED_CHAIN)_HELD/);
 }
});
test('wrong identity, count and source scope fail closed',()=>{
 const a=fixture();a.source_incident_id='other-incident';
 assert.throws(()=>consumeDetachedLabArtifact(a),/CHAIN_HELD/);
 const b=fixture();delete b.source_event_hashes;
 assert.throws(()=>consumeDetachedLabArtifact(b),/CONSUMER_HELD/);
});
