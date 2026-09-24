import assert from 'node:assert/strict';
import fs from 'node:fs';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const machine = readJson('public/.well-known/evercraft-machine-catalog.json');
const offers = readJson('public/chum/offers/index.json');
const intents = readJson('public/chum/intents.json');
const products = readJson('public/.well-known/evercraft-products.json');
const chumIndex = readJson('public/chum/index.json');

assert.ok(Array.isArray(machine.offers) && machine.offers.length > 0, 'canonical machine catalog must contain offers');
assert.equal(offers.offer_count, machine.offers.length, 'all-offer mirror count must equal canonical machine catalog');
assert.equal(chumIndex.offers.length, machine.offers.length, 'CHUM central index must include every public offer');

const expectedIntentCount = machine.offers.reduce(
  (sum, offer) => sum + (Array.isArray(offer.intent_terms) ? offer.intent_terms.length : 0),
  0
);
assert.equal(intents.intent_count, expectedIntentCount, 'static intent map must preserve every declared intent phrase');

const mirrorById = new Map(offers.offers.map((offer) => [offer.public_id, offer]));
for (const source of machine.offers) {
  const mirror = mirrorById.get(source.public_id);
  assert.ok(mirror, `missing offer mirror: ${source.public_id}`);
  assert.equal(mirror.name, source.name, `name drift: ${source.public_id}`);
  assert.equal(mirror.commercial_state, String(source.commercial_state || ''), `commercial-state drift: ${source.public_id}`);
  assert.equal(mirror.machine_state, String(source.machine_state || ''), `machine-state drift: ${source.public_id}`);
  assert.equal(mirror.pricing, String(source.pricing || ''), `pricing drift: ${source.public_id}`);
  assert.equal(mirror.public_url, String(source.public_url || ''), `public URL drift: ${source.public_id}`);

  const offerJson = readJson(`public/chum/offers/${source.public_id}/ai-offer.json`);
  assert.equal(offerJson.commercial_state, mirror.commercial_state);
  assert.equal(offerJson.machine_state, mirror.machine_state);
  assert.equal(offerJson.pricing, mirror.pricing);
  assert.equal(offerJson.safety.discovery_creates_payment_obligation, false);
  assert.equal(offerJson.safety.checkout_is_payment_proof, false);
  assert.equal(offerJson.safety.authoritative_payment_verification_required, true);
  assert.equal(offerJson.safety.private_topology_exposed, false);
}

const dayTrade = products.products.find((product) => product.product_key === 'daytrade-lens');
assert.ok(dayTrade, 'DayTrade Lens must be in public product directory');
assert.equal(dayTrade.commercial?.pricing, '$19/month');
assert.equal(dayTrade.commercial?.status, 'source_ready_origin_unresolved');
assert.ok(dayTrade.boundaries.some((item) => /no guaranteed returns/i.test(item)));
assert.ok(dayTrade.boundaries.some((item) => /no autonomous live trading/i.test(item)));

const eps = products.products.find((product) => product.product_key === 'evercraft-property-services');
assert.ok(eps, 'Evercraft Property Services must be in public product directory');
assert.equal(eps.commercial?.status, 'human_quote_intake');
assert.match(eps.commercial?.payment_state || '', /No payment required/i);
assert.ok(eps.boundaries.some((item) => /does not create a contract or payment obligation/i.test(item)));

assert.ok(fs.existsSync('AI-CAPABILITY-CATALOG.md'), 'GitHub-native capability catalog must exist');
assert.ok(fs.existsSync('public/chum/offers/index.html'), 'crawlable all-offer index must exist');

console.log(JSON.stringify({
  status: 'PASS',
  products: products.products.length,
  offers: offers.offer_count,
  sell_now: offers.sell_now_count,
  intents: intents.intent_count,
  state_escalation: false,
  payment_truth_preserved: true,
  daytrade_boundary: 'PASS',
  eps_boundary: 'PASS',
}, null, 2));
