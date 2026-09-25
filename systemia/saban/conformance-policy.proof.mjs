import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const directory = readJson('public/.well-known/evercraft-products.json');
const conformance = readJson('conformance/products.json');
const catalog = readJson('registry/catalog.json');

const conformanceKeys = new Set((conformance.products || []).map((p) => p.product_key));
const catalogByKey = new Map((catalog.products || []).map((p) => [
  p.product_key || String(p.registry_name || '').split('/').pop(),
  p,
]));

const pending = (directory.products || [])
  .filter((p) => !conformanceKeys.has(p.product_key))
  .map((p) => {
    const route = catalogByKey.get(p.product_key);
    const invocation = route?.mcp
      ? 'mcp'
      : route?.http_router
        ? 'bounded_http'
        : 'discovery_only';
    return {
      product_key: p.product_key,
      invocation,
    };
  });

const unsafePending = pending.filter((p) => p.invocation !== 'discovery_only');
assert.deepEqual(
  unsafePending,
  [],
  'a callable product may not remain pending cross-LLM conformance'
);

const output = execFileSync(
  process.execPath,
  ['systemia/saban/discovery-swarm.mjs', '--strict'],
  { encoding: 'utf8' }
).trim();

const lines = output.split('\n').filter(Boolean);
const summary = JSON.parse(lines.at(-1));
assert.equal(summary.required_conformance_missing, 0);
assert.equal(
  summary.discovery_only_conformance_pending,
  pending.length
);
assert.ok(summary.public_index_current);
assert.equal(summary.invalid_public_contracts, 0);
assert.equal(summary.github_mirrors_missing, 0);

console.log(JSON.stringify({
  ok: true,
  schema: 'evercraft.saban.conformance-policy-proof.v1',
  pending_discovery_only: pending.length,
  required_conformance_missing: summary.required_conformance_missing,
  strict_gate_passed: true,
  rule: 'discovery_only_may_be_pending_callable_may_not',
}, null, 2));
