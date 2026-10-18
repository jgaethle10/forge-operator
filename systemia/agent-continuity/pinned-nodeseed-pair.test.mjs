import test from 'node:test';
import assert from 'node:assert/strict';
import {probePinnedNodePair} from './pinned-nodeseed-pair.mjs';
import {withLabNodePair,runPinnedNodeSeedPairLab} from './node-pair-live-lab.mjs';

test('two REAL NodeSeed HTTP server processes authenticate live challenges but never self-enroll in Spider or Systemia',async()=>{
 const result=await runPinnedNodeSeedPairLab();
 assert.equal(result.result,'PASS_TWO_REAL_NODESEED_PROCESSES_CI_SINGLE_HOST_ONLY');
 assert.equal(result.local_node_seed_processes,2);
 assert.equal(result.actual_http_attestation_round_trips,2);
 assert.equal(result.distinct_signing_keys_verified,true);
 assert.equal(result.physically_distinct_hardware_verified,false);
 assert.equal(result.production_enrollment_verified,false);
 assert.equal(result.production_containment_authorized,false);
 assert.equal(result.authority,'NONE_READ_ONLY');
});
test('rejects missing pin, swapped node name, duplicate fingerprints and remote plaintext endpoints',async()=>{
 await withLabNodePair(async({pins,tokenByNode})=>{
  await assert.rejects(()=>probePinnedNodePair({nodes:[pins[0]],tokenByNode}),/BLACKBOX_NODE_PAIR_HELD/);
  await assert.rejects(()=>probePinnedNodePair({nodes:[pins[0],{...pins[1],expected_fingerprint:pins[0].expected_fingerprint}],tokenByNode}),/duplicate node identity/);
  await assert.rejects(()=>probePinnedNodePair({nodes:[pins[0],{...pins[1],expected_node_id:pins[0].expected_node_id}],tokenByNode}),/duplicate node identity/);
  await assert.rejects(()=>probePinnedNodePair({nodes:[pins[0],{...pins[1],endpoint:'http:\/\/example.com:42420'}],tokenByNode}),/non-loopback NodeSeed/);
  await assert.rejects(()=>probePinnedNodePair({nodes:[pins[0],{...pins[1],expected_fingerprint:'sha256:'+'0'.repeat(64)}],tokenByNode}),/BLACKBOX_NODE_PAIR_HELD/);
  await assert.rejects(()=>probePinnedNodePair({nodes:[pins[0],{...pins[1],expected_node_id:'rogue-other-node'}],tokenByNode}),/BLACKBOX_NODE_PAIR_HELD/);
 });
});
test('capture and replay a previously signed NodeSeed attestation against a new nonce fails',async()=>{
 await withLabNodePair(async({pins,tokenByNode})=>{
  let captured=null;
  const spyingFetch=async(url,options)=>{
   const response=await fetch(url,options);
   if(url.endsWith('/v1/attest')&&!captured){
    const body=await response.clone().json();
    captured=body;
   }
   return response;
  };
  const first=await probePinnedNodePair({nodes:pins,tokenByNode,fetcher:spyingFetch});
  assert.equal(first.challenge_response_observed,true);
  assert.ok(captured?.attestation?.signature);
  const replayFetch=async(url,options)=>{
   if(url.endsWith('/v1/attest')){
    return {ok:true,status:200,headers:{get:()=>null},json:async()=>captured};
   }
   return fetch(url,options);
  };
  await assert.rejects(()=>probePinnedNodePair({nodes:pins,tokenByNode,fetcher:replayFetch}),/attestation_nonce_mismatch/);
 });
});
test('NodeSeed attestation fields cannot be altered after Ed25519 signing and remain owner-held',async()=>{
 await withLabNodePair(async({pins,tokenByNode})=>{
  const forgedFetch=async(url,opts)=>{
   const response=await fetch(url,opts);
   if(!url.endsWith('/v1/attest'))return response;
   const body=await response.json();
   body.attestation.statement.field_claim=true;
   return {ok:true,status:200,headers:{get:()=>null},json:async()=>body};
  };
  await assert.rejects(()=>probePinnedNodePair({nodes:pins,tokenByNode,fetcher:forgedFetch}),/node_may_not_self_claim_field_status/);
 });
});
