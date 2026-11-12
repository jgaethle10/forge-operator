#!/usr/bin/env node
// Physical Penguin -> NextGen acceptance probe. No remote shell/filesystem,
// no service lifecycle operations, no new listeners, and no repository extraction.
// Deliberately opt-in: do not run from cron or a resident service.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

const DEPLOYMENT = 'evercraft-remote-broker-resident';
const NODE = 'evercraft-node002-nextgen';
const WORKLOAD = 'systemia.content-hash.v1';
const ORIGIN = 'http://127.0.0.1:8797';
const YARD_MODULE = '/opt/evercraft/forge-operator/systemia/yard/operator.mjs';
const YARD_STATE = '/var/lib/evercraft/nodeseed/remote-broker-resident/yard';
const EVIDENCE_DIR = '/var/lib/evercraft/nodeseed/remote-broker-resident/distributed-compute-evidence';

if (process.argv.includes('--help')) {
  console.log('Run with sudo on Penguin after reviewing this file. Uses authorized content-hash-only jobs.');
  console.log('Expected: 10 independent remote hashes, replay/conflict/invalid lease checks, root-only evidence.');
  process.exit(0);
}

const stable = value => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
    : value;
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const digest = value => sha(JSON.stringify(stable(value)));
const safeError = error => String(error instanceof Error ? error.message : error)
  .replace(/[^a-zA-Z0-9_.: -]/g, '_').slice(0, 160);

async function post(url, body, token = '') {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(40_000),
  });
  let data;
  try { data = await response.json(); } catch { data = {}; }
  return { status: response.status, data };
}

function assertStatus(response, code, label) {
  if (response.status !== code) {
    throw new Error(label + '_HTTP_' + response.status + '_' + safeError(response.data?.error || 'unexpected_response'));
  }
  return response.data;
}

const runId = new Date().toISOString().replace(/[^0-9TZ]/g, '') + '-' + randomBytes(4).toString('hex');
const output = path.join(EVIDENCE_DIR, 'penguin-nextgen-' + runId + '.json');
const evidence = {
  schema: 'evercraft.compute.physical-ten-job-acceptance.v1',
  run_id: runId,
  state: 'started',
  deployment_id: DEPLOYMENT,
  requested_node_id: NODE,
  workload_class: WORKLOAD,
  route_scope: 'loopback_proof',
  started_at: new Date().toISOString(),
  jobs: [],
  checks: {},
};

function persist() {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true, mode: 0o700 });
  const tmp = output + '.' + process.pid + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, output);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

let endpoint = '';
let leaseId = '';
let leaseToken = '';
let success = false;
try {
  persist();
  const { YardOperator } = await import(YARD_MODULE);
  const yard = new YardOperator({ stateDir: YARD_STATE });
  const inventory = await yard.listRemoteCapacityNodes(DEPLOYMENT);
  const node = inventory.nodes?.find(item => item.node_id === NODE);
  assert.equal(node?.capacity?.authorized, true, 'authorized node required');
  assert.equal(node?.capacity?.session_attestation_verified, true, 'session attestation required');
  assert.equal(node?.capacity?.zero_cost, true, 'zero-cost offer required');
  assert.ok(node?.capacity?.supported_workloads?.includes(WORKLOAD), 'hash workload required');
  assert.equal(node?.connected, true, 'remote worker must be connected');
  evidence.checks.capacity = true;
  console.log('1. CONNECTED, AUTHORIZED CAPACITY: PASS');

  // Verify and grant on the *same* Yard instance. Never treat loopback as public HTTPS.
  const route = await yard.verifyPublicRoute(DEPLOYMENT, {
    origin: ORIGIN, allowLoopbackProof: true,
  });
  assert.equal(route.scope, 'loopback_proof');
  assert.equal(route.origin, ORIGIN);
  assert.equal(route.verification, 'instance_and_deployment_receipt_match');
  evidence.broker_route_receipt_hash = route.receipt_hash;
  evidence.checks.broker_route = true;
  console.log('2. BROKER IDENTITY AND ROUTE: PASS');

  const grant = await yard.remoteCapacityGrant(DEPLOYMENT, NODE, {
    allowLoopbackProof: true,
  });
  assert.equal(grant.node_id, NODE);
  assert.equal(grant.capacity_endpoint, ORIGIN + '/nodes/' + NODE);
  assert.ok(grant.allocator_token);
  endpoint = grant.capacity_endpoint;
  evidence.control_grant_receipt_hash = grant.control_grant_receipt_hash;
  evidence.checks.control_grant = true;
  console.log('3. AUTHORIZED CAPACITY GRANT: PASS');

  const lease = assertStatus(await post(endpoint + '/v1/leases', {
    workload_class: WORKLOAD, requested_ttl_ms: 120_000,
  }, grant.allocator_token), 201, 'lease');
  assert.equal(lease.workload_class, WORKLOAD);
  assert.ok(lease.lease_id && lease.token);
  leaseId = lease.lease_id;
  leaseToken = lease.token;
  evidence.checks.lease = true;
  evidence.lease_receipt_hash = lease.receipt?.receipt_hash || null;
  persist();
  console.log('4. LEASE: PASS');

  const makeJob = (key, value) => ({
    lease_id: leaseId,
    token: leaseToken,
    workload_class: WORKLOAD,
    idempotency_key: key,
    input: { idempotency_key: key, payload: { value } },
  });
  let first;
  for (let index = 0; index < 10; index++) {
    const value = 'Evercraft physical distributed compute proof ' + String(index + 1).padStart(2, '0');
    const key = 'evercraft-physical-' + randomUUID();
    const response = assertStatus(
      await post(endpoint + '/v1/jobs', makeJob(key, value)), 200, 'remote_job_' + (index + 1)
    );
    const worker = response.worker_receipt;
    const expected = digest(value);
    assert.equal(response.ok, true);
    assert.equal(response.node_id, NODE);
    assert.equal(response.workload_class, WORKLOAD);
    assert.equal(response.idempotency_key, key);
    assert.equal(response.deduplicated, false, 'new job must execute');
    assert.equal(response.result?.algorithm, 'sha256');
    assert.equal(response.result?.digest, expected);
    assert.equal(response.result?.byte_count, Buffer.byteLength(JSON.stringify(stable(value))));
    assert.equal(worker?.schema, 'evercraft.compute.registered-worker-receipt.v1');
    assert.equal(worker?.node_id, NODE);
    assert.equal(worker?.workload_class, WORKLOAD);
    assert.equal(worker?.idempotency_key, key);
    assert.equal(worker?.request_hash, digest({
      node_id: NODE, workload_class: WORKLOAD, idempotency_key: key, payload: { value },
    }));
    assert.equal(worker?.result?.digest, expected);
    assert.equal(worker?.registered_workload_only, true);
    assert.ok(response.receipt, 'compute execution receipt required');
    const { receipt_hash: receiptHash, ...unsignedReceipt } = worker;
    assert.equal(receiptHash, digest(unsignedReceipt), 'signed-content integrity');
    const row = {
      ordinal: index + 1,
      node_id: NODE,
      idempotency_key: key,
      expected_digest: expected,
      returned_digest: response.result.digest,
      worker_receipt_hash: receiptHash,
      completed_at: worker.completed_at,
      checks_passed: true,
    };
    evidence.jobs.push(row);
    if (index === 0) first = { key, value, expected, receiptHash };
    persist();
    console.log('REMOTE CONTENT HASH ' + (index + 1) + '/10: PASS');
  }

  const replay = assertStatus(
    await post(endpoint + '/v1/jobs', makeJob(first.key, first.value)), 200, 'replay'
  );
  assert.equal(replay.deduplicated, true);
  assert.equal(replay.worker_receipt?.receipt_hash, first.receiptHash);
  assert.equal(replay.result?.digest, first.expected);
  evidence.checks.identical_replay_deduplicated = true;

  const conflict = await post(endpoint + '/v1/jobs', makeJob(first.key, 'must-fail-changed-payload'));
  assertStatus(conflict, 409, 'conflicting_replay');
  assert.equal(conflict.data?.error, 'nodeseed_registered_worker_idempotency_conflict');
  evidence.checks.conflicting_replay_rejected = true;

  const invalidLease = await post(endpoint + '/v1/jobs', {
    ...makeJob('evercraft-invalid-lease-' + randomUUID(), 'must-fail-invalid-lease'),
    token: 'invalid-lease-proof-token',
  });
  assertStatus(invalidLease, 401, 'invalid_lease');
  assert.equal(invalidLease.data?.error, 'invalid_lease');
  evidence.checks.invalid_lease_rejected = true;

  evidence.state = 'passed';
  success = true;
  console.log('PHYSICAL DISTRIBUTED COMPUTE: 10/10 PASS');
} catch (error) {
  evidence.state = 'failed';
  evidence.error = safeError(error);
  console.error('PHYSICAL DISTRIBUTED COMPUTE: BLOCKED ' + evidence.error);
  process.exitCode = 1;
} finally {
  if (endpoint && leaseId && leaseToken) {
    try {
      const released = await post(
        endpoint + '/v1/leases/' + encodeURIComponent(leaseId) + '/release',
        { token: leaseToken },
      );
      evidence.checks.lease_release_http = released.status;
      if (released.status !== 200) {
        console.error('LEASE RELEASE: HTTP ' + released.status);
      }
    } catch (error) {
      evidence.checks.lease_release_error = safeError(error);
      console.error('LEASE RELEASE: NOT CONFIRMED');
    }
  }
  evidence.finished_at = new Date().toISOString();
  try {
    persist();
    console.log('EVIDENCE FILE: ' + output);
  } catch (error) {
    console.error('EVIDENCE WRITE FAILED: ' + safeError(error));
    process.exitCode = 1;
  }
  if (!success) process.exitCode = 1;
}
