import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { once } from 'node:events';

import { runNodeSeedRegisteredWorkload } from '../systemia/compute/nodeseed-registered-worker.mjs';
import { verifyNodeSeedWorkerCompletion } from '../systemia/saban/nodeseed-worker-completion-verifier.mjs';
import { AmbientWorkQueue } from '../systemia/saban/ambient-work-queue.mjs';
import { createNodeSeedExecutionIntent, getNodeSeedExecutionIntent } from '../systemia/saban/nodeseed-execution-intent.mjs';
import { executeNodeSeedExecutionIntent } from '../systemia/saban/nodeseed-intent-executor.mjs';
import { dispatchAmbientJobsOnce } from '../systemia/saban/ambient-job-dispatcher.mjs';

const WORKLOAD = 'systemia.content-hash.v1';
const NODE = 'node-receipt-gate-proof';
const FINGERPRINT = 'sha256:' + 'a'.repeat(64);
const sha = value => createHash('sha256').update(value).digest('hex');
const stable = value => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]))
    : value;

function computeReceipt({ key, workerHash, replay = false }) {
  const body = {
    schema: 'evercraft.compute.receipt.v1',
    node_id: NODE,
    seq: replay ? 2 : 1,
    type: replay ? 'registered-workload.reused' : 'registered-workload.executed',
    at: '2026-11-10T00:00:00.000Z',
    previous_hash: 'GENESIS',
    lease_id: 'proof-lease',
    workload_class: WORKLOAD,
    idempotency_key: key,
    worker_receipt_hash: workerHash,
  };
  return { ...body, receipt_hash: sha(JSON.stringify(body)) };
}
function fixture({ root, key, payload, replay = false }) {
  const worker = runNodeSeedRegisteredWorkload({
    nodeId: NODE,
    workloadClass: WORKLOAD,
    idempotencyKey: key,
    payload,
    stateDir: root,
  });
  const response = {
    ok: true,
    node_id: NODE,
    workload_class: WORKLOAD,
    idempotency_key: key,
    result: structuredClone(worker.result),
    worker_receipt: structuredClone(worker),
    deduplicated: worker.deduplicated === true,
    receipt: computeReceipt({
      key,
      workerHash: worker.receipt_hash,
      replay,
    }),
  };
  return { response, args: {
    nodeId: NODE,
    workloadClass: WORKLOAD,
    idempotencyKey: key,
    payload,
  }};
}

test('Saban verifies NodeSeed identity, payload, digest and both receipts; valid replay passes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saban-receipt-verify-'));
  try {
    const key = 'saban-receipt-proof-1';
    const payload = { value: { mission: 'verify', sequence: 1 } };
    const original = fixture({ root, key, payload });
    const verdict = verifyNodeSeedWorkerCompletion({
      response: original.response, ...original.args,
    });
    assert.equal(verdict.verified, true);
    assert.equal(verdict.content_hash_verified, true);
    assert.equal(verdict.node_id, NODE);

    const replay = fixture({ root, key, payload, replay: true });
    assert.equal(replay.response.deduplicated, true);
    assert.equal(verifyNodeSeedWorkerCompletion({
      response: replay.response, ...replay.args,
    }).verified, true);

    const cases = [
      ['compute_node_mismatch', response => { response.node_id = 'wrong-node'; }],
      ['worker_node_mismatch', response => { response.worker_receipt.node_id = 'wrong-node'; }],
      ['compute_idempotency_mismatch', response => { response.idempotency_key = 'another-key'; }],
      ['payload_binding_mismatch', response => { response.worker_receipt.request_hash = 'sha256:forged'; }],
      ['worker_integrity_mismatch', response => { response.worker_receipt.result.byte_count += 1; response.result.byte_count += 1; }],
      ['worker_result_mismatch', response => { response.result.digest = 'sha256:' + '0'.repeat(64); }],
      ['compute_receipt_worker_mismatch', response => { response.receipt.worker_receipt_hash = 'sha256:wrong'; }],
      ['compute_receipt_integrity_mismatch', response => { response.receipt.receipt_hash = '0'.repeat(64); }],
    ];

    for (const [reason, mutate] of cases) {
      const result = structuredClone(original.response);
      mutate(result);
      assert.throws(
        () => verifyNodeSeedWorkerCompletion({ response: result, ...original.args }),
        new RegExp('nodeseed_receipt_' + reason),
        'must reject ' + reason,
      );
    }

    // Even if every receipt is rehashed to match a falsely claimed digest,
    // the local deterministic SHA-256 check must still catch the wrong output.
    const forged = structuredClone(original.response);
    forged.result.digest = 'sha256:' + '0'.repeat(64);
    forged.worker_receipt.result.digest = forged.result.digest;
    const { receipt_hash: _oldHash, ...workerBody } = forged.worker_receipt;
    forged.worker_receipt.receipt_hash = 'sha256:' + sha(JSON.stringify(stable(workerBody)));
    forged.receipt.worker_receipt_hash = forged.worker_receipt.receipt_hash;
    const { receipt_hash: _oldComputeHash, ...computeBody } = forged.receipt;
    forged.receipt.receipt_hash = sha(JSON.stringify(computeBody));
    assert.throws(
      () => verifyNodeSeedWorkerCompletion({ response: forged, ...original.args }),
      /nodeseed_receipt_hash_digest_mismatch/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Saban holds an unverified remote outcome and dispatcher refuses automatic redispatch', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saban-receipt-hold-'));
  const queue = new AmbientWorkQueue({ root: path.join(root, 'work-queue') });
  const job = queue.submit({
    workload_class: WORKLOAD,
    payload: { value: 'Saban verified work' },
    idempotency_key: 'receipt-hold-job',
    private_data: false,
  });
  const intent = createNodeSeedExecutionIntent({
    root,
    job,
    task: { schema: 'evercraft.saban.fabric-task.v1', resources_per_execution: job.resources },
    placement: { market: 'evercraft-nodeseed', provider_id: NODE, unit_id: 'unit-1', offer_id: 'proof' },
    plan: { receipt_hash: 'sha256:proof' },
  });
  queue.update(job.job_id, { state: 'handoff_wait' });
  const workerFixture = fixture({
    root: path.join(root, 'worker'),
    key: intent.idempotency_key,
    payload: job.payload,
  });
  const invalidResponse = structuredClone(workerFixture.response);
  invalidResponse.result.digest = 'sha256:' + '0'.repeat(64);
  const server = http.createServer((req, res) => {
    req.resume();
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/leases' && req.method === 'POST') {
      res.writeHead(201).end(JSON.stringify({
        lease_id: 'proof-lease', token: 'test-only-local-lease', workload_class: WORKLOAD,
      }));
    } else if (req.url === '/v1/jobs' && req.method === 'POST') {
      res.writeHead(200).end(JSON.stringify(invalidResponse));
    } else if (req.url === '/v1/leases/proof-lease/release' && req.method === 'POST') {
      res.writeHead(200).end(JSON.stringify({ ok: true }));
    } else {
      res.writeHead(404).end(JSON.stringify({ error: 'not_found' }));
    }
  });

  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const endpoint = 'http://127.0.0.1:' + server.address().port;
    const yard = {
      async listRemoteCapacityNodes() {
        return { nodes: [{
          node_id: NODE,
          connected: true,
          device_fingerprint: FINGERPRINT,
          capacity: {
            authorized: true,
            session_attestation_verified: true,
            zero_cost: true,
            device_fingerprint: FINGERPRINT,
            supported_workloads: [WORKLOAD],
          },
        }] };
      },
      async remoteCapacityGrant() {
        return {
          node_id: NODE,
          device_fingerprint: FINGERPRINT,
          capacity_endpoint: endpoint,
          allocator_token: 'test-only-local-control',
        };
      },
    };
    const result = await executeNodeSeedExecutionIntent({
      root, intentId: intent.intent_id, yard, brokerDeploymentId: 'proof-broker',
    });
    assert.equal(result.status, 'verification_hold');
    assert.equal(result.reason, 'nodeseed_receipt_worker_result_mismatch');
    assert.equal(queue.get(job.job_id).state, 'held');
    assert.equal(queue.get(job.job_id).last_hold.reason, 'unverified_remote_worker_result');
    assert.equal(getNodeSeedExecutionIntent({ root, intentId: intent.intent_id }).state, 'verification_hold');

    const nextCycle = await dispatchAmbientJobsOnce({
      root,
      maxJobs: 1,
      gatewayUrl: 'http://127.0.0.1:1',
    });
    assert.equal(nextCycle.held, 1);
    assert.equal(nextCycle.rows[0]?.manual_review_required, true);
    assert.equal(queue.get(job.job_id).state, 'held');
    assert.equal(queue.get(job.job_id).execution_receipt, null);
  } finally {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
