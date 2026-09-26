import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildFireControl } from '../systemia/chum/fire-control.mjs';

function fixture() {
  return {
    catalog: {
      offers: [
        {
          public_id: 'forensiscope-v1',
          name: 'ForensiScope',
          public_url: 'https://forensiscope.example/docs',
          commercial_state: 'sell_now',
          machine_state: 'payment_ready'
        },
        {
          public_id: 'rivet-v1',
          name: 'RIVET',
          public_url: 'https://rivet.example/docs',
          commercial_state: 'sell_now',
          machine_state: 'payment_ready'
        }
      ]
    },
    probeSuite: {
      cases: [
        { case_id: 'media', enabled: true, expected_fit: true, product_key: 'forensiscope', expected_product: 'ForensiScope', expected_hosts: ['forensiscope.example'] },
        { case_id: 'ev', enabled: true, expected_fit: true, product_key: 'rivet', expected_product: 'RIVET', expected_hosts: ['rivet.example'] }
      ]
    },
    radar: {
      schema: 'evercraft.chum.crawler-radar.v1',
      surfaces: [
        { product_key: 'forensiscope', path: '/forensiscope/', indexnow_pending: false, last_observed_crawler_fetch: '2026-09-25T20:00:00.000Z' },
        { product_key: 'rivet', path: '/chum/products/rivet/', indexnow_pending: false, last_observed_crawler_fetch: '2026-09-25T20:00:00.000Z' }
      ]
    },
    providerProbes: {
      schema: 'evercraft.chum.cross-llm-run-receipt.v1',
      bridge_configured: true,
      results: [
        { product_key: 'forensiscope', status: 'completed', evaluation: { pickup_observed: true } },
        { product_key: 'rivet', status: 'completed', evaluation: { pickup_observed: false } }
      ]
    },
    commerceCanary: {
      schema: 'evercraft.chum.commerce-canary.v1',
      results: [
        { public_id: 'forensiscope-v1', valid: true },
        { public_id: 'rivet-v1', valid: true }
      ]
    },
    moneyRadar: {
      schema: 'evercraft.chum.money-radar.v1',
      measurement_state: 'measured',
      acquisition_measurement_state: 'measured',
      payment_measurement_state: 'measured',
      products: [
        { public_id: 'forensiscope-v1', product_key: 'forensiscope', landings: 2, checkout_starts: 1, verified_payments: 1, funnel_state: 'paid' },
        { public_id: 'rivet-v1', product_key: 'rivet', landings: 0, checkout_starts: 0, verified_payments: 0, funnel_state: 'no_attributed_traffic' }
      ]
    },
    revenueEvents: [
      { schema: 'evercraft.revenue-event.v1', public_id: 'forensiscope-v1', stage: 'paid', provider_verified: true, amount: 299 }
    ]
  };
}

test('Fire Control closes the funnel only with provider-verified payment', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chum-fire-control-'));
  const data = fixture();
  const receipt = buildFireControl({ root, generatedAt: '2026-09-25T21:00:00.000Z', ...data });

  assert.equal(receipt.schema, 'evercraft.chum.fire-control.v1');
  assert.equal(receipt.funnel.sell_now.total, 2);
  assert.equal(receipt.funnel.sell_now.crawler_observed, 2);
  assert.equal(receipt.funnel.sell_now.provider_pickup, 1);
  assert.equal(receipt.funnel.sell_now.money_path_readable, 2);
  assert.equal(receipt.funnel.sell_now.provider_verified_payment, 1);

  const forensiscope = receipt.offers.find((row) => row.public_id === 'forensiscope-v1');
  assert.equal(forensiscope.first_broken_stage, null);
  assert.deepEqual(forensiscope.evidence.provider_verified_revenue_by_currency, { UNKNOWN: 299 });

  const rivet = receipt.offers.find((row) => row.public_id === 'rivet-v1');
  assert.equal(rivet.first_broken_stage, 'provider_pickup');
  assert.equal(rivet.next_action.action, 'repair_answer_doors_schema_crosslinks_and_registry_presence_then_reprobe');
});

test('Fire Control makes a missing provider bridge a P0 instead of faking pickup', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chum-fire-control-'));
  const data = fixture();
  data.providerProbes = {
    schema: 'evercraft.chum.cross-llm-run-receipt.v1',
    bridge_configured: false,
    results: [
      { product_key: 'forensiscope', status: 'blocked', blocked_reason: 'authorized_probe_bridge_not_configured' }
    ]
  };
  data.revenueEvents = [];

  const receipt = buildFireControl({ root, ...data });
  const row = receipt.offers.find((offer) => offer.public_id === 'forensiscope-v1');

  assert.equal(row.stages.provider_pickup, false);
  assert.equal(row.first_broken_stage, 'provider_pickup');
  assert.equal(row.next_action.priority, 'P0');
  assert.equal(row.next_action.action, 'restore_authorized_provider_probe_bridge_then_run_brand_blind_probe');
});

test('Fire Control fails forward to crawl attention when no crawler fetch is observed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chum-fire-control-'));
  const data = fixture();
  data.radar.surfaces[0].last_observed_crawler_fetch = null;

  const receipt = buildFireControl({ root, ...data });
  const row = receipt.offers.find((offer) => offer.public_id === 'forensiscope-v1');

  assert.equal(row.first_broken_stage, 'crawler_observed');
  assert.equal(row.next_action.action, 'promote_surface_in_hot_queue_and_measure_crawler_fetch');
});


test('Fire Control treats an unmeasured product as probe work, not a broken bridge', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chum-fire-control-'));
  const data = fixture();
  data.providerProbes = {
    schema: 'evercraft.chum.cross-llm-run-receipt.v1',
    bridge_configured: true,
    results: [
      { product_key: 'forensiscope', status: 'completed', evaluation: { pickup_observed: true } }
    ]
  };
  data.revenueEvents = [];

  const receipt = buildFireControl({ root, ...data });
  const rivet = receipt.offers.find((offer) => offer.public_id === 'rivet-v1');

  assert.equal(rivet.evidence.provider_probe_state, 'unmeasured');
  assert.equal(rivet.first_broken_stage, 'provider_pickup');
  assert.equal(rivet.next_action.priority, 'P1');
  assert.equal(rivet.next_action.action, 'schedule_brand_blind_probe_for_unmeasured_product');
});

test('Fire Control distinguishes a configured but blocked provider lane', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chum-fire-control-'));
  const data = fixture();
  data.providerProbes = {
    schema: 'evercraft.chum.cross-llm-run-receipt.v1',
    bridge_configured: true,
    results: [
      { product_key: 'rivet', status: 'blocked', blocked_reason: 'provider_temporarily_unavailable' }
    ]
  };
  data.revenueEvents = [];

  const receipt = buildFireControl({ root, ...data });
  const rivet = receipt.offers.find((offer) => offer.public_id === 'rivet-v1');

  assert.equal(rivet.evidence.provider_probe_state, 'blocked');
  assert.equal(rivet.next_action.priority, 'P0');
  assert.equal(rivet.next_action.action, 'resolve_provider_probe_block_then_reprobe');
});


test('Fire Control makes a missing authoritative payment feed a P0 after discovery and commerce are healthy', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chum-fire-control-'));
  const data = fixture();
  data.providerProbes.results = [
    { product_key: 'forensiscope', status: 'completed', evaluation: { pickup_observed: true } },
    { product_key: 'rivet', status: 'completed', evaluation: { pickup_observed: true } }
  ];
  data.moneyRadar = {
    schema: 'evercraft.chum.money-radar.v1',
    measurement_state: 'measured_acquisition_only',
    acquisition_measurement_state: 'measured',
    payment_measurement_state: 'blocked_trusted_source_not_configured',
    products: []
  };
  data.revenueEvents = [];

  const receipt = buildFireControl({ root, ...data });
  const row = receipt.offers.find((offer) => offer.public_id === 'rivet-v1');

  assert.equal(row.first_broken_stage, 'payment_measurement_ready');
  assert.equal(row.next_action.priority, 'P0');
  assert.equal(row.next_action.action, 'connect_authoritative_payment_receipt_feed_without_treating_acquisition_as_revenue');
});

test('Fire Control routes checkout dropoff to Money Radar without claiming a payment failure cause', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chum-fire-control-'));
  const data = fixture();
  data.providerProbes.results = [
    { product_key: 'forensiscope', status: 'completed', evaluation: { pickup_observed: true } },
    { product_key: 'rivet', status: 'completed', evaluation: { pickup_observed: true } }
  ];
  data.moneyRadar.products = [
    { public_id: 'forensiscope-v1', product_key: 'forensiscope', landings: 2, checkout_starts: 1, verified_payments: 1, funnel_state: 'paid' },
    { public_id: 'rivet-v1', product_key: 'rivet', landings: 4, checkout_starts: 2, verified_payments: 0, funnel_state: 'checkout_started_no_verified_payment' }
  ];
  data.revenueEvents = data.revenueEvents.filter((event) => event.public_id !== 'rivet-v1');

  const receipt = buildFireControl({ root, ...data });
  const row = receipt.offers.find((offer) => offer.public_id === 'rivet-v1');

  assert.equal(row.first_broken_stage, 'provider_verified_payment');
  assert.equal(row.next_action.priority, 'P1');
  assert.equal(row.next_action.action, 'inspect_checkout_to_payment_dropoff_with_authoritative_receipts');
});


test('Fire Control identifies offer-view dropoff without calling it a payment failure', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chum-fire-control-'));
  const data = fixture();
  data.providerProbes.results = [
    { product_key: 'forensiscope', status: 'completed', evaluation: { pickup_observed: true } },
    { product_key: 'rivet', status: 'completed', evaluation: { pickup_observed: true } }
  ];
  data.moneyRadar.products = [
    { public_id: 'forensiscope-v1', product_key: 'forensiscope', landings: 2, offer_views: 2, continue_clicks: 2, checkout_starts: 1, verified_payments: 1, funnel_state: 'paid' },
    { public_id: 'rivet-v1', product_key: 'rivet', landings: 3, offer_views: 3, continue_clicks: 0, checkout_starts: 0, verified_payments: 0, funnel_state: 'offer_view_no_continue' }
  ];
  data.revenueEvents = data.revenueEvents.filter((event) => event.public_id !== 'rivet-v1');

  const receipt = buildFireControl({ root, ...data });
  const row = receipt.offers.find((offer) => offer.public_id === 'rivet-v1');

  assert.equal(row.first_broken_stage, 'provider_verified_payment');
  assert.equal(row.next_action.action, 'repair_offer_trust_value_or_primary_cta');
  assert.equal(row.evidence.attributed_offer_views, 3);
  assert.equal(row.evidence.attributed_continue_clicks, 0);
});
