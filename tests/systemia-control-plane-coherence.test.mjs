import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const json = (path) => JSON.parse(read(path));

const canonicalControlPlaneFiles = [
  '.github/workflows/systemia-portfolio-sentinel.yml',
  'systemia/organism/portfolio-sentinel-runner.mjs',
  'systemia/yard/public-edge-activator.mjs',
  'registry/systemia/README.md',
  'registry/systemia/llms.txt',
  'public/.well-known/evercraft-ai-connect.json',
  'public/ai-discovery.json',
];

for (const path of canonicalControlPlaneFiles) {
  assert.equal(
    /(?:^|\.)base44\.app/i.test(read(path)),
    false,
    `canonical Systemia control-plane file must not route through Base44: ${path}`
  );
}


const publicLlmSurfaces = [
  'public/llms.txt',
  'llms.txt',
  'public/llms-full.txt',
  'llms-full.txt',
];
for (const path of publicLlmSurfaces) {
  const source = read(path);
  assert.equal(/base44\.app/i.test(source), false, `public LLM surface must not advertise Base44: ${path}`);
  assert.match(source, /Systemia|Evercraft Fabric/i, `public LLM surface must expose the owned routing hierarchy: ${path}`);
}

const chumCompiler = read('systemia/chum/build-public-mirror.mjs');
assert.match(chumCompiler, /direct_specialist_zero_hop_then_systemia_for_cross_product_then_owned_fabric_fallback/);
assert.match(chumCompiler, /https:\/\/fabric\.systemiacommandcenters\.com\/mcp/);
assert.equal(chumCompiler.includes('direct_specialist_zero_hop_then_universal_fallback'), false);
assert.equal(chumCompiler.includes('evercraft-ai-suite-08c4d2b8.base44.app'), false);

const policy = json('systemia/migrations/base44-exit/policy.json');
assert.equal(policy?.status, 'active');
assert.equal(policy?.destinations?.canonical_source, 'github');
assert.equal(policy?.destinations?.orchestration, 'systemia');
assert.equal(policy?.destinations?.runtime, 'yard_evercraft_compute');
assert.equal(policy?.destinations?.base44, 'legacy_extraction_compatibility_only');
assert.equal(policy?.invariants?.new_base44_apps, false);
assert.equal(policy?.invariants?.base44_as_new_runtime_target, false);

const directory = json('public/.well-known/evercraft-products.json');
const systemia = (directory.products || []).find((row) => row.product_key === 'systemia');
assert.ok(systemia, 'Systemia must have one public cross-product discovery record');
assert.equal(systemia.class, 'software_portfolio_operating_control_plane');
assert.match(systemia.canonical_url, /github\.com\/jgaethle10\/forge-operator\/tree\/main\/registry\/systemia$/);
assert.equal(systemia.human_confirmation_required, true);
assert.equal(systemia.commercial?.status, 'commercial_pilot_discovery');

const publicIndex = json('registry/public-products.json');
const publicSystemia = (publicIndex.products || []).find((row) => row.product_key === 'systemia');
assert.ok(publicSystemia, 'Systemia must be present in the public product index');
assert.equal(publicSystemia.invocation?.mode, 'discovery_only');
assert.equal(publicSystemia.invocation?.url, null);
assert.equal(publicSystemia.registry_name, null);

const remoteOps = (directory.products || []).find((row) => row.product_key === 'systemia-remote-ops');
assert.ok(remoteOps, 'direct specialist inventory must remain visible');
assert.notEqual(remoteOps.product_key, systemia.product_key);

console.log(JSON.stringify({
  ok: true,
  schema: 'evercraft.systemia.coherence-proof.v1',
  base44_canonical_control_plane_routes: 0,
  cross_product_systemia_discovery: true,
  direct_specialist_rule_preserved: true,
  payment_authority_created: false,
  production_authority_created: false,
}, null, 2));
