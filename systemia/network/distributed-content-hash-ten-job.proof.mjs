import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { startOutboundCapacityBroker } from './outbound-capacity-broker.mjs';
import { startOutboundNodeAgent } from './outbound-node-agent.mjs';

// Isolated in-process integration test: one loopback broker, one outbound
// worker, no public listener, production credentials, or user machines.
// This does not claim to exercise NextGen's stricter device command policy.
const WORKLOAD = 'systemia.content-hash.v1';
const NODE = 'evercraft-ten-job-proof-node';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-remote-ten-hash-'));
const localAllocatorToken = 'test-only-remote-hash-local-allocator';

const stable = value => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
    : value;
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const receiptDigest = value => sha(JSON.stringify(stable(value)));

async function post(url, body, authorization = '') {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(authorization ? { authorization: 'Bearer ' + authorization } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  return { status: response.status, body: await response.json() };
}

let seed;
let broker;
let agent;
try {
  seed = await startNodeSeed({
    root: path.join(root, 'compute'),
    nodeId: NODE,
    host: '127.0.0.1',
    port: 0,
    advertiseHost: '127.0.0.1',
    allocatorToken: localAllocatorToken,
    announce: false,
  });

  broker = await startOutboundCapacityBroker({
    stateDir: path.join(root, 'broker'),
    authorizedDevices: { [seed.device_fingerprint]: seed.node_id },
    pollWaitMs: 75,
    commandTimeoutMs: 8_000,
    capacityFreshMs: 1_000,
  });

  agent = await startOutboundNodeAgent({
    brokerUrl: broker.endpoint,
    localCapacityEndpoint: seed.endpoint,
    localAllocatorToken,
    pollBackoffMs: 25,
  });

  const grant = broker.controlGrant(NODE);
  assert.ok(grant?.allocator_token, 'authorized outbound worker grants capacity');
  assert.equal(grant.node_id, NODE);
  assert.notEqual(grant.allocator_token, localAllocatorToken);

  const rejectedGrant = await post(
    grant.capacity_endpoint + '/v1/leases',
    { workload_class: WORKLOAD, requested_ttl_ms: 120_000 },
    'invalid-test-allocator-token',
  );
  assert.equal(rejectedGrant.status, 401, 'untrusted allocator cannot lease work');

  const leased = await post(
    grant.capacity_endpoint + '/v1/leases',
    { workload_class: WORKLOAD, requested_ttl_ms: 120_000 },
    grant.allocator_token,
  );
  assert.equal(leased.status, 201);
  assert.equal(leased.body.workload_class, WORKLOAD);
  const { lease_id: leaseId, token: leaseToken } = leased.body;
  assert.ok(leaseId && leaseToken);

  const originalReceipts = [];
  const jobRequest = (key, value) => ({
    lease_id: leaseId,
    token: leaseToken,
    workload_class: WORKLOAD,
    idempotency_key: key,
    input: {
      idempotency_key: key,
      payload: { value },
    },
  });

  for (let index = 0; index < 10; index++) {
    const key = 'proof-content-hash-' + String(index + 1).padStart(2, '0');
    const value = 'Evercraft distributed compute batch ' + String(index + 1);
    const executed = await post(grant.capacity_endpoint + '/v1/jobs', jobRequest(key, value));
    assert.equal(executed.status, 200, 'remote job ' + (index + 1) + ' accepted');

    const job = executed.body;
    const worker = job.worker_receipt;
    const expected = sha(JSON.stringify(stable(value)));
    assert.equal(job.ok, true);
    assert.equal(job.node_id, NODE);
    assert.equal(job.workload_class, WORKLOAD);
    assert.equal(job.idempotency_key, key);
    assert.equal(job.deduplicated, false);
    assert.equal(job.result?.algorithm, 'sha256');
    assert.equal(job.result?.digest, expected);
    assert.equal(job.result?.byte_count, Buffer.byteLength(JSON.stringify(stable(value))));
    assert.equal(worker?.schema, 'evercraft.compute.registered-worker-receipt.v1');
    assert.equal(worker?.node_id, NODE);
    assert.equal(worker?.idempotency_key, key);
    assert.equal(worker?.result?.digest, expected);
    assert.equal(worker?.registered_workload_only, true);
    const { receipt_hash: receiptHash, ...unsignedBody } = worker;
    assert.equal(receiptHash, receiptDigest(unsignedBody), 'worker receipt integrity');
    assert.ok(job.receipt, 'Compute event receipt exists');
    originalReceipts.push({ key, value, hash: receiptHash, digest: expected });
  }

  const first = originalReceipts[0];
  const replay = await post(
    grant.capacity_endpoint + '/v1/jobs',
    jobRequest(first.key, first.value),
  );
  assert.equal(replay.status, 200);
  assert.equal(replay.body.deduplicated, true);
  assert.equal(replay.body.worker_receipt?.receipt_hash, first.hash);
  assert.equal(replay.body.result?.digest, first.digest);

  const conflict = await post(
    grant.capacity_endpoint + '/v1/jobs',
    jobRequest(first.key, 'changed-payload-must-fail'),
  );
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body?.error, 'nodeseed_registered_worker_idempotency_conflict');

  const badLease = await post(
    grant.capacity_endpoint + '/v1/jobs',
    { ...jobRequest('proof-bad-lease-01', 'denied'), token: 'invalid-lease-token' },
  );
  assert.equal(badLease.status, 401);
  assert.equal(badLease.body?.error, 'invalid_lease');

  const snapshot = JSON.stringify(broker.snapshot());
  assert.equal(snapshot.includes(localAllocatorToken), false);
  assert.equal(snapshot.includes(grant.allocator_token), false);
  assert.equal(snapshot.includes(leaseToken), false);

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.compute.distributed-ten-content-hash-proof.v1',
    environment: 'isolated_loopback_ci',
    jobs_executed: originalReceipts.length,
    digest_and_worker_receipts_verified: 10,
    replay_deduplicated: true,
    conflicting_replay_rejected: true,
    invalid_lease_rejected: true,
    allocator_auth_enforced: true,
    control_secrets_not_in_broker_snapshot: true,
    user_hardware_involved: false,
    public_ingress_required: false,
  }, null, 2));
} finally {
  if (agent) { try { await agent.close(); } catch {} }
  if (broker) { try { await broker.close(); } catch {} }
  if (seed) { try { await seed.close(); } catch {} }
  fs.rmSync(root, { recursive: true, force: true });
}
