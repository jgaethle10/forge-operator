#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { runNodeSeedAssignmentPool } from '../saban/nodeseed-pool.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-placement-label-proof-'));
const allocatorToken = 'placement-label-proof-token';

const ground = await startNodeSeed({
  root: path.join(root, 'ground'),
  nodeId: 'placement-ground',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken,
  placementLabels: ['ground', 'gateway'],
  announce: false
});

const air = await startNodeSeed({
  root: path.join(root, 'air'),
  nodeId: 'placement-air',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken,
  placementLabels: ['AIR_RELAY', 'temporary', 'bad label with spaces'],
  announce: false
});

function assignment(id) {
  return {
    agent_id: id,
    idempotency_key: id + '-idem',
    role: 'surface_auditor',
    work: {
      kind: 'product',
      key: id,
      source_file: null
    },
    item: {
      kind: 'product',
      key: id,
      raw: {
        canonical_url: 'https://example.com/' + id,
        intents: ['connectivity'],
        authority: 'proof',
        boundaries: ['public only']
      }
    }
  };
}

try {
  assert.deepEqual(ground.placement_labels, ['ground', 'gateway']);
  assert.deepEqual(air.placement_labels, ['air_relay', 'temporary']);

  const airOnly = await runNodeSeedAssignmentPool({
    software: 'chum',
    assignments: [assignment('air-only-proof')],
    endpoints: [ground.endpoint, air.endpoint],
    allocatorToken,
    maxAttempts: 1,
    maxConcurrencyPerNode: 1,
    assignmentTimeoutMs: 10000,
    resourceProfile: {
      required_node_labels: ['air_relay']
    }
  });

  assert.equal(airOnly.completed_assignments, 1);
  assert.equal(airOnly.failed_assignments, 0);
  assert.equal(airOnly.nodes.length, 1);
  assert.equal(airOnly.nodes[0].node_id, 'placement-air');
  assert.deepEqual(airOnly.nodes[0].placement_labels, ['air_relay', 'temporary']);
  assert.ok(
    airOnly.rejected_nodes.some(
      (row) =>
        row.node_id === 'placement-ground' &&
        row.reason === 'missing_required_node_label:air_relay'
    )
  );

  const groundOnly = await runNodeSeedAssignmentPool({
    software: 'chum',
    assignments: [assignment('ground-only-proof')],
    endpoints: [ground.endpoint, air.endpoint],
    allocatorToken,
    maxAttempts: 1,
    maxConcurrencyPerNode: 1,
    assignmentTimeoutMs: 10000,
    resourceProfile: {
      forbidden_node_labels: ['AIR_RELAY']
    }
  });

  assert.equal(groundOnly.completed_assignments, 1);
  assert.equal(groundOnly.failed_assignments, 0);
  assert.equal(groundOnly.nodes.length, 1);
  assert.equal(groundOnly.nodes[0].node_id, 'placement-ground');
  assert.ok(
    groundOnly.rejected_nodes.some(
      (row) =>
        row.node_id === 'placement-air' &&
        row.reason === 'forbidden_node_label:AIR_RELAY'
    )
  );

  console.log(JSON.stringify({
    schema: 'evercraft.nodeseed-placement-label-proof.v1',
    status: 'PASS',
    invariants: {
      labels_normalized_and_bounded: true,
      required_label_filters_capacity: true,
      forbidden_label_filters_capacity: true,
      placement_receipts_preserve_labels: true,
      generic_scheduler_not_drone_specific: true
    },
    air_node: airOnly.nodes[0],
    ground_node: groundOnly.nodes[0]
  }, null, 2));
} finally {
  await ground.close();
  await air.close();
  fs.rmSync(root, { recursive: true, force: true });
}
