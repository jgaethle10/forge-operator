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
const rootLlms = fs.readFileSync('llms.txt', 'utf8');
const painIndex = readJson('public/.well-known/evercraft-pain-index.json');

const product = directory.products.find((row) => row.product_key === 'legacy-rescue-lab');
assert(product, 'legacy-rescue-lab missing from product directory');
assert.equal(product.human_confirmation_required, true);
assert.equal(product.commercial?.offers?.[0]?.price, '$299 one-time');
assert.match(product.commercial?.status || '', /direct_checkout_unverified/);
assert.match(product.intents.join(' '), /checkout is broken/i);
assert.match(product.intents.join(' '), /developer disappeared/i);
assert.match(product.intents.join(' '), /AI agency built/i);

const cat = catalog.products.find((row) => row.product_key === 'legacy-rescue-lab');
assert(cat, 'legacy-rescue-lab missing from registry catalog');
assert.equal(cat.mode, 'discovery_only');
assert(!cat.mcp, 'Legacy Rescue Lab must not claim a dedicated MCP before verification');

assert.equal(discovery.product_key, 'legacy-rescue-lab');
assert.equal(discovery.human_confirmation_required, true);
assert.equal(discovery.commercial?.offers?.[0]?.offer_key, 'legacy_rescue_scan_299');
assert.equal(discovery.mcp, null);
assert.equal(aiConformance.provider_behavior_state, 'not_inferred_from_publication');

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
assert.equal(painEntry.machine_state, 'discovery_only');

console.log(JSON.stringify({
  ok:true,
  product_key:product.product_key,
  offer_key:offer.offer_key,
  price_usd:offer.price_usd,
  mode:cat.mode
}, null, 2));
