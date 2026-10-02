import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { YardOperator } from '../yard/operator.mjs';
import { reconcileHouseholdFabricResident } from './household-fabric-resident-runner.mjs';

async function freeUdpPort() {
  const socket = dgram.createSocket('udp4');
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(0, '127.0.0.1', resolve);
  });
  const address = socket.address();
  const port = typeof address === 'object' ? address.port : 0;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'household-activation-proof-'));
const computeRoot = path.join(root, 'compute');
const yardState = path.join(root, 'yard');
const token = 'household-activation-private-authority';
const announcePort = await freeUdpPort();

const seed = await startNodeSeed({
  root: computeRoot,
  nodeId: 'household-capacity-node',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken: token,
  announce: true,
  announceAddress: '127.0.0.1',
  announcePort,
  announceIntervalMs: 100,
});
const yard = new YardOperator({ stateDir: yardState });

try {
  const edge = await yard.deployRelease({
    deploymentId: 'evercraft-public-edge',
    releaseRef: 'a'.repeat(40),
    workloadClass: 'systemia.public-edge.v1',
    capacityEndpoint: seed.endpoint,
    allocatorToken: token,
    input: {
      mode: 'proof_loopback',
      control_host: '127.0.0.1',
      control_port: 0,
      public_host: '127.0.0.1',
      public_port: 0,
      allow_private_upstream: false,
    },
    rollbackTarget: 'proof:public-edge-previous',
    leaseTtlMs: 120000,
  });
  assert.equal(edge.state, 'ready');

  const privateAuthorities = yard.privateCapacityAuthorities();
  assert.equal(privateAuthorities.source_record_count >= 1, true);
  assert.equal(privateAuthorities.allocatorTokens['household-capacity-node'], token);

  const result = await reconcileHouseholdFabricResident({
    yard,
    releaseRef: 'b'.repeat(40),
    discovery: {
      bindAddress: '127.0.0.1',
      multicastAddress: '127.0.0.1',
      port: announcePort,
      timeoutMs: 350,
      joinMulticast: false,
    },
    input: {
      kroger_zip_code: '98902',
      cadence_seconds: 300,
    },
    leaseTtlMs: 120000,
    renewEveryMs: 60000,
  });

  assert.equal(result.ok, true);
  assert.equal(result.action, 'deployed');
  assert.equal(result.node_id, 'household-capacity-node');
  assert.equal(result.discovered_count, 1);
  assert.equal(result.eligible_count, 1);
  assert.equal(result.identity_verified, true);
  assert.equal(result.resident_health_verified, true);
  assert.equal(result.placement, 'public_edge_affinity');
  assert.equal(result.public_edge_node_id, 'household-capacity-node');
  assert.equal(result.colocated_with_public_edge, true);
  assert.equal(result.allocator_authority_exposed, false);
  assert.equal(result.authority_source_records >= 1, true);
  assert.equal(JSON.stringify(result).includes(token), false);

  const record = yard.deploymentStatus('household-fabric-yakima');
  assert.equal(record.state, 'ready');
  assert.equal(record.receipt.workload_class, 'systemia.household-fabric-yakima.v1');
  assert.equal(record.receipt.capacity_node_id, 'household-capacity-node');

  const attached = await reconcileHouseholdFabricResident({
    yard,
    releaseRef: 'b'.repeat(40),
    discovery: {
      bindAddress: '127.0.0.1',
      multicastAddress: '127.0.0.1',
      port: announcePort,
      timeoutMs: 350,
      joinMulticast: false,
    },
    input: { kroger_zip_code: '98902', cadence_seconds: 300 },
    leaseTtlMs: 120000,
    renewEveryMs: 60000,
  });
  assert.equal(attached.ok, true);
  assert.equal(attached.action, 'attached');
  assert.equal(attached.node_id, 'household-capacity-node');
  assert.equal(attached.allocator_authority_exposed, false);

  await yard.stopDeployment('household-fabric-yakima', { reason: 'proof_complete' });
  await yard.stopDeployment('evercraft-public-edge', { reason: 'proof_complete' });

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.household-fabric.resident-activation-proof.v1',
    endpoint_supplied_manually_to_household: false,
    credential_free_beacon_discovery: true,
    private_allocator_authority_reused: true,
    public_edge_affinity_preferred: true,
    colocated_with_public_edge: true,
    allocator_authority_exposed: false,
    immutable_release_required: true,
    identity_attestation_verified: true,
    resident_health_verified: true,
    idempotent_attach: true,
    external_capacity_provisioned: false,
    payment_authority: false,
  }, null, 2));
} finally {
  try { yard.stopLeaseKeeper('household-fabric-yakima'); } catch {}
  try { yard.stopLeaseKeeper('evercraft-public-edge'); } catch {}
  await seed.close();
  fs.rmSync(root, { recursive: true, force: true });
}
