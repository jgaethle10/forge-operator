#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildMultiplicationPlan,
  executeMultiplicationPlan,
  loadMultiplicationRegistry,
  loadPrivateInventory,
  resolveMultiplicationContract
} from './multiplier.mjs';

const rootDir = process.cwd();
const registry = loadMultiplicationRegistry();
const contract = resolveMultiplicationContract('portfolio-archaeology', registry);
const inventoryPath = path.join(rootDir, 'systemia/saban/fixtures/private-portfolio.json');
const workItems = loadPrivateInventory(inventoryPath, {
  privacy: contract.inventory_privacy || {}
});

assert.equal(workItems.length, 6);
assert.ok(workItems.every((item) => item.raw?.source_identifiers_redacted === true));
assert.ok(workItems.every((item) => !JSON.stringify(item).includes('private-source-id-')));

const plan = buildMultiplicationPlan({
  contract,
  logicalAgents: workItems.length * contract.roles.length,
  physicalWorkers: 4,
  workItems
});

const receipt = await executeMultiplicationPlan({
  contract,
  plan,
  workItems,
  rootDir,
  reconcile: true,
  statePath: path.join('artifacts', 'saban-multiplier', 'portfolio-archaeology-state.json'),
  resume: false
});

assert.equal(receipt.quality.status, 'pass');
assert.equal(receipt.reconciliation.status, 'reconciled');
assert.equal(receipt.reconciliation.publication_changes_applied, 0);
assert.equal(receipt.reconciliation.source_identifiers_emitted, false);
assert.ok(receipt.reconciliation.classification_counts.known_public >= 1);
assert.ok(receipt.reconciliation.classification_counts.placeholder >= 1);
assert.ok(receipt.reconciliation.classification_counts.commercial_candidate >= 1);
assert.ok(receipt.reconciliation.classification_counts.internal_only_candidate >= 1);
assert.ok(receipt.reconciliation.duplicate_name_groups.length >= 1);

const serialized = JSON.stringify(receipt);
assert.ok(!serialized.includes('private-source-id-'));

console.log(JSON.stringify({
  schema: 'evercraft.saban.portfolio-archaeology-proof.v1',
  status: 'pass',
  work_items: workItems.length,
  logical_agents: plan.logical_agents,
  classifications: receipt.reconciliation.classification_counts,
  duplicate_groups: receipt.reconciliation.duplicate_name_groups.length,
  admission_queue: receipt.reconciliation.admission_queue.length,
  source_identifiers_emitted: false,
  publication_changes_applied: 0
}));
