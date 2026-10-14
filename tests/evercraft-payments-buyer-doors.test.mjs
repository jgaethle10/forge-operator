import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('../public/.well-known/evercraft-payments-buyer-doors.json', import.meta.url), 'utf8'));
const ownedBuyerHost = 'findmypart.base44.app';
const approved = new Map([
  ['website-audit', 4900], ['workflow-xray', 25000],
  ['browser-diagnosis', 14900], ['payments-pilot', 75000],
  ['part-quick', 1900], ['part-deep', 4900],
  ['part-rescue', 9900], ['legacy-xray', 25000],
  ['ibmi-xray', 25000], ['site-survive', 25000],
  ['sign-pilot', 25000], ['towi-evidence', 75000],
  ['event-boost', 4900],
]);

test('only the thirteen observed, scoped offers enter the public buy directory', () => {
  assert.equal(catalog.schema, 'evercraft.payments.public-buyer-doors.v1');
  assert.equal(catalog.canonical_payment_authority, 'Evercraft Payments');
  assert.equal(catalog.provider_boundary, 'Raven Nexus');
  assert.equal(catalog.no_outreach_without_systemia_gate, true);
  assert.equal(catalog.offers.length, approved.size);
  assert.equal(new Set(catalog.offers.map(x => x.slug)).size, approved.size);
  assert.equal(new Set(catalog.offers.map(x => x.offer_key)).size, approved.size);
  assert.match(catalog.merchant_truth, /not receipts/i);
  assert.equal(catalog.revenue_verified_usd, null);
  for (const offer of catalog.offers) {
    assert.equal(approved.get(offer.slug), offer.amount_cents, 'Unexpected price or slug: ' + offer.slug);
    assert.equal(offer.currency, 'usd');
    assert.equal(offer.fulfillment_contract_state, 'ready_at_observation');
    assert.equal(offer.buyer_form_state, 'synthetic_post_redirect_verified');
    assert.equal(offer.provider_page_state, 'live_mode_https_200_at_observation');
    assert.equal(offer.payment_receipt_state, 'not_observed');
    assert.ok(offer.offer_key && offer.title && offer.intent);
    const url = new URL(offer.buyer_url);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, ownedBuyerHost);
    assert.equal(url.pathname, '/functions/evercraftBuy');
    assert.equal(url.searchParams.get('offer'), offer.slug);
    assert.equal([...url.searchParams.keys()].length, 1);
    assert.ok(!/aliev|rivet|roasted/i.test(offer.offer_key));
  }
});

test('no direct Stripe sessions, credentials or unapproved product sales are published', () => {
  const serialized = JSON.stringify(catalog);
  for (const forbidden of ['cs_live_', 'sk_live_', 'buy.stripe.com', 'checkout.stripe.com/c/pay/', 'Bearer ']) {
    assert.equal(serialized.includes(forbidden), false, 'Forbidden merchant artifact leaked: ' + forbidden);
  }
  for (const requiredHold of ['AliEV / RIVET', 'ROASTED', 'Black Box license']) {
    assert.ok(catalog.excluded.some(x => x.product === requiredHold));
  }
  assert.equal(catalog.native_specialist_doors.length, 3);
  for (const entry of catalog.native_specialist_doors) {
    const url = new URL(entry.url);
    assert.equal(url.protocol, 'https:');
    assert.ok(entry.checkout_state !== 'paid_verified');
  }
});
