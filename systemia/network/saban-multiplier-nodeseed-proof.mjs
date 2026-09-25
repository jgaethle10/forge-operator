import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startNodeSeed } from '../compute/node-seed.mjs';

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(`${response.status}: ${body.error || 'request_failed'}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saban-multiplier-nodeseed-'));
const allocatorToken = 'saban-multiplier-proof-token';
const nodeId = 'saban-multiplier-proof-node';
const idempotencyKey = 'proof-idempotency-durable-001';

function assignment(overrides = {}) {
  return {
    agent_id: 'nodeseed-registered-proof',
    idempotency_key: idempotencyKey,
    role: 'surface_auditor',
    work: {
      kind: 'product',
      key: overrides.workKey || 'proof-product',
      source_file: null
    },
    item: {
      kind: 'product',
      key: overrides.workKey || 'proof-product',
      raw: {
        canonical_url: overrides.url || 'https://example.com',
        intents: ['one', 'two', 'three'],
        authority: 'proof',
        boundaries: ['public only']
      }
    }
  };
}

async function lease(seed) {
  return requestJson(`${seed.endpoint}/v1/leases`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${allocatorToken}`
    },
    body: JSON.stringify({
      workload_class: 'saban.multiplier-assignment.v1',
      requested_ttl_ms: 30000
    })
  });
}

async function execute(seed, leaseRecord, nextAssignment) {
  return requestJson(`${seed.endpoint}/v1/jobs`, {
    method: 'POST',
    body: JSON.stringify({
      lease_id: leaseRecord.lease_id,
      token: leaseRecord.token,
      workload_class: 'saban.multiplier-assignment.v1',
      agent_id: nextAssignment.agent_id,
      checkpoint: {
        step: 0,
        state: null
      },
      input: {
        software: 'chum',
        assignment: nextAssignment
      }
    })
  });
}

let seed = await startNodeSeed({
  root,
  nodeId,
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken,
  announce: false
});

try {
  const capacity = await requestJson(`${seed.endpoint}/v1/capacity`);
  assert.ok(capacity.supported_workloads.includes('saban.multiplier-assignment.v1'));

  let leaseRecord = await lease(seed);
  const originalAssignment = assignment();

  const execution = await execute(seed, leaseRecord, originalAssignment);
  assert.equal(execution.ok, true);
  assert.equal(execution.deduplicated, false);
  assert.equal(execution.idempotency_key, idempotencyKey);
  assert.equal(execution.result.schema, 'evercraft.saban.registered-worker-receipt.v1');
  assert.equal(execution.result.software_id, 'chum');
  assert.equal(execution.result.result.status, 'finding');
  assert.equal(execution.checkpoint.step, 1);
  assert.equal(execution.checkpoint.last_node, nodeId);

  const immediateRetry = await execute(seed, leaseRecord, originalAssignment);
  assert.equal(immediateRetry.ok, true);
  assert.equal(immediateRetry.deduplicated, true);
  assert.equal(immediateRetry.idempotency_key, idempotencyKey);
  assert.deepEqual(immediateRetry.result, execution.result);

  await requestJson(`${seed.endpoint}/v1/leases/${leaseRecord.lease_id}/release`, {
    method: 'POST',
    body: JSON.stringify({
      token: leaseRecord.token
    })
  });

  await seed.close();
  seed = await startNodeSeed({
    root,
    nodeId,
    host: '127.0.0.1',
    port: 0,
    advertiseHost: '127.0.0.1',
    allocatorToken,
    announce: false
  });

  leaseRecord = await lease(seed);
  const afterRestart = await execute(seed, leaseRecord, originalAssignment);
  assert.equal(afterRestart.ok, true);
  assert.equal(afterRestart.deduplicated, true);
  assert.equal(afterRestart.idempotency_key, idempotencyKey);
  assert.deepEqual(afterRestart.result, execution.result);

  let conflict = null;
  try {
    await execute(seed, leaseRecord, assignment({
      workKey: 'different-proof-product',
      url: 'https://example.com/different'
    }));
  } catch (error) {
    conflict = error;
  }

  assert.equal(conflict?.status, 409);
  assert.equal(conflict?.body?.error, 'idempotency_key_conflict');
  assert.equal(conflict?.body?.idempotency_key, idempotencyKey);

  const idempotencyDir = path.join(root, '.evercraft', 'saban-idempotency');
  const recordFiles = fs.readdirSync(idempotencyDir).filter((name) => name.endsWith('.json'));
  assert.equal(recordFiles.length, 1);
  const recordPath = path.join(idempotencyDir, recordFiles[0]);
  const tampered = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
  tampered.worker_result.software_id = 'tampered-software';
  fs.writeFileSync(recordPath, JSON.stringify(tampered, null, 2) + '\n');

  let integrityFailure = null;
  try {
    await execute(seed, leaseRecord, originalAssignment);
  } catch (error) {
    integrityFailure = error;
  }

  assert.equal(integrityFailure?.status, 500);
  assert.equal(
    integrityFailure?.body?.error,
    'saban_idempotency_record_integrity_failed'
  );

  await requestJson(`${seed.endpoint}/v1/leases/${leaseRecord.lease_id}/release`, {
    method: 'POST',
    body: JSON.stringify({
      token: leaseRecord.token
    })
  });

  console.log(JSON.stringify({
    schema: 'evercraft.saban.nodeseed-multiplier-proof.v2',
    status: 'pass',
    node_id: execution.node_id,
    software_id: execution.result.software_id,
    registered_only: true,
    checkpoint_step: execution.checkpoint.step,
    immediate_retry_deduplicated: true,
    restart_retry_deduplicated: true,
    idempotency_conflict_rejected: true,
    tampered_idempotency_record_failed_closed: true
  }));
} finally {
  await seed.close().catch(() => {});
  fs.rmSync(root, { recursive: true, force: true });
}
