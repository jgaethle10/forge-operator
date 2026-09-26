#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { runNodeSeedAssignmentPool } from '../saban/nodeseed-pool.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saban-nodeseed-pool-'));
const allocatorToken = 'saban-pool-proof-token';

const seedA = await startNodeSeed({
  root: path.join(root, 'node-a'),
  nodeId: 'saban-pool-node-a',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken,
  announce: false
});

const seedB = await startNodeSeed({
  root: path.join(root, 'node-b'),
  nodeId: 'saban-pool-node-b',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken,
  announce: false
});

const assignments = Array.from({ length: 24 }, (_, index) => ({
  agent_id: `pool-proof-${String(index + 1).padStart(3, '0')}`,
  idempotency_key: `proof-idempotency-${String(index + 1).padStart(3, '0')}`,
  role: 'surface_auditor',
  work: {
    kind: 'product',
    key: `proof-product-${index + 1}`,
    source_file: null
  },
  item: {
    kind: 'product',
    key: `proof-product-${index + 1}`,
    raw: {
      canonical_url: `https://example.com/proof-${index + 1}`,
      intents: ['one', 'two', 'three'],
      authority: 'proof',
      boundaries: ['public only']
    }
  }
}));

let seedAClosed = false;

try {
  const receipt = await runNodeSeedAssignmentPool({
    software: 'chum',
    assignments,
    endpoints: [seedA.endpoint, seedB.endpoint],
    allocatorToken,
    maxAttempts: 3,
    maxConcurrencyPerNode: 1,
    assignmentTimeoutMs: 10000,
    onEvent: async (event) => {
      if (
        !seedAClosed &&
        event.type === 'assignment.completed' &&
        event.node_id === 'saban-pool-node-a'
      ) {
        seedAClosed = true;
        await seedA.close();
      }
    }
  });

  assert.equal(seedAClosed, true);
  assert.equal(receipt.requested_assignments, assignments.length);
  assert.equal(receipt.completed_assignments, assignments.length);
  assert.equal(receipt.failed_assignments, 0);
  assert.ok(receipt.failover_assignments > 0);
  assert.equal(receipt.lease_renewals.supported_nodes, 2);
  assert.ok(receipt.lease_renewals.renewed >= 2);
  assert.equal(receipt.lease_renewals.failed, 0);
  assert.ok(
    receipt.events.some(
      (event) =>
        event.type === 'node.assignment.failed' &&
        event.node_id === 'saban-pool-node-a'
    )
  );
  assert.ok(
    receipt.events.some(
      (event) => event.type === 'assignment.failover.completed'
    )
  );
  const completedResults = receipt.results
    .filter((result) => result?.status === 'completed');
  assert.ok(
    completedResults.every(
      (result) => result.result?.schema === 'evercraft.saban.registered-worker-receipt.v1'
    )
  );
  assert.ok(
    completedResults.every(
      (result) =>
        result.result?.idempotency_key === result.assignment?.idempotency_key &&
        result.checkpoint?.state?.idempotency_key === result.assignment?.idempotency_key
    )
  );
  assert.ok(
    completedResults
      .filter((result) => result.failover)
      .every(
        (result) =>
          result.result?.idempotency_key === result.assignment?.idempotency_key
      )
  );

  const conflictAssignments = [
    {
      agent_id: 'classification-proof-1',
      idempotency_key: 'classification-proof-shared-key',
      role: 'surface_auditor',
      work: { kind: 'product', key: 'classification-proof-a', source_file: null },
      item: {
        kind: 'product',
        key: 'classification-proof-a',
        raw: {
          canonical_url: 'https://example.com/classification-a',
          intents: ['proof'],
          authority: 'proof',
          boundaries: ['public only']
        }
      }
    },
    {
      agent_id: 'classification-proof-2',
      idempotency_key: 'classification-proof-shared-key',
      role: 'surface_auditor',
      work: { kind: 'product', key: 'classification-proof-b', source_file: null },
      item: {
        kind: 'product',
        key: 'classification-proof-b',
        raw: {
          canonical_url: 'https://example.com/classification-b',
          intents: ['proof'],
          authority: 'proof',
          boundaries: ['public only']
        }
      }
    },
    {
      agent_id: 'classification-proof-3',
      idempotency_key: 'classification-proof-unique-key',
      role: 'surface_auditor',
      work: { kind: 'product', key: 'classification-proof-c', source_file: null },
      item: {
        kind: 'product',
        key: 'classification-proof-c',
        raw: {
          canonical_url: 'https://example.com/classification-c',
          intents: ['proof'],
          authority: 'proof',
          boundaries: ['public only']
        }
      }
    }
  ];

  const classificationReceipt = await runNodeSeedAssignmentPool({
    software: 'chum',
    assignments: conflictAssignments,
    endpoints: [seedB.endpoint],
    allocatorToken,
    maxAttempts: 3,
    maxConcurrencyPerNode: 1,
    assignmentTimeoutMs: 10000
  });

  assert.equal(classificationReceipt.requested_assignments, 3);
  assert.equal(classificationReceipt.completed_assignments, 2);
  assert.equal(classificationReceipt.failed_assignments, 1);
  assert.equal(classificationReceipt.results[0]?.status, 'completed');
  assert.equal(classificationReceipt.results[1]?.status, 'failed');
  assert.equal(
    classificationReceipt.results[1]?.failure_class,
    'workload_conflict'
  );
  assert.equal(classificationReceipt.results[1]?.retryable, false);
  assert.equal(classificationReceipt.results[1]?.node_quarantined, false);
  assert.equal(classificationReceipt.results[1]?.node_disabled_for_run, false);
  assert.equal(classificationReceipt.results[1]?.attempts, 1);
  assert.equal(classificationReceipt.results[2]?.status, 'completed');
  assert.equal(
    classificationReceipt.nodes[0]?.node_id,
    'saban-pool-node-b'
  );
  assert.equal(classificationReceipt.nodes[0]?.healthy_at_end, true);
  assert.equal(classificationReceipt.nodes[0]?.available_at_end, true);
  assert.ok(
    classificationReceipt.events.some(
      (event) =>
        event.type === 'node.assignment.failed' &&
        event.failure_class === 'workload_conflict' &&
        event.retryable === false &&
        event.node_quarantined === false &&
        event.node_disabled_for_run === false
    )
  );

  console.log(JSON.stringify({
    schema: 'evercraft.saban.nodeseed-pool-proof.v1',
    status: 'pass',
    assignments: assignments.length,
    completed: receipt.completed_assignments,
    failed: receipt.failed_assignments,
    failovers: receipt.failover_assignments,
    lease_renewals: receipt.lease_renewals.renewed,
    idempotency_preserved: true,
    workload_conflict_classified: true,
    workload_conflict_retry_suppressed: true,
    healthy_node_preserved_after_workload_conflict: true,
    killed_node: 'saban-pool-node-a',
    surviving_node: 'saban-pool-node-b'
  }));
} finally {
  if (!seedAClosed) await seedA.close();
  await seedB.close();
  fs.rmSync(root, { recursive: true, force: true });
}
