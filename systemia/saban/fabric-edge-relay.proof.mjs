import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import {
  loadOrCreateDeviceIdentity,
  verifyNodeAttestation,
} from '../compute/device-identity.mjs';
import { startOutboundCapacityBroker } from '../network/outbound-capacity-broker.mjs';
import { startOutboundNodeAgent } from '../network/outbound-node-agent.mjs';
import { YardOperator } from '../yard/operator.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fabric-edge-relay-proof-'));
const remoteRoot = path.join(root, 'chromebook-node');
const gatewayRoot = path.join(root, 'gateway-node');
const brokerRoot = path.join(root, 'broker');
const remoteYardRoot = path.join(root, 'remote-yard');
const gatewayYardRoot = path.join(root, 'gateway-yard');
fs.mkdirSync(remoteRoot, { recursive: true });
fs.mkdirSync(gatewayRoot, { recursive: true });

const remoteNodeId = 'chromebook-fabric-proof';
const remoteAllocator = 'proof-remote-' + 'a'.repeat(40);
const gatewayAllocator = 'proof-gateway-' + 'b'.repeat(40);
const releaseRef = 'f'.repeat(40);
const identity = loadOrCreateDeviceIdentity({
  root: remoteRoot,
  nodeId: remoteNodeId,
});

let remoteCompute = null;
let gatewayCompute = null;
let broker = null;
let agent = null;
let relay = null;

try {
  remoteCompute = await startEvercraftComputeNode({
    nodeId: remoteNodeId,
    root: remoteRoot,
    host: '127.0.0.1',
    port: 0,
    allocatorToken: remoteAllocator,
    deviceIdentity: identity,
    placementLabels: ['personal-compute', 'outbound-only'],
  });

  broker = await startOutboundCapacityBroker({
    host: '127.0.0.1',
    port: 0,
    stateDir: brokerRoot,
    authorizedDevices: {
      [identity.fingerprint]: remoteNodeId,
    },
    capacityFreshMs: 15_000,
    commandTimeoutMs: 10_000,
    pollWaitMs: 100,
  });

  agent = await startOutboundNodeAgent({
    brokerUrl: broker.endpoint,
    localCapacityEndpoint: remoteCompute.endpoint,
    localAllocatorToken: remoteAllocator,
    pollBackoffMs: 20,
  });

  let observed = null;
  for (let i = 0; i < 80; i += 1) {
    observed = broker.snapshot().nodes.find((node) =>
      node.node_id === remoteNodeId && node.connected === true
    );
    if (observed) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(observed);
  assert.equal(observed.device_fingerprint, identity.fingerprint);
  assert.ok(
    observed.capacity.supported_workloads.includes('systemia.fabric-local-mcp.v1')
  );

  const grant = broker.controlGrant(remoteNodeId);
  assert.ok(grant?.capacity_endpoint);
  assert.ok(grant?.allocator_token);

  const remoteYard = new YardOperator({ stateDir: remoteYardRoot });
  const fabric = await remoteYard.deployRelease({
    deploymentId: 'remote-fabric-proof',
    releaseRef,
    workloadClass: 'systemia.fabric-local-mcp.v1',
    capacityEndpoint: grant.capacity_endpoint,
    allocatorToken: grant.allocator_token,
    input: {
      fabric_catalog: [
        {
          public_id: 'relay-proof-v1',
          name: 'Relay Proof Capability',
          description: 'Proves owned Fabric survives an outbound service relay.',
          state: 'available',
          connections: [],
        },
      ],
    },
    rollbackTarget: 'proof:none',
    leaseTtlMs: 120_000,
  });
  assert.equal(fabric.state, 'ready');
  assert.equal(fabric.result.outbound_service_relay_supported, true);
  assert.equal(fabric.result.operator_edge_attestation_supported, true);
  assert.equal(fabric.receipt.capacity_node_id, remoteNodeId);

  const localHealth = await fetch(fabric.result.local_url + '/health').then((r) => r.json());
  assert.equal(localHealth.ok, true);
  assert.equal(localHealth.service, 'evercraft-fabric-local');
  assert.equal(localHealth.base44_transport_enabled, false);
  assert.equal(localHealth.edge_attestation_supported, true);
  assert.equal(localHealth.edge_attestation_source, 'in_process_nodeseed_identity');

  relay = await broker.createServiceRelay({
    nodeId: remoteNodeId,
    serviceId: fabric.result.service_id,
    ttlMs: 120_000,
  });
  assert.equal(relay.node_id, remoteNodeId);
  assert.equal(relay.service_id, fabric.result.service_id);
  assert.equal(relay.allocator_token_exposed, false);
  assert.equal(relay.relay_token_persisted, false);

  gatewayCompute = await startEvercraftComputeNode({
    nodeId: 'fabric-gateway-proof',
    root: gatewayRoot,
    host: '127.0.0.1',
    port: 0,
    allocatorToken: gatewayAllocator,
    placementLabels: ['gateway', 'public-edge'],
  });

  const gatewayYard = new YardOperator({ stateDir: gatewayYardRoot });
  const bridge = await gatewayYard.deployRelease({
    deploymentId: 'fabric-relay-bridge-proof',
    releaseRef,
    workloadClass: 'systemia.federated-service-bridge.v1',
    capacityEndpoint: gatewayCompute.endpoint,
    allocatorToken: gatewayAllocator,
    input: {
      relay_url: broker.endpoint + relay.proxy_path,
      relay_token: relay.relay_token,
    },
    rollbackTarget: 'proof:none',
    leaseTtlMs: 120_000,
  });
  assert.equal(bridge.state, 'ready');
  assert.equal(bridge.result.loopback_only, true);
  assert.equal(bridge.result.relay_authority_exposed, false);
  assert.equal(bridge.result.relay_authority_persisted, false);

  const bridgedHealth = await fetch(bridge.result.local_url + '/health').then((r) => r.json());
  assert.equal(bridgedHealth.ok, true);
  assert.equal(bridgedHealth.service, 'evercraft-fabric-local');
  assert.equal(bridgedHealth.base44_transport_enabled, false);
  assert.equal(bridgedHealth.edge_attestation_supported, true);

  const nonce = 'relay_' + randomBytes(18).toString('hex');
  const attestationResponse = await fetch(
    bridge.result.local_url + '/.well-known/evercraft-edge-attestation',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nonce }),
    }
  );
  assert.equal(attestationResponse.status, 200);
  const attestationBody = await attestationResponse.json();
  assert.equal(attestationBody.ok, true);
  assert.equal(attestationBody.allocator_authority_exposed, false);
  assert.equal(attestationBody.allocator_authority_persisted, false);
  const verified = verifyNodeAttestation({
    attestation: attestationBody.attestation,
    expectedNonce: nonce,
    expectedNodeId: remoteNodeId,
    maxAgeMs: 60_000,
    now: new Date(),
  });
  assert.equal(verified.ok, true);
  assert.equal(verified.device_fingerprint, identity.fingerprint);
  assert.equal(verified.field_claim, false);

  const init = await fetch(bridge.result.local_url + '/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'fabric-relay-proof', version: '1' },
      },
    }),
  }).then((r) => r.json());
  assert.equal(init.result.serverInfo.name, 'evercraft-fabric');

  const catalog = await fetch(bridge.result.local_url + '/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'list_evercraft_capabilities',
        arguments: { limit: 10 },
      },
    }),
  }).then((r) => r.json());
  assert.equal(catalog.result.structuredContent.total, 1);
  assert.equal(
    catalog.result.structuredContent.capabilities[0].public_id,
    'relay-proof-v1'
  );

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.saban.fabric-edge-relay-proof.v1',
    remote_node_id: remoteNodeId,
    gateway_node_id: 'fabric-gateway-proof',
    nodes_are_distinct: true,
    remote_fabric_runtime: 'Evercraft Compute',
    remote_transport: 'evercraft.outbound-capacity.v1',
    public_edge_attestation_survives_relay: true,
    device_fingerprint_preserved: true,
    base44_transport_enabled: false,
    allocator_token_exposed_to_gateway: false,
    relay_token_persisted: false,
    mcp_roundtrip_verified: true,
    relay_receipt: relay.receipt_hash,
    bridge_receipt: bridge.receipt.receipt_hash,
  }, null, 2));
} finally {
  try {
    if (relay) broker?.releaseServiceRelay(relay.relay_id, 'proof_complete');
  } catch {}
  try { await agent?.close(); } catch {}
  try { await gatewayCompute?.close(); } catch {}
  try { await remoteCompute?.close(); } catch {}
  try { await broker?.close(); } catch {}
  fs.rmSync(root, { recursive: true, force: true });
}
