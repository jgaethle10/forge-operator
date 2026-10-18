#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  assertNoSecretValues,
  buildEvacuationPlan,
  reconcilePortfolioPlans
} from './contract.mjs';

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function loadRows(file) {
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Array.isArray(payload)) return payload;
  return payload.apps || payload.items || payload.products || [];
}

const inventoryPath = arg('--inventory');
if (!inventoryPath) {
  console.error('Usage: node systemia/base44-evac/runner.mjs --inventory <private-json> [--out <file>]');
  process.exit(2);
}

const rows = loadRows(path.resolve(inventoryPath));
const plans = rows.map(buildEvacuationPlan);
const portfolio = reconcilePortfolioPlans(plans);
const receipt = {
  schema: 'evercraft.base44-evac.receipt.v1',
  generated_at: new Date().toISOString(),
  inventory_source: 'private_external_inventory',
  portfolio,
  apps: plans,
  boundary: {
    source_platform: 'base44',
    source_mutations_applied: 0,
    source_decommissions_applied: 0,
    secret_values_emitted: false
  }
};
assertNoSecretValues(receipt);

const outPath = path.resolve(arg('--out', 'artifacts/base44-evac/latest.json'));
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(receipt, null, 2) + '\n');

console.log(JSON.stringify({
  status: 'planned',
  apps: plans.length,
  cutover_ready: portfolio.summary.cutover_ready,
  blocked: portfolio.summary.not_cutover_ready,
  out: path.relative(process.cwd(), outPath)
}));
