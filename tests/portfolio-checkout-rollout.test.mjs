import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildPortfolioCheckoutMatrix,
  buildPortfolioCheckoutMatrixFromRepository,
} from '../systemia/commerce/portfolio-checkout-rollout.mjs';
import { PUBLIC_PAYMENT_OFFERS } from '../systemia/mcp/public-payment-offers.mjs';

const read = p => JSON.parse(fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const source = () => ({
  buyer: read('public/.well-known/evercraft-payments-buyer-doors.json'),
  crosswalk: read('systemia/commerce/portfolio-human-buyer-handoffs-next.json'),
  catalog: read('public/chum/capabilities.json'),
});

test('the existing 13 priced buyer doors use one unchanged payment authority, not 13 checkout implementations', () => {
  const result = buildPortfolioCheckoutMatrixFromRepository();
  assert.equal(result.direct_offer_pages_source_wired, 13);
  assert.equal(result.exact_agent_capability_count, 5);
  assert.equal(result.exact_agent_buyer_routes, 7);
  assert.equal(result.approved_buyer_routes_needing_product_specific_agent_mapping, 6);
  assert.deepEqual(result.unmapped_offer_slugs.sort(), [
    'browser-diagnosis', 'ibmi-xray', 'legacy-xray', 'payments-pilot', 'sign-pilot', 'towi-evidence',
  ].sort());
  const slugs = result.routes.map(x => x.offer_slug);
  assert.equal(new Set(slugs).size, 13);
  assert.ok(result.routes.every(x =>
    x.approved_human_buyer_url === 'https://findmypart.base44.app/functions/evercraftBuy?offer=' + x.offer_slug &&
    x.native_fabric_offer_url === 'https://fabric.systemiacommandcenters.com/offers/' + x.offer_slug &&
    !x.payment_verified && !x.fulfillment_verified && !x.payout_verified));
  assert.equal(result.ready_for_publication, false);
  assert.equal(result.starts_transaction, false);
  assert.equal(result.changes_payment_authority, false);
});

test('each additional Native Fabric offer is the exact same approved SKU and price', () => {
  const result = buildPortfolioCheckoutMatrixFromRepository();
  for (const [slug, contract] of Object.entries(PUBLIC_PAYMENT_OFFERS)) {
    const row = result.routes.find(x => x.offer_slug === slug);
    assert.equal(row.offer_key, contract.offer_key, slug);
    assert.equal(row.price_cents, contract.amount_cents, slug);
    assert.equal(row.currency, 'usd');
  }
});

test('no catalog offer gets a buyer link by fuzzy name, matching dollar amount or brand alone', () => {
  const r = buildPortfolioCheckoutMatrixFromRepository();
  const known = new Set([
    'audit-center-website-audit-machine-v1', 'findmypart-paid-hunt-v1',
    'eventwave-paid-promotion-v1', 'site-survive-rapid-audit-v1',
    'workflow-foundry-xray-v1',
  ]);
  for (const x of r.routes) {
    if (!x.mapped_agent_capability) continue;
    assert.ok(known.has(x.mapped_agent_capability));
  }
  assert.equal(r.routes.find(x => x.offer_slug === 'ibmi-xray').mapped_agent_capability, null);
  assert.equal(r.routes.find(x => x.offer_slug === 'legacy-xray').mapped_agent_capability, null);
});

test('tampered price, amount, host, receipt, crosswalk and unknown SKU fail closed', () => {
  const mutations = [
    v => { v.buyer.offers[0].amount_cents += 100; },
    v => { v.buyer.offers[0].buyer_url = 'https://evil.example/checkout'; },
    v => { v.buyer.offers[0].payment_receipt_state = 'paid'; },
    v => { v.buyer.offers[0].offer_key = 'unapproved-sku'; },
    v => { v.buyer.offers.push({ ...v.buyer.offers[0], slug: 'another-offer' }); },
    v => { v.buyer.revenue_verified_usd = 12; },
    v => { v.crosswalk.capabilities.push({ ...v.crosswalk.capabilities[0] }); },
    v => { v.crosswalk.capabilities[0].primary_offer_slug = 'part-rescue'; },
    v => { v.catalog.capabilities.find(x => x.public_id === 'workflow-foundry-xray-v1').entry_paid_offer.price_usd_normalized = 251; },
  ];
  for (const [i, mutator] of mutations.entries()) {
    const v = source();
    mutator(v);
    assert.throws(() => buildPortfolioCheckoutMatrix(v), /portfolio_payment_rollout_/, 'mutation ' + i);
  }
});

test('merely opening provider checkout never changes the receipt or entitlement state', () => {
  const r = buildPortfolioCheckoutMatrixFromRepository();
  assert.equal(r.workflow_verified_through, 'provider_checkout_page_reached_in_prior_observation');
  assert.ok(r.verification_missing.includes('provider_paid_receipt'));
  assert.ok(r.verification_missing.includes('shipping_and_recipient_access'));
  assert.ok(r.routes.every(x => x.checkout_boundary === 'human_confirmation_then_evercraft_payments'));
});
