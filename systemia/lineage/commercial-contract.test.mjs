import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFile(new URL('../../' + path, import.meta.url), 'utf8');

test('Lineage commercial package has one consistent founding-pilot offer', async () => {
  const offer = JSON.parse(await read('commercial/lineage-offer-2026-10-07.json'));
  const discovery = JSON.parse(await read('public/lineage/discovery.json'));
  const products = JSON.parse(await read('public/.well-known/evercraft-products.json'));
  const catalog = JSON.parse(await read('public/.well-known/evercraft-machine-catalog.json'));
  const page = await read('public/lineage/index.html');
  const llms = await read('public/lineage/llms.txt');

  assert.equal(offer.product_key, 'lineage');
  assert.equal(offer.pricing.founding_pilot_usd, 500);
  assert.equal(offer.pricing.founding_pilot_slots, 5);

  const discoveryOffer = discovery.commercial.offers.find(
    (row) => row.name === 'Lineage Founding Pilot'
  );
  assert.equal(discoveryOffer.price_usd, 500);
  assert.equal(discoveryOffer.availability, 'first_5_design_partners');

  const product = products.products.find((row) => row.product_key === 'lineage');
  assert(product);
  assert.equal(product.human_confirmation_required, true);
  assert.match(product.commercial.status, /human_handoff/);
  assert.match(product.commercial.status, /pending_external_canary/);
  assert.match(
    product.commercial.offers.find((row) => row.name === 'Lineage Founding Pilot').price,
    /\$500/
  );

  const machine = catalog.offers.find(
    (row) => row.public_id === 'lineage-founding-pilot-v1'
  );
  assert(machine);
  assert.equal(machine.commercial_state, 'verification_required');
  assert.equal(machine.machine_state, 'human_handoff_ready');
  assert.equal(machine.public_url, null);
  assert.equal(machine.public_url_source, 'held_pending_external_canary');
  assert.equal(machine.offers[0].price_usd, 500);

  assert.match(page, /\$500/);
  assert.match(page, /first 5 external design partners/);
  assert.match(page, /GitHub remains a supported interoperability mirror|GitHub available as a first-class mirror/);
  assert.match(llms, /Lineage Founding Pilot: \$500 USD one-time/);
});

test('Lineage public commercial package does not claim unverified self-serve deployment', async () => {
  const offer = JSON.parse(await read('commercial/lineage-offer-2026-10-07.json'));
  const discovery = JSON.parse(await read('public/lineage/discovery.json'));
  const machine = JSON.parse(await read('public/.well-known/evercraft-machine-catalog.json'))
    .offers.find((row) => row.public_id === 'lineage-founding-pilot-v1');
  const page = await read('public/lineage/index.html');

  assert.equal(
    offer.commercial_state.multi_tenant_hosted_saas,
    'not_claimed'
  );
  assert.equal(discovery.handoff.automatic_repository_access_allowed, false);
  assert.equal(discovery.handoff.automatic_payment_allowed, false);
  assert.equal(machine.live_canary_evidence, null);
  assert.match(machine.invocation_status, /Promotion to sell_now is held until .*externally canaried/);
  assert.match(machine.invocation_status, /Do not claim automatic repository intake/);
  assert.match(machine.invocation_status, /checkout or payment/);
  assert.match(page, /self-serve checkout remain verification-gated/);
});

test('Lineage sales demo is explicitly synthetic and demonstrates stale-writer preservation', async () => {
  const demo = JSON.parse(await read('public/lineage/demo.json'));
  assert.equal(demo.synthetic, true);
  assert.equal(demo.customer_data, false);
  assert.ok(demo.timeline.some((row) => row.ref_update === 'LINEAGE_STALE_REF'));
  assert.ok(
    demo.timeline.some(
      (row) => row.event === 'losing_work_preserved' && row.reachable_from_branch === false
    )
  );
});
