import assert from 'node:assert/strict';
import fs from 'node:fs';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const directory = readJson('public/.well-known/evercraft-products.json');
const catalog = readJson('registry/catalog.json');
const discovery = readJson('public/chum/products/legacy-rescue-lab/ai-discovery.json');
const aiConformance = readJson('public/chum/products/legacy-rescue-lab/ai-conformance.json');
const offer = readJson('registry/legacy-rescue-lab/offer-contract.json');
const llms = fs.readFileSync('public/chum/products/legacy-rescue-lab/llms.txt', 'utf8');
const sitemap = fs.readFileSync('public/sitemap.xml', 'utf8');
const publicIndex = readJson('public/chum/index.json');
const rootLlms = fs.readFileSync('llms.txt', 'utf8');
const painIndex = readJson('public/.well-known/evercraft-pain-index.json');
const conformanceRegistry = readJson('conformance/products.json');

const product = directory.products.find((row) => row.product_key === 'legacy-rescue-lab');
assert(product, 'legacy-rescue-lab missing from product directory');
assert.equal(product.human_confirmation_required, true);
assert.equal(product.commercial?.offers?.[0]?.price, '$299 one-time');
assert.match(product.commercial?.status || '', /direct_checkout_unverified/);
assert.match(product.intents.join(' '), /checkout is broken/i);
assert.match(product.intents.join(' '), /developer disappeared/i);
assert.match(product.intents.join(' '), /AI agency built/i);
assert.equal(product.commercial?.machine_commerce_handoff?.state, 'live_verified');
assert.equal(product.commercial?.machine_commerce_handoff?.public_id, 'legacy-rescue-lab-v1');
assert.equal(product.commercial?.machine_commerce_handoff?.tool, 'prepare_legacy_rescue_scan_handoff');
assert.equal(product.commercial?.machine_commerce_handoff?.request_tool, 'submit_legacy_rescue_scan_request');
assert.match(product.commercial?.machine_commerce_handoff?.buyer_url || '', /machineCommerceGateway\?view=service&public_id=legacy-rescue-lab-v1/);
assert.doesNotMatch(product.commercial?.machine_commerce_handoff?.buyer_url || '', /\/buy\/legacy-rescue-lab-v1/);

const cat = catalog.products.find((row) => row.product_key === 'legacy-rescue-lab');
assert(cat, 'legacy-rescue-lab missing from registry catalog');
assert.equal(cat.mode, 'shared_mcp');
assert.equal(cat.registry_name, 'io.github.jgaethle10/evercraft-machine-commerce');
assert.match(cat.mcp || '', /machineCommerceMcp$/);
assert.equal(cat.machine_state, 'human_handoff_ready');

assert.equal(discovery.product_key, 'legacy-rescue-lab');
assert.equal(discovery.human_confirmation_required, true);
assert.equal(discovery.commercial?.offers?.[0]?.offer_key, 'legacy_rescue_scan_299');
assert.equal(discovery.registry_name, 'io.github.jgaethle10/evercraft-machine-commerce');
assert.match(discovery.mcp || '', /machineCommerceMcp$/);
assert.equal(aiConformance.provider_behavior_state, 'not_inferred_from_publication');

const registeredConformance = conformanceRegistry.products.find((row) => row.product_key === 'legacy-rescue-lab');
assert(registeredConformance, 'Legacy Rescue Lab missing from conformance registry');
assert.equal(registeredConformance.machine_commerce_handoff_state, 'live_verified');
assert.equal(registeredConformance.machine_commerce_public_id, 'legacy-rescue-lab-v1');
assert.equal(registeredConformance.machine_commerce_tool, 'prepare_legacy_rescue_scan_handoff');
assert.equal(registeredConformance.machine_commerce_request_tool, 'submit_legacy_rescue_scan_request');
assert.equal(registeredConformance.offer_state?.direct_checkout, 'unverified_not_advertised');

assert.equal(offer.price_usd, 299);
assert.equal(offer.production_change_included, false);
assert.equal(offer.private_access_requires_explicit_authorization, true);
assert.match(llms, /Legacy Rescue Scan/);
assert.match(llms, /\$299 one-time/);
assert.match(llms, /my checkout is broken and customers cannot buy/i);
assert.match(llms, /developer disappeared/i);
assert.match(llms, /direct public checkout is not represented as live/i);
assert.match(rootLlms, /Legacy Rescue Lab/i);
const painEntry = painIndex.entries.find((row) => row.capability_id === 'product:legacy-rescue-lab');
assert(painEntry, 'Legacy Rescue Lab missing from CHUM pain index');
assert.match(painEntry.pain_phrases.join(' '), /repair instead of rebuild/i);
assert.equal(painEntry.machine_state, 'specialist_mcp_declared');

console.log(JSON.stringify({
  ok:true,
  product_key:product.product_key,
  offer_key:offer.offer_key,
  price_usd:offer.price_usd,
  mode:cat.mode
}, null, 2));
