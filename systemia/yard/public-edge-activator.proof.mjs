import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { activatePublicSpecialistEdge } from './public-edge-activator.mjs';

async function freeUdpPort(){
  const socket=dgram.createSocket('udp4');
  await new Promise((resolve,reject)=>{
    socket.once('error',reject);
    socket.bind(0,'127.0.0.1',resolve);
  });
  const address=socket.address();
  const port=typeof address==='object'?address.port:0;
  await new Promise((resolve)=>socket.close(resolve));
  return port;
}

const root=fs.mkdtempSync(path.join(os.tmpdir(),'public-edge-activator-proof-'));
const announcePort=await freeUdpPort();
const token='activator-proof-token';

const ordinary=await startNodeSeed({
  root:path.join(root,'ordinary'),
  nodeId:'ordinary-node',
  host:'127.0.0.1',
  port:0,
  advertiseHost:'127.0.0.1',
  allocatorToken:token,
  placementLabels:['general'],
  announce:true,
  announceAddress:'127.0.0.1',
  announcePort,
  announceIntervalMs:100,
});

const edgeCandidate=await startNodeSeed({
  root:path.join(root,'edge'),
  nodeId:'edge-node',
  host:'127.0.0.1',
  port:0,
  advertiseHost:'127.0.0.1',
  allocatorToken:token,
  placementLabels:['public-edge','gateway'],
  announce:true,
  announceAddress:'127.0.0.1',
  announcePort,
  announceIntervalMs:100,
});

try{
  const discovery={
    bindAddress:'127.0.0.1',
    multicastAddress:'127.0.0.1',
    port:announcePort,
    timeoutMs:350,
    joinMulticast:false,
  };

  let productionHold=null;
  try{
    await activatePublicSpecialistEdge({
      stateDir:path.join(root,'production-hold'),
      releaseRef:'b617fd6c9daad08df77398d56bd4d0cd948c736f',
      allocatorTokens:{'edge-node':token,'ordinary-node':token},
      discovery,
      mode:'wildcard_https',
      requiredPlacementLabels:['public-edge'],
    });
  }catch(error){
    productionHold=error.receipt||null;
  }
  assert.ok(productionHold);
  assert.equal(productionHold.state,'held_no_edge_ready_compute_node');
  assert.equal(productionHold.founder_action_required,false);
  assert.ok(productionHold.discovered_count>=2);
  assert.equal(productionHold.eligible_count,0);

  const activation=await activatePublicSpecialistEdge({
    stateDir:path.join(root,'proof-active'),
    releaseRef:'b617fd6c9daad08df77398d56bd4d0cd948c736f',
    allocatorTokens:{'edge-node':token,'ordinary-node':token},
    discovery,
    mode:'proof_loopback',
    requiredPlacementLabels:['public-edge'],
    allowLoopbackProof:true,
    leaseTtlMs:120000,
    renewEveryMs:60000,
    controllerIntervalMs:30000,
    requestedHostname:'auto-specialists',
    specialistGatewayUrl:'https://example.invalid/machine-commerce',
  });

  assert.equal(activation.receipt.schema,'evercraft.public-edge.activation.v1');
  assert.equal(activation.receipt.state,'proof_runtime_active');
  assert.equal(activation.receipt.selected_node,'edge-node');
  assert.ok(activation.receipt.placement_labels.includes('public-edge'));
  assert.ok(activation.receipt.placement_labels.includes('gateway'));
  assert.equal(activation.receipt.route_scope,'loopback_proof');
  assert.equal(activation.receipt.route_verified,false);
  assert.equal(activation.receipt.provider_transport,'compute_lease');
  assert.equal(activation.receipt.founder_login_required,false);
  assert.equal(activation.receipt.selected_endpoint_exposed,false);
  assert.equal(activation.receipt.allocator_token_exposed,false);

  const tick=await activation.controller.tick();
  assert.equal(tick.action,'healthy');
  assert.equal(tick.specialist_health_state,'loopback_proof_healthy');

  const stopped=await activation.close('proof_complete');
  assert.equal(stopped.action,'stopped');
  assert.ok(stopped.route_release_receipt);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.public-edge.activator-proof.v1',
    production_tls_gate_fail_closed:true,
    production_hold_founder_action_required:false,
    endpoint_supplied_manually:false,
    beacon_discovery:true,
    workload_filtering:true,
    placement_label_filtering:true,
    selected_edge_node:'edge-node',
    provider_transport:'compute_lease',
    controller_health_verified:true,
    allocator_secret_exposed:false,
    selected_endpoint_exposed:false,
    founder_login_required:false,
    public_https_verified:false,
    proof_scope:'loopback_only',
    production_hold_receipt:productionHold.receipt_hash,
    activation_receipt:activation.receipt.receipt_hash,
    resolver_receipt:activation.receipt.resolver_receipt,
    stop_receipt:stopped.receipt_hash,
  },null,2));
}finally{
  await ordinary.close();
  await edgeCandidate.close();
  fs.rmSync(root,{recursive:true,force:true});
}
