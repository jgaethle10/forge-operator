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
assert.match(product.commercial?.status || '', /direct_checkout_live/);
assert.match(product.commercial?.status || '', /buyer_route_live/);
assert.match(product.commercial?.status || '', /backend_checkout_verified/);
assert.equal(product.commercial?.machine_commerce_handoff?.state, 'live_verified');
assert.equal(product.commercial?.machine_commerce_handoff?.payment_created, false);
assert.equal(product.commercial?.machine_commerce_handoff?.payment_proof, false);
assert.equal(product.commercial?.offers?.[0]?.offer_key, 'ibmi_estate_xray_250');
assert.equal(product.origin_product_url, null, 'retired provider origin must not be emitted as current product origin');
assert.equal(product.human_start_url, null, 'held buyer frontage must not invent a public start URL');

const cat = catalog.products.find((row) => row.product_key === 'ibmi-rescue');
assert(cat, 'ibmi-rescue missing from registry catalog');
assert.equal(cat.mode, 'shared_mcp');
assert.equal(cat.mcp, null, 'retired shared provider URL must remain absent');
assert.equal(cat.registry_name, 'io.github.jgaethle10/evercraft-machine-commerce');
assert.equal(cat.machine_state, 'direct_checkout_ready');

const conf = conformance.products.find((row) => row.product_key === 'ibmi-rescue');
assert(conf, 'ibmi-rescue missing from conformance inventory');
assert.equal(conf.conformance_state, 'machine_commerce_direct_checkout_live_verified');
assert.equal(conf.machine_commerce_handoff_state, 'live_verified');
assert.equal(conf.provider_behavior_state, 'not_run');
assert.equal(conf.buyer_route_state, 'live_verified');
assert.equal(conf.backend_checkout_state, 'synthetic_live_verified');
assert.equal(conf.machine_commerce_tool, 'prepare_verified_checkout');
assert.equal(conf.machine_commerce_offer_tool, 'get_live_checkout_offer');
assert.equal(conf.machine_commerce_status_tool, 'get_verified_order_status');
assert.equal(conf.mcp_registry?.publication_state, 'published_shared_server');
assert.match(conf.live_canary_evidence || '', /^GitHubActionsRun:/);

const idx = publicIndex.products.find((row) => row.product_key === 'ibmi-rescue');
assert(idx, 'ibmi-rescue missing from public registry index');
assert.equal(idx.invocation?.mode, 'discovery_only');
assert.equal(idx.invocation?.url, null);
assert.equal(idx.registry_name, 'io.github.jgaethle10/evercraft-machine-commerce');

assert.equal(discovery.product_key, 'ibmi-rescue');
assert.equal(discovery.human_confirmation_required, true);
assert.equal(discovery.commercial?.offers?.length, 3);
assert.equal(discovery.mcp, null);
assert.equal(discovery.machine_commerce_mcp, null);
assert.equal(discovery.registry_name, 'io.github.jgaethle10/evercraft-machine-commerce');
assert.equal(discovery.buyer_frontage_url, null);
assert.equal(discovery.human_start_url, null);
assert.equal(aiConformance.mcp, null);
assert.equal(aiConformance.buyer_frontage_url, null);
assert.equal(aiConformance.human_start_url, null);
assert.equal(aiConformance.provider_behavior_state, 'not_inferred_from_publication');
assert.equal(aiConformance.machine_commerce_handoff_state, 'live_verified');

assert.doesNotMatch(llms, /base44\.app/i, 'IBM i product guidance must not advertise a retired provider origin');
assert.doesNotMatch(mirrorHtml, /base44\.app/i, 'IBM i product page must not advertise a retired provider origin');
assert.match(mirrorHtml, /Open public capability record/);
assert.match(mirrorHtml, /IBM i Estate X-Ray/);
assert.match(chumIndexHtml, /chum\/products\/ibmi-rescue/);
assert.match(llms, /Official MCP Registry:/);
assert.match(llms, /IBM i Estate X-Ray/);
assert.match(llms, /IBM i 7\.4 Deadline X-Ray/);
assert.match(llms, /\$250 one-time/);
assert.match(llms, /\$1,500 one-time/);
assert.match(llms, /human buyer route is externally reachable/i);
assert.match(llms, /synthetic QA verified creation of the \$250 Stripe Checkout session/i);
assert.match(llms, /Machine Commerce direct checkout is live-verified/i);
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
  provider_url_retired: true
}, null, 2));
