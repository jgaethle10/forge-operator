import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { YardOperator } from '../yard/operator.mjs';
import { startOutboundNodeAgent } from '../network/outbound-node-agent.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-broker-workload-proof-'));
const brokerComputeRoot = path.join(root, 'broker-compute');
const remoteComputeRoot = path.join(root, 'remote-compute');
const brokerStateRoot = path.join(brokerComputeRoot, 'services', 'remote-broker');
const yardState = path.join(root, 'yard');
const remoteOrigin = path.join(remoteComputeRoot, 'git', 'systemia-core.git');
const brokerAllocatorToken = 'proof-broker-compute-allocator';
const remoteAllocatorToken = 'proof-remote-node-allocator';
const releaseRef = '8e66fff27bf4004c8ee62194f08bb3483f1e1ece';

const brokerSeed = await startNodeSeed({
  root: brokerComputeRoot,
  nodeId: 'broker-host-node',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken: brokerAllocatorToken,
  announce: false,
});

const remoteSeed = await startNodeSeed({
  root: remoteComputeRoot,
  nodeId: 'private-remote-node',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken: remoteAllocatorToken,
  announce: false,
});

const yard = new YardOperator({ stateDir: yardState });
let agent = null;

try {
  const broker = await yard.deployRelease({
    deploymentId: 'remote-capacity-broker-proof',
    releaseRef,
    workloadClass: 'systemia.remote-capacity-broker.v1',
    capacityEndpoint: brokerSeed.endpoint,
    allocatorToken: brokerAllocatorToken,
    input: {
      state_root: brokerStateRoot,
      authorized_devices: {
        [remoteSeed.device_fingerprint]: remoteSeed.node_id,
      },
      poll_wait_ms: 100,
      command_timeout_ms: 5_000,
      capacity_fresh_ms: 500,
    },
    rollbackTarget: 'proof:remote-broker-previous',
    leaseTtlMs: 120_000,
  });

  assert.equal(broker.state, 'ready');
  assert.equal(broker.receipt.workload_class, 'systemia.remote-capacity-broker.v1');
  assert.equal(broker.receipt.runtime_fabric, 'Evercraft Compute');
  assert.equal(broker.receipt.health_verification, 'healthy');
  assert.equal(
    broker.receipt.route_verification,
    'local_broker_health_verified_public_route_unbound'
  );
  assert.equal(broker.result.public_route_required, true);
  assert.equal(broker.result.public_health_path, '/v1/remote/health');
  assert.equal(
    broker.result.secure_envelope_schema,
    'evercraft.secure-envelope.v1'
  );
  assert.ok(broker.result.local_url);

  const directHealth = await fetch(
    `${broker.result.local_url}/v1/remote/health`
  ).then((response) => response.json());
  assert.equal(directHealth.ok, true);
  assert.equal(directHealth.service, 'remote-capacity-broker');
  assert.equal(directHealth.runtime, 'Evercraft Compute');
  assert.equal(directHealth.instance_id, broker.result.instance_id);
  assert.equal(directHealth.deployment_receipt_bound, true);
  assert.equal(
    directHealth.deployment_receipt_ref,
    broker.receipt.receipt_hash
  );

  const beforeRoute = await yard.verifyRoute('remote-capacity-broker-proof');
  assert.equal(beforeRoute.ok, false);
  assert.equal(beforeRoute.state, 'public_route_unbound');
  assert.equal(beforeRoute.local_health_ok, true);

  await assert.rejects(
    yard.verifyPublicRoute('remote-capacity-broker-proof', {
      origin: broker.result.local_url,
    }),
    /loopback is not a public route/
  );

  const loopbackRoute = await yard.verifyPublicRoute(
    'remote-capacity-broker-proof',
    {
      origin: broker.result.local_url,
      allowLoopbackProof: true,
    }
  );
  assert.equal(loopbackRoute.schema, 'evercraft.yard.public-route-receipt.v1');
  assert.equal(loopbackRoute.scope, 'loopback_proof');
  assert.equal(loopbackRoute.verified, false);
  assert.equal(loopbackRoute.service, 'remote-capacity-broker');
  assert.equal(loopbackRoute.health_path, '/v1/remote/health');

  assert.throws(
    () => yard.remoteCapacityBrokerReceipt('remote-capacity-broker-proof'),
    /verified public HTTPS route is required/
  );

  agent = await startOutboundNodeAgent({
    brokerUrl: broker.result.local_url,
    localCapacityEndpoint: remoteSeed.endpoint,
    localAllocatorToken: remoteAllocatorToken,
    pollBackoffMs: 25,
  });

  assert.equal(agent.node_id, remoteSeed.node_id);
  assert.equal(agent.device_fingerprint, remoteSeed.device_fingerprint);
  assert.equal(agent.status().public_ingress, false);

  const safeInventory=await yard.listRemoteCapacityNodes(
    'remote-capacity-broker-proof'
  );
  assert.equal(safeInventory.schema,'evercraft.yard.remote-capacity-nodes.v1');
  assert.equal(safeInventory.count,1);
  assert.equal(safeInventory.nodes[0].node_id,remoteSeed.node_id);
  assert.equal(
    safeInventory.nodes[0].device_fingerprint,
    remoteSeed.device_fingerprint
  );
  assert.equal(safeInventory.nodes[0].connected,true);
  assert.equal(
    JSON.stringify(safeInventory).includes(remoteAllocatorToken),
    false
  );
  assert.equal(
    JSON.stringify(safeInventory).includes('control_token'),
    false
  );

  const grant = await yard.remoteCapacityGrant(
    'remote-capacity-broker-proof',
    remoteSeed.node_id,
    { allowLoopbackProof: true }
  );
  assert.equal(grant.schema, 'evercraft.yard.remote-capacity-grant.v1');
  assert.equal(grant.node_id, remoteSeed.node_id);
  assert.equal(grant.device_fingerprint, remoteSeed.device_fingerprint);
  assert.equal(grant.route_scope, 'loopback_proof');
  assert.ok(grant.allocator_token);
  assert.notEqual(grant.allocator_token, remoteAllocatorToken);
  assert.equal(
    grant.capacity_endpoint,
    `${broker.result.local_url}/nodes/${remoteSeed.node_id}`
  );
  assert.ok(grant.control_grant_receipt_hash);

  const remoteSpecialist = await yard.deployRelease({
    deploymentId:'remote-specialist-relay-proof',
    releaseRef,
    workloadClass:'systemia.specialist-handoff-mcp.v1',
    capacityEndpoint:grant.capacity_endpoint,
    allocatorToken:grant.allocator_token,
    input:{
      gateway_url:'https://example.invalid/machine-commerce',
      fabric_mcp_path:'/mcp',
    },
    rollbackTarget:'proof:remote-specialist-previous',
    leaseTtlMs:120_000,
  });
  assert.equal(remoteSpecialist.state,'ready');
  assert.equal(remoteSpecialist.receipt.capacity_node_id,remoteSeed.node_id);
  assert.equal(remoteSpecialist.result.read_only_specialist_handoff,true);

  const serviceRelay=await yard.createRemoteServiceRelay(
    'remote-capacity-broker-proof',
    {
      nodeId:remoteSeed.node_id,
      serviceId:remoteSpecialist.result.service_id,
      ttlMs:120_000,
      allowLoopbackProof:true,
    }
  );
  assert.equal(serviceRelay.schema,'evercraft.yard.remote-service-relay.v1');
  assert.equal(serviceRelay.remote_node_id,remoteSeed.node_id);
  assert.equal(serviceRelay.remote_service_id,remoteSpecialist.result.service_id);
  assert.equal(serviceRelay.allocator_token_exposed,false);
  assert.equal(serviceRelay.relay_token_persisted,false);
  assert.ok(serviceRelay.relay_token);
  assert.notEqual(serviceRelay.relay_token,grant.allocator_token);
  assert.match(serviceRelay.relay_url,/\/v1\/remote\/service-relays\/relay_[a-f0-9]+\/proxy$/);

  const relayedHealthEnvelope=await fetch(serviceRelay.relay_url,{
    method:'POST',
    headers:{
      authorization:'Bearer '+serviceRelay.relay_token,
      'content-type':'application/json',
    },
    body:JSON.stringify({
      method:'GET',
      path:'/health',
      headers:{accept:'application/json'},
      body_base64:'',
    }),
  }).then(async(response)=>({
    status:response.status,
    body:await response.json(),
  }));
  assert.equal(relayedHealthEnvelope.status,200);
  assert.equal(relayedHealthEnvelope.body.ok,true);
  assert.equal(relayedHealthEnvelope.body.status,200);
  const relayedHealth=JSON.parse(
    Buffer.from(relayedHealthEnvelope.body.body_base64,'base64').toString('utf8')
  );
  assert.equal(relayedHealth.ok,true);
  assert.equal(relayedHealth.service,'specialist-handoff-mcp');
  assert.equal(relayedHealth.instance_id,remoteSpecialist.result.instance_id);
  assert.equal(
    relayedHealth.deployment_receipt_ref,
    remoteSpecialist.receipt.receipt_hash
  );

  const relayRelease=await yard.releaseRemoteServiceRelay(
    'remote-capacity-broker-proof',
    serviceRelay.relay_id,
    {reason:'proof_complete'}
  );
  assert.equal(relayRelease.released,true);

  const afterRelease=await fetch(serviceRelay.relay_url,{
    method:'POST',
    headers:{
      authorization:'Bearer '+serviceRelay.relay_token,
      'content-type':'application/json',
    },
    body:JSON.stringify({method:'GET',path:'/health',headers:{},body_base64:''}),
  });
  assert.equal(afterRelease.status,401);

  await yard.stopDeployment('remote-specialist-relay-proof',{
    reason:'proof_remote_relay_complete',
  });

  const brokerRecordRaw = fs.readFileSync(
    path.join(yardState, 'remote-capacity-broker-proof.json'),
    'utf8'
  );
  assert.ok(!brokerRecordRaw.includes(grant.allocator_token));
  assert.ok(!brokerRecordRaw.includes(remoteAllocatorToken));

  const remoteDeployment = await yard.deployRelease({
    deploymentId: 'remote-origin-via-broker-workload-proof',
    releaseRef,
    workloadClass: 'systemia.private-core-origin.v1',
    capacityEndpoint: grant.capacity_endpoint,
    allocatorToken: grant.allocator_token,
    input: {
      target_path: remoteOrigin,
    },
    rollbackTarget: 'proof:remote-origin-previous',
    leaseTtlMs: 120_000,
  });
  assert.equal(remoteDeployment.state, 'ready');
  assert.equal(remoteDeployment.receipt.capacity_node_id, remoteSeed.node_id);
  assert.equal(fs.existsSync(path.join(remoteOrigin, 'HEAD')), true);

  await yard.stopDeployment('remote-origin-via-broker-workload-proof', {
    reason: 'proof_remote_origin_complete',
  });

  const afterRoute = await yard.verifyRoute('remote-capacity-broker-proof');
  assert.equal(afterRoute.ok, false);
  assert.equal(afterRoute.state, 'public_route_unbound');
  assert.equal(afterRoute.local_health_ok, true);

  await yard.stopDeployment('remote-capacity-broker-proof', {
    reason: 'proof_broker_complete',
  });

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.remote-capacity.broker-workload-proof.v1',
    broker_runtime: 'Evercraft Compute',
    broker_deployment_surface: 'Yard Operator',
    deployment_receipt_bound: true,
    local_broker_health_verified: true,
    public_https_fails_closed_until_verified: true,
    loopback_route_is_proof_only: true,
    control_grant_requires_private_compute_lease: true,
    control_grant_not_persisted_in_public_deployment_record: true,
    safe_connected_capacity_inventory:true,
    safe_inventory_exposes_no_control_token:true,
    private_node_opens_public_ingress: false,
    yard_remote_deployment_through_broker_workload: true,
    scoped_remote_service_relay_through_yard:true,
    relay_token_distinct_from_control_grant:true,
    relay_revocation_proven:true,
    secure_envelope_schema: 'evercraft.secure-envelope.v1',
    verified_public_https_route: false,
    named_cloud_required: false,
  }, null, 2));
} finally {
  if (agent) {
    try { await agent.close(); } catch {}
  }
  try { await brokerSeed.close(); } catch {}
  try { await remoteSeed.close(); } catch {}
  fs.rmSync(root, { recursive: true, force: true });
}
