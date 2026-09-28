import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildMoneyRadar } from '../systemia/chum/money-radar.mjs';

function trusted(overrides = {}) {
  return {
    schema: 'evercraft.chum.attribution-event.v1',
    event_id: 'evt-1',
    referral_id: 'ref-1',
    product_key: 'forensiscope',
    public_id: 'forensiscope-v1',
    stage: 'payment_verified',
    occurred_at: '2026-09-26T04:00:00.000Z',
    revenue: {
      verified: true,
      authority: 'stripe',
      verification_ref: 'pi_123',
      amount_cents: 29900,
      currency: 'USD',
    },
    ...overrides,
  };
}

function publicEvent(stage, id = stage) {
  return {
    schema: 'evercraft.chum.attribution-event.v1',
    event_id: id,
    referral_id: null,
    product_key: 'findmypart-paid-hunt-v1',
    public_id: 'findmypart-paid-hunt-v1',
    stage,
    occurred_at: '2026-09-26T05:00:00.000Z',
    actor_class: 'human_probable',
    actor_confidence: 'high',
    provider_claim: 'direct',
    campaign: 'buyer-frontage',
    surface: 'chum_capability_page',
    session_key: 'buyer_test_session_1',
    telemetry_version: 'money-radar-v2',
    revenue: { verified: false, amount_cents: 0, currency: null },
  };
}

test('Money Radar counts only authoritative verified payments', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'money-radar-'));
  const events = [
    { ...trusted({ event_id: 'landing', stage: 'landing', revenue: { verified: false, amount_cents: 0, currency: null } }) },
    { ...trusted({ event_id: 'checkout', stage: 'checkout_started', revenue: { verified: false, amount_cents: 0, currency: null } }) },
    trusted(),
  ];

  const { receipt, revenueEvents } = await buildMoneyRadar({
    root,
    sourceEvents: events,
    publicSourceUrl: '',
  });

  assert.equal(receipt.measurement_state, 'measured_payment_only');
  assert.equal(receipt.payment_measurement_state, 'measured');
  assert.equal(receipt.totals.unique_verified_payments, 1);
  assert.equal(revenueEvents.length, 1);
  assert.equal(revenueEvents[0].provider_verified, true);
  assert.equal(revenueEvents[0].amount_cents, 29900);
  assert.equal(receipt.products[0].funnel_state, 'paid');
});

test('Money Radar measures acquisition stages separately from payment authority', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'money-radar-'));
  const { receipt, revenueEvents } = await buildMoneyRadar({
    root,
    sourceUrl: '',
    sourceToken: '',
    publicSourceUrl: '',
    publicSourceEvents: [
      publicEvent('landing', 'landing-1'),
      publicEvent('offer_view', 'view-1'),
      publicEvent('continue_clicked', 'continue-1'),
      publicEvent('checkout_started', 'checkout-1'),
    ],
  });

  assert.equal(receipt.measurement_state, 'measured_acquisition_only');
  assert.equal(receipt.acquisition_measurement_state, 'measured');
  assert.equal(receipt.payment_measurement_state, 'blocked_trusted_source_not_configured');
  assert.equal(receipt.totals.landings, 1);
  assert.equal(receipt.totals.offer_views, 1);
  assert.equal(receipt.totals.continue_clicks, 1);
  assert.equal(receipt.totals.checkout_starts, 1);
  assert.equal(receipt.products[0].funnel_state, 'checkout_started_no_verified_payment');
  assert.equal(revenueEvents.length, 0);
});

test('Money Radar rejects payment claims from the public acquisition source', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'money-radar-'));
  const fakePayment = {
    ...trusted({
      event_id: 'public-payment-fake',
      public_id: 'findmypart-paid-hunt-v1',
      product_key: 'findmypart-paid-hunt-v1'
    })
  };

  const { receipt, revenueEvents } = await buildMoneyRadar({
    root,
    sourceUrl: '',
    sourceToken: '',
    publicSourceUrl: '',
    publicSourceEvents: [fakePayment],
  });

  assert.equal(receipt.totals.rejected_events, 1);
  assert.equal(receipt.rejected[0].reason, 'public_source_cannot_assert_trusted_stage');
  assert.equal(revenueEvents.length, 0);
});

test('Money Radar differentiates offer-view and continue-click dropoff', async () => {
  const rootA = fs.mkdtempSync(path.join(os.tmpdir(), 'money-radar-'));
  const a = await buildMoneyRadar({
    root: rootA,
    sourceUrl: '',
    publicSourceUrl: '',
    publicSourceEvents: [publicEvent('offer_view', 'view-only')],
  });
  assert.equal(a.receipt.products[0].funnel_state, 'offer_view_no_continue');

  const rootB = fs.mkdtempSync(path.join(os.tmpdir(), 'money-radar-'));
  const b = await buildMoneyRadar({
    root: rootB,
    sourceUrl: '',
    publicSourceUrl: '',
    publicSourceEvents: [
      publicEvent('offer_view', 'view-two'),
      publicEvent('continue_clicked', 'continue-two'),
    ],
  });
  assert.equal(b.receipt.products[0].funnel_state, 'continue_clicked_no_checkout');
});

test('Money Radar deduplicates the same provider verification reference', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'money-radar-'));
  const { receipt, revenueEvents } = await buildMoneyRadar({
    root,
    sourceEvents: [
      trusted({ event_id: 'evt-1' }),
      trusted({ event_id: 'evt-2' }),
    ],
    publicSourceUrl: '',
  });

  assert.equal(revenueEvents.length, 1);
  assert.equal(receipt.products[0].verified_payments, 1);
  assert.equal(receipt.products[0].verified_revenue_by_currency.USD, 29900);
});

test('Money Radar rejects fake or incomplete trusted payment evidence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'money-radar-'));
  const { receipt, revenueEvents } = await buildMoneyRadar({
    root,
    sourceEvents: [
      trusted({ event_id: 'bad-1', revenue: { verified: false, authority: 'stripe', verification_ref: 'pi_fake', amount_cents: 100, currency: 'USD' } }),
      trusted({ event_id: 'bad-2', revenue: { verified: true, authority: '', verification_ref: '', amount_cents: 100, currency: 'USD' } }),
    ],
    publicSourceUrl: '',
  });

  assert.equal(revenueEvents.length, 0);
  assert.equal(receipt.totals.rejected_events, 2);
});

test('Money Radar reports both lanes blocked when no acquisition or payment source exists', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'money-radar-'));
  const { receipt } = await buildMoneyRadar({
    root,
    sourceUrl: '',
    sourceToken: '',
    publicSourceUrl: '',
  });
  assert.equal(receipt.measurement_state, 'blocked_sources_unavailable');
  assert.equal(receipt.acquisition_measurement_state, 'blocked_source_not_configured');
  assert.equal(receipt.payment_measurement_state, 'blocked_trusted_source_not_configured');
});

test('Money Radar blocks an unauthenticated trusted payment receipt source', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'money-radar-'));
  const { receipt } = await buildMoneyRadar({
    root,
    sourceUrl: 'https://payments.example.test/export',
    sourceToken: '',
    publicSourceUrl: '',
  });

  assert.equal(receipt.payment_measurement_state, 'blocked_source_auth_missing');
  assert.equal(receipt.source.payment.fetched, false);
});

test('payment export uses GitHub OIDC in authorized CHUM workflows', () => {
  for (const file of [
    '.github/workflows/chum-watershed.yml',
    '.github/workflows/chum-llm-hunter.yml',
  ]) {
    const workflow = fs.readFileSync(file, 'utf8');
    assert.match(workflow, /id-token:\s*write/, file);
    assert.match(workflow, /evercraft-chum-payment-export/, file);
    assert.match(workflow, /ACTIONS_ID_TOKEN_REQUEST_URL/, file);
    assert.match(workflow, /ACTIONS_ID_TOKEN_REQUEST_TOKEN/, file);
    assert.match(workflow, /machineCommercePaymentExport/, file);
    assert.doesNotMatch(
      workflow,
      /CHUM_ATTRIBUTION_EXPORT_TOKEN:\s*\$\{\{\s*secrets\./,
      file + ' should use short-lived OIDC instead of a long-lived payment-export secret'
    );
  }
});


test('Money Radar keeps machine crawler synthetic and legacy views out of buyer demand', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'money-radar-'));
  const human = publicEvent('offer_view', 'human-view');
  const crawler = { ...publicEvent('offer_view', 'crawler-view'), actor_class: 'crawler', provider_claim: 'gptbot', session_key: '' };
  const machine = { ...publicEvent('offer_view', 'machine-view'), actor_class: 'machine_client', provider_claim: 'chum', session_key: '' };
  const synthetic = { ...publicEvent('offer_view', 'synthetic-view'), actor_class: 'synthetic', is_synthetic: true, session_key: '' };
  const legacy = { ...publicEvent('offer_view', 'legacy-view'), actor_class: undefined, actor_confidence: undefined, session_key: '', telemetry_version: 'legacy', provider_claim: 'direct' };

  const { receipt } = await buildMoneyRadar({
    root,
    sourceUrl: '',
    publicSourceUrl: '',
    publicSourceEvents: [human, crawler, machine, synthetic, legacy],
  });

  assert.equal(receipt.totals.raw_offer_views, 5);
  assert.equal(receipt.totals.offer_views, 1);
  assert.equal(receipt.totals.unique_buyer_sessions, 1);
  assert.equal(receipt.totals.actor_class_counts.crawler, 1);
  assert.equal(receipt.totals.actor_class_counts.machine_client, 1);
  assert.equal(receipt.totals.actor_class_counts.synthetic, 1);
  assert.equal(receipt.totals.actor_class_counts.unknown, 1);
  assert.equal(receipt.products[0].raw_offer_views, 5);
  assert.equal(receipt.products[0].offer_views, 1);
});

test('Money Radar counts buyer sessions once across repeated funnel events', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'money-radar-'));
  const { receipt } = await buildMoneyRadar({
    root,
    sourceUrl: '',
    publicSourceUrl: '',
    publicSourceEvents: [
      publicEvent('landing', 'session-landing'),
      publicEvent('offer_view', 'session-view'),
      publicEvent('continue_clicked', 'session-click'),
    ],
  });

  assert.equal(receipt.totals.unique_buyer_sessions, 1);
  assert.equal(receipt.products[0].unique_buyer_sessions, 1);
  assert.equal(receipt.totals.view_to_continue_rate, 1);
  assert.equal(receipt.buyer_signal_state, 'continue_without_checkout');
  assert.equal(receipt.windows['30d'].unique_buyer_sessions, 1);
  assert.equal(receipt.windows['30d'].view_to_continue_rate, 1);
  assert.equal(receipt.action_queue[0].action, 'inspect_buyer_handoff_and_checkout_friction');
});


test('Money Radar preserves aggregate first-touch last-touch campaign and surface lineage', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'money-radar-'));
  const { receipt } = await buildMoneyRadar({
    root,
    generatedAt: '2026-09-28T12:00:00.000Z',
    sourceUrl: '',
    publicSourceUrl: '',
    publicSourceEvents: [
      {
        ...publicEvent('landing', 'journey-landing'),
        occurred_at: '2026-09-28T10:00:00.000Z',
        provider_claim: 'chatgpt',
        campaign: 'llm-discovery',
        surface: 'answer-door',
        experiment_key: 'offer-headline',
        variant_key: 'b',
      },
      {
        ...publicEvent('offer_view', 'journey-view'),
        occurred_at: '2026-09-28T10:01:00.000Z',
        provider_claim: 'chatgpt',
        campaign: 'llm-discovery',
        surface: 'evercraft_buyer_frontage',
        experiment_key: 'offer-headline',
        variant_key: 'b',
      },
      {
        ...publicEvent('continue_clicked', 'journey-click'),
        occurred_at: '2026-09-28T10:02:00.000Z',
        provider_claim: 'direct',
        campaign: 'buyer-frontage',
        surface: 'evercraft_buyer_frontage',
        experiment_key: 'offer-headline',
        variant_key: 'b',
      },
    ],
  });

  assert.equal(receipt.journey_attribution.sessions_with_lineage, 1);
  assert.deepEqual(receipt.journey_attribution.first_touch_source[0], { source: 'chatgpt', sessions: 1 });
  assert.deepEqual(receipt.journey_attribution.last_touch_source[0], { source: 'direct', sessions: 1 });
  assert.equal(receipt.journey_attribution.source_paths[0].path, 'chatgpt → direct');
  assert.equal(receipt.journey_attribution.source_paths[0].reached_continue, 1);
  assert.equal(receipt.campaign_breakdown.find((row) => row.campaign === 'llm-discovery').unique_buyer_sessions, 1);
  assert.equal(receipt.surface_breakdown.find((row) => row.surface === 'answer-door').unique_buyer_sessions, 1);
  assert.equal(receipt.experiment_breakdown.find((row) => row.experiment_variant === 'offer-headline::b').unique_buyer_sessions, 1);
});


test('Money Radar arms and fires the first-qualified-buyer tripwire without claiming payment', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'money-radar-'));
  const event = {
    ...publicEvent('offer_view', 'first-qualified-view'),
    occurred_at: '2026-09-28T11:30:00.000Z',
    provider_claim: 'chatgpt',
    campaign: 'answer-door',
    surface: 'chum_answer_door',
  };

  const { receipt } = await buildMoneyRadar({
    root,
    generatedAt: '2026-09-28T12:00:00.000Z',
    sourceUrl: '',
    publicSourceUrl: '',
    publicSourceEvents: [event],
  });

  assert.equal(receipt.buyer_milestones.first_buyer_tripwire_armed, false);
  assert.equal(receipt.buyer_milestones.first_qualified_event_at, '2026-09-28T11:30:00.000Z');
  assert.equal(receipt.totals.unique_verified_payments, 0);
  assert.ok(receipt.operator_alerts.some((alert) => alert.code === 'first_qualified_buyer_activity'));
  assert.ok(receipt.operator_alerts.some((alert) => alert.code === 'qualified_offer_view_zero_continue'));
});
