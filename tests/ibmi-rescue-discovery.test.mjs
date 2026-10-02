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
assert.match(product.commercial?.status || '', /current_route_held/);
assert.equal(product.commercial?.machine_commerce_handoff?.current_route_verified, false);
assert.equal(product.commercial?.machine_commerce_handoff?.synthetic_checkout_created_in_canary, true);
assert.equal(product.commercial?.machine_commerce_handoff?.state, 'route_held_owned_replacement_required');
assert.equal(product.commercial?.machine_commerce_handoff?.payment_created, false);
assert.equal(product.commercial?.offers?.[0]?.offer_key, 'ibmi_estate_xray_250');
assert.notEqual(product.canonical_url, product.origin_product_url, 'unverified product route must not be canonical');

const cat = catalog.products.find((row) => row.product_key === 'ibmi-rescue');
assert(cat, 'ibmi-rescue missing from registry catalog');
assert.equal(cat.mode, 'discovery_only');
assert.equal(cat.mcp, null);
assert.equal(cat.registry_name, 'io.github.jgaethle10/evercraft-machine-commerce');
assert.equal(cat.machine_state, 'route_held_owned_replacement_required');

const conf = conformance.products.find((row) => row.product_key === 'ibmi-rescue');
assert(conf, 'ibmi-rescue missing from conformance inventory');
assert.equal(conf.conformance_state, 'machine_commerce_historical_checkout_verified_current_route_held');
assert.equal(conf.machine_commerce_handoff_state, 'historically_verified_current_route_held');
assert.equal(conf.provider_behavior_state, 'not_run');
assert.equal(conf.buyer_route_state, 'held_no_owned_public_route');
assert.equal(conf.backend_checkout_state, 'historical_synthetic_verified_no_current_route');
assert.equal(conf.machine_commerce_tool, 'prepare_verified_checkout');
assert.equal(conf.machine_commerce_offer_tool, 'get_live_checkout_offer');
assert.equal(conf.machine_commerce_status_tool, 'get_verified_order_status');
assert.equal(conf.mcp_registry?.publication_state, 'legacy_provider_remote_held_pending_owned_replacement');

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
assert.equal(aiConformance.provider_behavior_state, 'not_inferred_from_publication');
assert.equal(aiConformance.machine_commerce_handoff_state, 'historically_verified_current_route_held');

assert.doesNotMatch(llms, /Buyer frontage:/);
assert.match(mirrorHtml, /Review current offer/);
assert.doesNotMatch(mirrorHtml, /base44\.app/i);
assert.match(mirrorHtml, /IBM i Estate X-Ray/);
assert.doesNotMatch(chumIndexHtml, /findmypart\.base44\.app\/ibmi-rescue/i);
assert.doesNotMatch(llms, /Product-native start:/);
assert.match(llms, /IBM i Estate X-Ray/);
assert.match(llms, /IBM i 7\.4 Deadline X-Ray/);
assert.match(llms, /\$250 one-time/);
assert.match(llms, /\$1,500 one-time/);
assert.match(llms, /historical synthetic qa verified prior buyer-route reachability/i);
assert.match(llms, /synthetic QA verified creation of the \$250 Stripe Checkout session/i);
assert.match(llms, /current owned public buyer route is verified/i);
assert.match(topLevel, /Evercraft IBM i Rescue/);

assert.equal(discovery.commercial?.machine_commerce_handoff?.mode, 'direct_checkout_capability_historical_current_route_held');
assert.equal(discovery.commercial?.machine_commerce_handoff?.tool, 'prepare_verified_checkout');
assert.equal(discovery.commercial?.machine_commerce_handoff?.payment_created, false);
assert.equal(discovery.commercial?.machine_commerce_handoff?.payment_proof, false);
assert.equal(discovery.commercial?.machine_commerce_handoff?.current_route_verified, false);
assert.equal(JSON.stringify(discovery).includes('base44.app'), false);
assert.equal(JSON.stringify(aiConformance).includes('base44.app'), false);

console.log(JSON.stringify({
  ok: true,
  product_key: product.product_key,
  offers: product.commercial.offers.map((row) => row.offer_key),
  invocation: idx.invocation.mode,
  checkout_state: product.commercial.status,
}, null, 2));
