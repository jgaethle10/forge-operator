import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { startOutboundNodeAgent } from '../network/outbound-node-agent.mjs';
import { YardOperator } from './operator.mjs';
import { PublicRelayHostController } from './public-relay-host-controller.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'public-relay-host-proof-'));
const hostRoot=path.join(root,'host');
const remoteRoot=path.join(root,'remote');
const yardRoot=path.join(root,'yard');
const hostAllocator='public-relay-host-proof-allocator';
const remoteAllocator='private-node-proof-allocator';
const releaseRef='49bf518cceabc57ffab7bd7fa7877ade24eed08a';

const host=await startEvercraftComputeNode({
  root:hostRoot,
  nodeId:'public-relay-host-node',
  host:'127.0.0.1',
  port:0,
  allocatorToken:hostAllocator,
});
const remote=await startNodeSeed({
  root:remoteRoot,
  nodeId:'private-outbound-node',
  host:'127.0.0.1',
  port:0,
  advertiseHost:'127.0.0.1',
  allocatorToken:remoteAllocator,
  announce:false,
});

const yard=new YardOperator({stateDir:yardRoot});
const controller=new PublicRelayHostController({yard});
let agent=null;

try{
  const relayHost=await controller.deploy({
    capacityEndpoint:host.endpoint,
    allocatorToken:hostAllocator,
    releaseRef,
    stateRoot:path.join(hostRoot,'relay-state'),
    brokerInput:{
      authorized_devices:{
        [remote.device_fingerprint]:remote.node_id,
      },
      poll_wait_ms:50,
      command_timeout_ms:5000,
      capacity_fresh_ms:1000,
    },
    edgeInput:{
      mode:'proof_loopback',
    },
    requestedBrokerHostname:'remote-broker',
  });

  assert.equal(relayHost.schema,'evercraft.yard.public-relay-host.v1');
  assert.equal(relayHost.capacity_node_id,'public-relay-host-node');
  assert.equal(relayHost.broker_and_edge_same_node,true);
  assert.equal(relayHost.route_scope,'loopback_proof');
  assert.equal(relayHost.route_verified,false);
  assert.equal(relayHost.production_ready,false);
  assert.equal(relayHost.private_nodes_require_public_ingress,false);
  assert.equal(relayHost.private_nodes_connect_outbound,true);

  agent=await startOutboundNodeAgent({
    brokerUrl:relayHost.broker_origin,
    localCapacityEndpoint:remote.endpoint,
    localAllocatorToken:remoteAllocator,
    pollBackoffMs:25,
  });

  const inventory=await yard.listRemoteCapacityNodes(relayHost.broker_deployment_id);
  assert.equal(inventory.count,1);
  assert.equal(inventory.nodes[0].node_id,remote.node_id);
  assert.equal(inventory.nodes[0].connected,true);

  const grant=await yard.remoteCapacityGrant(
    relayHost.broker_deployment_id,
    remote.node_id,
    {allowLoopbackProof:true}
  );
  const specialist=await yard.deployRelease({
    deploymentId:'private-specialist-via-relay-host-proof',
    releaseRef,
    workloadClass:'systemia.specialist-handoff-mcp.v1',
    capacityEndpoint:grant.capacity_endpoint,
    allocatorToken:grant.allocator_token,
    input:{
      gateway_url:'https://example.invalid/machine-commerce',
      fabric_mcp_path:'/mcp',
    },
    rollbackTarget:'proof:private-specialist-previous',
    leaseTtlMs:120000,
  });
  assert.equal(specialist.state,'ready');
  assert.equal(specialist.receipt.capacity_node_id,remote.node_id);

  const published=await controller.publishRemoteService({
    relayHost,
    remoteNodeId:remote.node_id,
    remoteServiceId:specialist.result.service_id,
    bridgeDeploymentId:'public-bridge-to-private-specialist-proof',
    publicDeploymentHostname:'specialist',
    releaseRef,
    capacityEndpoint:host.endpoint,
    allocatorToken:hostAllocator,
    edgeDeploymentId:relayHost.edge_deployment_id,
    ttlMs:120000,
  });

  assert.equal(published.schema,'evercraft.yard.public-relayed-service.v1');
  assert.equal(published.private_node_public_ingress,false);
  assert.equal(published.route_scope,'loopback_proof');
  assert.equal(published.route_verified,false);
  assert.equal(published.production_ready,false);
  assert.equal(published.relay_token_persisted,false);

  const health=await fetch(published.public_origin+'/health')
    .then(async r=>({status:r.status,body:await r.json()}));
  assert.equal(health.status,200);
  assert.equal(health.body.ok,true);
  assert.equal(health.body.service,'specialist-handoff-mcp');
  assert.equal(health.body.instance_id,specialist.result.instance_id);

  const bridgeHealth=yard.deploymentStatus('public-bridge-to-private-specialist-proof');
  assert.equal(bridgeHealth.receipt.capacity_node_id,'public-relay-host-node');

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.yard.public-relay-host-proof.v1',
    public_host_node:relayHost.capacity_node_id,
    broker_route_scope:relayHost.route_scope,
    private_node:remote.node_id,
    private_node_public_ingress:false,
    private_node_connected_outbound:true,
    remote_service_deployed:true,
    scoped_service_relay_created:true,
    federated_bridge_deployed_on_public_host:true,
    second_public_route_created:true,
    end_to_end_remote_health_verified:true,
    relay_token_persisted:false,
    allocator_authority_exposed:false,
    proof_claims_public_https:false,
    production_requires_wildcard_https_and_verified_external_route:true,
  },null,2));
}finally{
  if(agent){try{await agent.close();}catch{}}
  for(const id of [
    'public-bridge-to-private-specialist-proof',
    'private-specialist-via-relay-host-proof',
    'evercraft-public-relay-edge',
    'evercraft-public-relay-broker',
  ]){
    try{await yard.stopDeployment(id,{reason:'proof_complete'});}catch{}
  }
  try{await host.close();}catch{}
  try{await remote.close();}catch{}
  fs.rmSync(root,{recursive:true,force:true});
}
