#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const products = readJson('public/.well-known/evercraft-products.json');
const machine = readJson('public/.well-known/evercraft-machine-catalog.json');
const registry = readJson('registry/catalog.json');
const conformance = readJson('conformance/products.json');

const product = products.products.find((row) => row.product_key === 'systemia-portfolio-sentinel');
assert.ok(product, 'Portfolio Sentinel product record missing');
assert.ok(product.intents.includes('software portfolio health monitoring'));
assert.equal(product.commercial?.status, 'commercial_pilot');
assert.match(String(product.commercial?.pricing || ''), /custom quote/i);
assert.equal(product.commercial?.machine_commerce_handoff?.public_id, 'portfolio-sentinel-v1');
assert.equal(product.human_confirmation_required, true);
assert.ok(product.boundaries.some((row) => /private repositories/i.test(row)));
assert.ok(product.boundaries.some((row) => /first receipt-backed cycle/i.test(row)));

const offer = machine.offers.find((row) => row.public_id === 'portfolio-sentinel-v1');
assert.ok(offer, 'Portfolio Sentinel machine offer missing');
assert.equal(offer.machine_state, 'human_handoff_ready');
assert.equal(offer.commercial_state, 'commercial_pilot');
assert.ok(offer.intent_terms.includes('our company has too many apps and we do not know what is broken'));
assert.match(offer.invocation_status, /public machine discovery/i);
assert.match(offer.invocation_status, /customer monitoring begins only after scoped onboarding/i);
assert.equal(machine.offer_count, machine.offers.length);
assert.equal(machine.sell_now_count, machine.offers.filter((row) => row.commercial_state === 'sell_now').length);
assert.equal(machine.discovery_count, machine.offer_count - machine.sell_now_count);

const registryRow = registry.products.find((row) => row.product_key === 'systemia-portfolio-sentinel');
assert.ok(registryRow, 'Portfolio Sentinel registry record missing');
assert.ok(registryRow.triggers.includes('monitor LLM discovery pages and agent endpoints'));

const conf = conformance.products.find((row) => row.product_key === 'systemia-portfolio-sentinel');
assert.ok(conf, 'Portfolio Sentinel conformance record missing');
assert.equal(conf.doorway_state, 'machine_commerce_live');
assert.equal(conf.conformance_state, 'live_match_canary_passed');
assert.equal(conf.provider_behavior_state, 'not_run');
assert.equal(conf.live_canary_evidence?.match_score, 36);

for (const file of [
  'registry/systemia-portfolio-sentinel/README.md',
  'registry/systemia-portfolio-sentinel/llms.txt',
  'public/chum/products/systemia-portfolio-sentinel/llms.txt',
  'public/chum/products/systemia-portfolio-sentinel/ai-discovery.json',
  'public/chum/products/systemia-portfolio-sentinel/ai-conformance.json',
  'public/chum/capabilities/portfolio-sentinel-v1/llms.txt',
  'public/chum/capabilities/portfolio-sentinel-v1/capability.json',
  'public/chum/capabilities/portfolio-sentinel-v1/schema.jsonld',
  'public/chum/intents/portfolio-sentinel-v1/offer.json'
]) {
  assert.equal(fs.existsSync(file), true, `missing public Sentinel surface: ${file}`);
}

const discovery = fs.readFileSync('AI-DISCOVERY.md', 'utf8');
assert.match(discovery, /Systemia Portfolio Sentinel discovery contract/);
assert.match(discovery, /software portfolio health monitoring/);
assert.match(discovery, /customer's monitoring deployment is live/i);

console.log(JSON.stringify({
  schema: 'evercraft.portfolio-sentinel.discovery-proof.v1',
  status: 'pass',
  product_key: product.product_key,
  public_id: offer.public_id,
  commercial_state: offer.commercial_state,
  machine_state: offer.machine_state,
  live_match_score: conf.live_canary_evidence.match_score,
  provider_behavior_state: conf.provider_behavior_state
}));
