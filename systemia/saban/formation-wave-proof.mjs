#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import { executeFormation, planFormation } from './formation.mjs';

const rootDir = process.cwd();
const request = {
  schema: 'evercraft.saban.formation-request.v1',
  formation_id: 'proof-wave-formation',
  nodes: [
    {
      id: 'discovery',
      software: 'chum',
      logical_agents: 64,
      physical_workers: 4,
      reconcile: false
    },
    {
      id: 'archaeology',
      software: 'portfolio-archaeology',
      inventory: 'systemia/saban/fixtures/private-portfolio.json',
      auto: true,
      reconcile: true
    },
    {
      id: 'media',
      software: 'media-pipeline',
      inventory: 'systemia/saban/fixtures/media-job.json',
      auto: true,
      depends_on: ['discovery', 'archaeology'],
      reconcile: true
    }
  ]
};

const formation = planFormation({ request, rootDir });
assert.deepEqual(
  formation.execution_waves,
  [['archaeology', 'discovery'], ['media']]
);

const receipt = await executeFormation({ formation, rootDir });
assert.equal(receipt.summary.failed, 0);
assert.equal(receipt.summary.failed_quality, 0);
assert.equal(receipt.summary.blocked, 0);
assert.equal(receipt.summary.completed, 3);
assert.deepEqual(receipt.execution_waves, formation.execution_waves);

const archaeology = receipt.nodes.find((node) => node.node_id === 'archaeology');
assert.equal(archaeology?.receipt?.quality?.status, 'pass');
assert.equal(
  archaeology?.receipt?.reconciliation?.publication_changes_applied,
  0
);

console.log(JSON.stringify({
  schema: 'evercraft.saban.formation-wave-proof.v1',
  status: 'pass',
  execution_waves: receipt.execution_waves,
  completed: receipt.summary.completed
}));
