import test from 'node:test';
import assert from 'node:assert/strict';
import {withLabNodePair} from './node-pair-live-lab.mjs';
import {captureLocalNodeSeedIdentity,verifyFieldCandidatePacket} from './field-node-readback.mjs';
test('actual two NodeSeed processes emit only public local device attestation candidates, not owner enrollment',async()=>{
 await withLabNodePair(async({pins,tokenByNode})=>{
  const seen=[];
  for(const pin of pins){
   const p=await captureLocalNodeSeedIdentity({endpoint:pin.endpoint,
    expectedNodeId:pin.expected_node_id,token:tokenByNode[pin.expected_node_id]});
   assert.equal(p.schema,'evercraft.blackbox.local-nodeseed-field-candidate.v1');
   assert.equal(p.device_fingerprint,pin.expected_fingerprint);
   assert.equal(p.host_endpoint_exported,false);
   assert.equal(p.private_key_exported,false);
   assert.equal(p.bearer_token_exported,false);
   assert.equal(p.owner_control_plane_pinning_verified,false);
   assert.equal(p.remote_spider_action_authorized,false);
   assert.equal(p.execution_authority,'NONE_READ_ONLY');
   assert.ok(!JSON.stringify(p).includes(tokenByNode[pin.expected_node_id]));
   assert.ok(!JSON.stringify(p).includes(pin.endpoint));
   assert.equal(verifyFieldCandidatePacket(p,{expectedNodeId:pin.expected_node_id,
    expectedFingerprint:pin.expected_fingerprint}).signed_attestation_verified,true);
   seen.push(p);
  }
  assert.notEqual(seen[0].device_fingerprint,seen[1].device_fingerprint);
 });
});
test('field source rejects swapped device, stale source signature, forged packet and internet endpoints',async()=>{
 await withLabNodePair(async({pins,tokenByNode})=>{
  const a=pins[0],b=pins[1];
  await assert.rejects(()=>captureLocalNodeSeedIdentity({endpoint:a.endpoint,
   expectedNodeId:b.expected_node_id,token:tokenByNode[a.expected_node_id]}),/wrong NodeSeed/);
  await assert.rejects(()=>captureLocalNodeSeedIdentity({endpoint:'http://8.8.8.8:42420',
   expectedNodeId:a.expected_node_id}),/local loopback HTTP only/);
  await assert.rejects(()=>captureLocalNodeSeedIdentity({endpoint:'https://localhost:42420',
   expectedNodeId:a.expected_node_id}),/local loopback HTTP only/);
  await assert.rejects(()=>captureLocalNodeSeedIdentity({endpoint:a.endpoint,
   expectedNodeId:a.expected_node_id}),/NodeSeed denied local read-only request/);
  const p=await captureLocalNodeSeedIdentity({endpoint:a.endpoint,
   expectedNodeId:a.expected_node_id,token:tokenByNode[a.expected_node_id]});
  assert.throws(()=>verifyFieldCandidatePacket({...p,remote_spider_action_authorized:true},
   {expectedNodeId:a.expected_node_id,expectedFingerprint:a.expected_fingerprint}),/field packet/);
  assert.throws(()=>verifyFieldCandidatePacket(p,
   {expectedNodeId:a.expected_node_id,expectedFingerprint:b.expected_fingerprint}),/field packet/);
  const forged=structuredClone(p);forged.signed_attestation.statement.node_id='forged';
  assert.throws(()=>verifyFieldCandidatePacket(forged,
   {expectedNodeId:a.expected_node_id,expectedFingerprint:a.expected_fingerprint}),/field packet/);
  assert.throws(()=>verifyFieldCandidatePacket(p,
   {expectedNodeId:a.expected_node_id,expectedFingerprint:a.expected_fingerprint,
    now:new Date(Date.now()+120000)}),/stale/);
 });
});
