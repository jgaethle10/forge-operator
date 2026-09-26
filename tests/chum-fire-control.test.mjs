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
  assert.equal(forensiscope.evidence.provider_verified_revenue_amount, 299);

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
