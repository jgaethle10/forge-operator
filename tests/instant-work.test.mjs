import assert from 'node:assert/strict';
import {
  buildInstantWorkCatalog,
  createEvercraftPaymentOrder,
} from '../systemia/commerce/instant-work.mjs';

const fixture = {
  offers: [
    {
      public_id: 'aliev-site-opportunity-snapshot-v1',
      name: 'AliEV EV Site Opportunity Intelligence',
      problem: 'Screen a property for EV charging opportunity.',
      pricing: '$299 preliminary; $750 full.',
      commercial_state: 'sell_now',
      machine_state: 'payment_ready_human_confirmation',
      payment_authority: 'Evercraft Payments',
      confirmation: 'Explicit human confirmation required.',
      offers: [
        { offer_key: 'site_report_750', name: 'Full Site Report', price: '$750', billing: 'one_time' },
        { offer_key: 'site_report_299', name: 'Preliminary Site Report', price: '$299', billing: 'one_time' },
      ],
    },
    {
      public_id: 'rivet-site-underwriting-v1',
      name: 'RIVET',
      problem: 'Jointly owned product.',
      pricing: '$1',
      commercial_state: 'sell_now',
      machine_state: 'payment_ready',
      offers: [{ offer_key: 'x', name: 'x', price: '$1', billing: 'one_time' }],
    },
    {
      public_id: 'findmypart-paid-hunt-v1',
      name: 'FindMyPart Paid Part Hunt',
      problem: 'Find a difficult part.',
      pricing: '$19 / $49 / $99',
      commercial_state: 'sell_now',
      machine_state: 'payment_ready',
      offers: [
        { name: 'Quick Hunt', price_usd: 19, billing: 'one_time' },
        { name: 'Deep Hunt', price_usd: 49, billing: 'one_time' },
      ],
    },
  ],
};

const catalog = buildInstantWorkCatalog(fixture);
assert.equal(catalog.some((row) => row.public_id === 'rivet-site-underwriting-v1'), false);
assert.equal(catalog.some((row) => row.public_id === 'aliev-site-opportunity-snapshot-v1'), true);
assert.equal(catalog[0].public_id, 'findmypart-paid-hunt-v1');
assert.equal(catalog[0].entry_offer.price_usd, 19);

const aliev = catalog.find((row) => row.public_id === 'aliev-site-opportunity-snapshot-v1');
assert.equal(aliev.entry_offer.offer_key, 'site_report_299');

assert.throws(
  () => createEvercraftPaymentOrder({
    offer: aliev,
    offerKey: 'site_report_299',
    confirmed: false,
    origin: 'https://fabric.systemiacommandcenters.com',
  }),
  /Explicit human confirmation/
);

const order = createEvercraftPaymentOrder({
  offer: aliev,
  offerKey: 'site_report_299',
  confirmed: true,
  origin: 'https://fabric.systemiacommandcenters.com',
});

assert.match(order.order_id, /^epo_[a-f0-9]{32}$/);
assert.equal(order.authority, 'Evercraft Payments');
assert.equal(order.settlement_router, 'Raven Nexus');
assert.equal(order.settlement_adapter, 'selected_downstream');
assert.equal(order.payment_state, 'not_verified');
assert.equal(order.amount_cents, 29900);
assert.match(order.continue_url, /^https:\/\/fabric\.systemiacommandcenters\.com\/api\/chum\/go\/aliev-site-opportunity-snapshot-v1\?/);
assert.match(order.continue_url, /offer_key=site_report_299/);
assert.match(order.continue_url, /order_id=epo_/);

console.log(JSON.stringify({
  ok: true,
  instant_work_offers: catalog.length,
  rivet_excluded: true,
  payment_authority: order.authority,
  settlement_router: order.settlement_router,
}));
