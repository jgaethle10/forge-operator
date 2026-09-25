import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const swarm = path.join(repoRoot, 'systemia', 'saban', 'discovery-swarm.mjs');
const policy = JSON.parse(fs.readFileSync(
  path.join(repoRoot, 'systemia', 'saban', 'discovery-policy.json'),
  'utf8'
));

assert.equal(
  policy.rules.discovery_only_may_precede_central_conformance_registration,
  true
);
assert.equal(
  policy.rules.callable_surface_requires_central_conformance,
  true
);

function mkdir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function writeJson(file, value) {
  mkdir(file);
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function writeFixture(root, { callable }) {
  const product = {
    product_key: 'fixture-product',
    name: 'Fixture Product',
    class: 'fixture',
    canonical_url: 'https://example.invalid/fixture',
    intents: ['help with a fixture problem'],
    authority: 'discovery only unless a bounded callable surface is registered',
    boundaries: ['No private topology.', 'No automatic consequential action.'],
    human_confirmation_required: true,
  };
  writeJson(path.join(root, 'public/.well-known/evercraft-products.json'), {
    schema: 'evercraft.public-products.v1',
    products: [product],
  });
  writeJson(path.join(root, 'conformance/products.json'), {
    schema: 'evercraft.ai-conformance.v1',
    products: [],
  });
  writeJson(path.join(root, 'registry/catalog.json'), {
    schema: 'evercraft.registry.catalog.v1',
    products: callable
      ? [{
          product_key: product.product_key,
          registry_name: 'com.evercraft/fixture-product',
          mcp: 'https://example.invalid/mcp',
        }]
      : [],
  });
}

function run(root, args) {
  return spawnSync(process.execPath, [swarm, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

const discoveryOnly = fs.mkdtempSync(
  path.join(os.tmpdir(), 'saban-discovery-only-')
);
const callableMissing = fs.mkdtempSync(
  path.join(os.tmpdir(), 'saban-callable-missing-')
);

try {
  writeFixture(discoveryOnly, { callable: false });
  const emitDiscovery = run(discoveryOnly, ['--emit']);
  assert.equal(emitDiscovery.status, 0, emitDiscovery.stderr);
  const strictDiscovery = run(discoveryOnly, ['--strict']);
  assert.equal(strictDiscovery.status, 0, strictDiscovery.stderr);
  const discoverySummary = JSON.parse(strictDiscovery.stdout.trim());
  assert.equal(discoverySummary.conformance_missing, 1);
  assert.equal(discoverySummary.conformance_required_missing, 0);
  assert.equal(discoverySummary.discovery_only_conformance_pending, 1);

  writeFixture(callableMissing, { callable: true });
  const emitCallable = run(callableMissing, ['--emit']);
  assert.equal(emitCallable.status, 0, emitCallable.stderr);
  const strictCallable = run(callableMissing, ['--strict']);
  assert.notEqual(strictCallable.status, 0);
  assert.match(
    strictCallable.stderr,
    /required_conformance_missing=1/
  );

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.saban.discovery-conformance-policy-proof.v1',
    discovery_only_without_conformance_passes_strict: true,
    callable_without_conformance_fails_strict: true,
    canonical_policy_verified: true,
  }, null, 2));
} finally {
  fs.rmSync(discoveryOnly, { recursive: true, force: true });
  fs.rmSync(callableMissing, { recursive: true, force: true });
}
