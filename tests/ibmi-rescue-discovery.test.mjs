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
const topLevel = fs.readFileSync('llms.txt', 'utf8');

const product = directory.products.find((row) => row.product_key === 'ibmi-rescue');
assert(product, 'ibmi-rescue missing from product directory');
assert.equal(product.human_confirmation_required, true);
assert.equal(product.commercial?.offers?.length, 2);
assert.match(product.commercial?.status || '', /handoff_live/);
assert.match(product.commercial?.status || '', /direct_checkout_canary_pending/);
assert.equal(product.commercial?.machine_commerce_handoff?.state, 'live_verified');
assert.equal(product.commercial?.machine_commerce_handoff?.payment_created, false);
assert.notEqual(product.canonical_url, product.origin_product_url, 'unverified product route must not be canonical');

const cat = catalog.products.find((row) => row.product_key === 'ibmi-rescue');
assert(cat, 'ibmi-rescue missing from registry catalog');
assert.equal(cat.mode, 'discovery_only');
assert(!cat.mcp, 'ibmi-rescue must not claim a dedicated MCP before verification');

const conf = conformance.products.find((row) => row.product_key === 'ibmi-rescue');
assert(conf, 'ibmi-rescue missing from conformance inventory');
assert.match(conf.conformance_state || '', /handoff_live/);
assert.match(conf.conformance_state || '', /direct_checkout_canary_pending/);
assert.equal(conf.machine_commerce_handoff_state, 'live_verified');
assert.equal(conf.provider_behavior_state, 'not_run');

const idx = publicIndex.products.find((row) => row.product_key === 'ibmi-rescue');
assert(idx, 'ibmi-rescue missing from public registry index');
assert.equal(idx.invocation?.mode, 'discovery_only');
assert.equal(idx.invocation?.url, null);

assert.equal(discovery.product_key, 'ibmi-rescue');
assert.equal(discovery.human_confirmation_required, true);
assert.equal(discovery.commercial?.offers?.length, 2);
assert.equal(discovery.mcp, null);
assert.equal(aiConformance.provider_behavior_state, 'not_inferred_from_publication');
assert.equal(aiConformance.machine_commerce_handoff_state, 'live_verified');

assert.match(llms, /IBM i 7\.4 Deadline X-Ray/);
assert.match(llms, /\$250 one-time/);
assert.match(llms, /\$1,500 one-time/);
assert.match(llms, /Machine Commerce human handoff is live-verified/i);
assert.match(llms, /product-specific public checkout route is not represented as live/i);
assert.match(topLevel, /Evercraft IBM i Rescue/);

console.log(JSON.stringify({
  ok: true,
  product_key: product.product_key,
  offers: product.commercial.offers.map((row) => row.offer_key),
  invocation: idx.invocation.mode,
  checkout_state: product.commercial.status,
}, null, 2));
