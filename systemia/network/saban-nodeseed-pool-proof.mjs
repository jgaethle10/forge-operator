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
  placementLabels: ['ground'],
  announce: false
});

const seedB = await startNodeSeed({
  root: path.join(root, 'node-b'),
  nodeId: 'saban-pool-node-b',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken,
  placementLabels: ['air_relay', 'edge_compute'],
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

  const airOnly = await runNodeSeedAssignmentPool({
    software: 'chum',
    assignments: assignments.slice(0, 2),
    endpoints: [seedB.endpoint],
    allocatorToken,
    maxAttempts: 1,
    maxConcurrencyPerNode: 1,
    assignmentTimeoutMs: 10000,
    resourceProfile: {
      required_node_labels: ['air_relay']
    }
  });
  assert.equal(airOnly.completed_assignments, 2);
  assert.deepEqual(airOnly.nodes[0].placement_labels, ['air_relay', 'edge_compute']);

  await assert.rejects(
    () => runNodeSeedAssignmentPool({
      software: 'chum',
      assignments: assignments.slice(0, 1),
      endpoints: [seedB.endpoint],
      allocatorToken,
      maxAttempts: 1,
      maxConcurrencyPerNode: 1,
      assignmentTimeoutMs: 10000,
      resourceProfile: {
        forbidden_node_labels: ['air_relay']
      }
    }),
    /no_nodeseed_capacity_meets_resource_profile/
  );

  console.log(JSON.stringify({
    schema: 'evercraft.saban.nodeseed-pool-proof.v1',
    status: 'pass',
    assignments: assignments.length,
    completed: receipt.completed_assignments,
    failed: receipt.failed_assignments,
    failovers: receipt.failover_assignments,
    idempotency_preserved: true,
    killed_node: 'saban-pool-node-a',
    surviving_node: 'saban-pool-node-b',
    placement_label_routing: true,
    air_relay_required_profile_completed: true,
    air_relay_forbidden_profile_rejected: true
  }));
} finally {
  if (!seedAClosed) await seedA.close();
  await seedB.close();
  fs.rmSync(root, { recursive: true, force: true });
}
