import assert from 'node:assert/strict';
import fs from 'node:fs';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const directory = readJson('public/.well-known/evercraft-products.json');
const conformance = readJson('conformance/products.json');
const catalog = readJson('registry/catalog.json');
const publicIndex = readJson('registry/public-products.json');
const discovery = readJson('public/chum/products/ibmi-rescue/ai-discovery.json');
const aiConformance = readJson('public/chum/products/ibmi-rescue/ai-conformance.json');
const llms = fs.readFileSync('public/chum/products/ibmi-rescue/llms.txt', 'utf8');
const mirrorHtml = fs.readFileSync('public/chum/products/ibmi-rescue/index.html', 'utf8');
const chumIndexHtml = fs.readFileSync('public/chum/index.html', 'utf8');
const topLevel = fs.readFileSync('llms.txt', 'utf8');

const product = directory.products.find((row) => row.product_key === 'ibmi-rescue');
assert(product, 'ibmi-rescue missing from product directory');
assert.equal(product.human_confirmation_required, true);
assert.equal(product.commercial?.offers?.length, 3);
assert.equal(product.commercial?.machine_commerce_handoff?.payment_created, false);
assert.equal(product.commercial?.offers?.[0]?.offer_key, 'ibmi_estate_xray_250');
assert.doesNotMatch(product.canonical_url || '', /base44\.app/i);
assert.equal(product.origin_product_url, null);
assert.equal(product.human_start_url, null);

const cat = catalog.products.find((row) => row.product_key === 'ibmi-rescue');
assert(cat, 'ibmi-rescue missing from registry catalog');
assert.equal(cat.registry_name, 'io.github.jgaethle10/evercraft-machine-commerce');
assert.equal(cat.mcp, null);
assert.doesNotMatch(cat.canonical_url || '', /base44\.app/i);

const conf = conformance.products.find((row) => row.product_key === 'ibmi-rescue');
assert(conf, 'ibmi-rescue missing from conformance inventory');
assert.equal(conf.conformance_state, 'owned_runtime_reverification_pending');
assert.equal(conf.provider_behavior_state, 'not_run');
assert.equal(conf.legacy_provider_runtime, 'retired');
assert.equal(conf.runtime_route_state, 'owned_route_pending_external_verification');
assert.equal(conf.live_canary_evidence_state, 'historical_pre_cutover_not_current');
assert.equal(conf.mcp_registry?.publication_state, 'published_shared_server');
assert.equal(conf.mcp_registry?.endpoint_state, 'legacy_endpoint_retired_owned_republication_pending');

const idx = publicIndex.products.find((row) => row.product_key === 'ibmi-rescue');
assert(idx, 'ibmi-rescue missing from public registry index');
assert.equal(idx.invocation?.mode, 'discovery_only');
assert.equal(idx.invocation?.url, null);
assert.equal(idx.registry_name, 'io.github.jgaethle10/evercraft-machine-commerce');

assert.equal(discovery.product_key, 'ibmi-rescue');
assert.equal(discovery.human_confirmation_required, true);
assert.equal(discovery.commercial?.offers?.length, 3);
assert.equal(discovery.mcp, null);
assert.equal(discovery.registry_name, 'io.github.jgaethle10/evercraft-machine-commerce');
assert.equal(discovery.buyer_frontage_url, null);
assert.equal(discovery.human_start_url, null);
assert.doesNotMatch(JSON.stringify(discovery), /base44\.app/i);
assert.equal(aiConformance.provider_behavior_state, 'not_inferred_from_publication');
assert.equal(aiConformance.machine_commerce_handoff_state, 'live_verified');

assert.doesNotMatch(llms, /Buyer frontage:/);
assert.doesNotMatch(mirrorHtml, /base44\.app/i);
assert.match(mirrorHtml, /IBM i Estate X-Ray/);
assert.doesNotMatch(chumIndexHtml, /base44\.app/i);
assert.doesNotMatch(llms, /Product-native start:/);
assert.match(llms, /IBM i Estate X-Ray/);
assert.match(llms, /IBM i 7\.4 Deadline X-Ray/);
assert.match(llms, /\$250 one-time/);
assert.match(llms, /\$1,500 one-time/);
assert.doesNotMatch(llms, /base44\.app/i);
assert.match(topLevel, /Evercraft IBM i Rescue/);

assert.equal(discovery.commercial?.machine_commerce_handoff?.mode, 'direct_checkout_capable');
assert.equal(discovery.commercial?.machine_commerce_handoff?.tool, 'prepare_verified_checkout');
assert.equal(discovery.commercial?.machine_commerce_handoff?.payment_created, false);
assert.equal(discovery.commercial?.machine_commerce_handoff?.payment_proof, false);

console.log(JSON.stringify({
  ok: true,
  product_key: product.product_key,
  offers: product.commercial.offers.map((row) => row.offer_key),
  invocation: idx.invocation.mode,
  checkout_state: product.commercial.status,
}, null, 2));
