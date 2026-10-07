import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  buildInstantWorkCatalog,
  createEvercraftPaymentOrder,
} from '../systemia/commerce/instant-work.mjs';
import { getFulfillmentProfile } from '../systemia/organism/universal-product-fulfillment.mjs';
import { buildReceivablesPortfolio, deriveReceivableTruth } from '../systemia/commerce/receivables.mjs';
import { selectRavenSettlementRoute } from '../systemia/commerce/raven-settlement-router.mjs';
import { recommendReceivableFollowup } from '../systemia/commerce/receivable-followup.mjs';
import { buildRavenSettlementAdapters, createRavenSettlementGateway } from '../systemia/commerce/raven-settlement-gateway.mjs';

const liveCatalog = JSON.parse(fs.readFileSync('public/.well-known/evercraft-machine-catalog.json', 'utf8'));
const liveInstantWork = buildInstantWorkCatalog(liveCatalog);
assert.ok(liveInstantWork.length > 0);
assert.equal(liveInstantWork.some((row) => row.public_id === 'rivet-site-underwriting-v1'), false);
for (const offer of liveInstantWork) {
  assert.ok(getFulfillmentProfile(offer.public_id), `live sell-now offer missing fulfillment profile: ${offer.public_id}`);
}

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
for (const offer of catalog) {
  assert.ok(getFulfillmentProfile(offer.public_id), `missing fulfillment profile: ${offer.public_id}`);
}

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
assert.equal(order.fulfillment.coordinator, 'Systemia');
assert.equal(order.fulfillment.execution_fabric, 'Saban');
assert.equal(order.fulfillment.delivery, 'Evercraft Shipping');
assert.equal(order.fulfillment.completion_receipt_required, true);
assert.equal(order.amount_cents, 29900);
assert.match(order.continue_url, /^https:\/\/fabric\.systemiacommandcenters\.com\/api\/chum\/go\/aliev-site-opportunity-snapshot-v1\?/);
assert.match(order.continue_url, /offer_key=site_report_299/);
assert.match(order.continue_url, /order_id=epo_/);

console.log(JSON.stringify({
  ok: true,
  instant_work_offers: liveInstantWork.length,
  rivet_excluded: true,
  payment_authority: order.authority,
  settlement_router: order.settlement_router,
}));


const invoiceOrder = {
  order_key: 'RIVET-INVOICE-2026-1001-001',
  amount_cents: 209300,
  currency: 'usd',
  state: 'checkout_open',
  synthetic: false,
  checkout_created_at: '2026-10-02T02:50:00.000Z',
};

const openTruth = deriveReceivableTruth({
  order: invoiceOrder,
  receipts: [],
  now: new Date('2026-10-05T14:20:00-07:00'),
});
assert.equal(openTruth.authority, 'Evercraft Payments');
assert.equal(openTruth.settlement_router, 'Raven Nexus');
assert.equal(openTruth.canonical_paid, false);
assert.equal(openTruth.truth_state, 'stale_open');
assert.equal(openTruth.stale_open, true);
assert.equal(openTruth.semantics.checkout_is_not_payment, true);

const providerObservedTruth = deriveReceivableTruth({
  order: invoiceOrder,
  receipts: [],
  providerObservation: {
    provider: 'stripe',
    paid: true,
    session_id: 'cs_live_example',
    payment_status: 'paid',
  },
  now: new Date('2026-10-05T14:20:00-07:00'),
});
assert.equal(providerObservedTruth.truth_state, 'provider_paid_unreconciled');
assert.equal(providerObservedTruth.canonical_paid, false);
assert.equal(providerObservedTruth.reconciliation_required, true);

const verifiedReceipt = {
  receipt_key: 'stripe:cs_live_example',
  order_key: invoiceOrder.order_key,
  amount_cents: 209300,
  currency: 'usd',
  synthetic: false,
  verified_at: '2026-10-05T21:15:00.000Z',
  evidence_ref: 'stripe:cs_live_example',
};

const verifiedTruth = deriveReceivableTruth({
  order: { ...invoiceOrder, state: 'paid', verified_at: verifiedReceipt.verified_at },
  receipts: [verifiedReceipt],
  now: new Date('2026-10-05T14:20:00-07:00'),
});
assert.equal(verifiedTruth.truth_state, 'verified_paid');
assert.equal(verifiedTruth.canonical_paid, true);
assert.equal(verifiedTruth.canonical_receipt_key, verifiedReceipt.receipt_key);

const portfolio = buildReceivablesPortfolio({
  orders: [
    invoiceOrder,
    {
      order_key: 'epo_paid_example',
      amount_cents: 29900,
      currency: 'USD',
      state: 'paid',
      synthetic: false,
      created_at: '2026-10-05T10:00:00.000Z',
    },
  ],
  receipts: [
    {
      receipt_key: 'receipt_paid_example',
      order_key: 'epo_paid_example',
      amount_cents: 29900,
      currency: 'USD',
      synthetic: false,
      verified_at: '2026-10-05T10:05:00.000Z',
      evidence_ref: 'receipt_paid_example',
    },
  ],
  now: new Date('2026-10-05T14:20:00-07:00'),
});
const usd = portfolio.currencies.find((row) => row.currency === 'USD');
assert.equal(usd.open_cents, 209300);
assert.equal(usd.verified_paid_cents, 29900);
assert.equal(usd.open_count, 1);
assert.equal(usd.paid_count, 1);
assert.equal(usd.stale_count, 1);


const routed = selectRavenSettlementRoute({
  order: {
    order_key: 'epo_route_example',
    amount_cents: 209300,
    currency: 'USD',
    billing_mode: 'one_time',
  },
  adapters: [
    {
      adapter_key: 'card-primary',
      provider: 'provider-a',
      rail: 'card',
      enabled: true,
      health: 'healthy',
      currencies: ['USD'],
      billing_modes: ['one_time'],
      priority: 20,
      estimated_fee_bps: 290,
      estimated_fixed_fee_cents: 30,
      estimated_settlement_minutes: 2880,
    },
    {
      adapter_key: 'bank-primary',
      provider: 'provider-b',
      rail: 'ach',
      enabled: true,
      health: 'healthy',
      currencies: ['USD'],
      billing_modes: ['one_time'],
      priority: 10,
      estimated_fee_bps: 80,
      estimated_fixed_fee_cents: 0,
      estimated_settlement_minutes: 1440,
    },
    {
      adapter_key: 'unhealthy-cheap',
      provider: 'provider-c',
      rail: 'bank',
      enabled: true,
      health: 'degraded',
      currencies: ['USD'],
      billing_modes: ['one_time'],
      priority: 1,
      estimated_fee_bps: 0,
      estimated_fixed_fee_cents: 0,
      estimated_settlement_minutes: 1,
    },
  ],
});
assert.equal(routed.authority, 'Evercraft Payments');
assert.equal(routed.settlement_router, 'Raven Nexus');
assert.equal(routed.route_state, 'selected');
assert.equal(routed.selected_adapter.adapter_key, 'bank-primary');
assert.equal(routed.fallback_adapters[0].adapter_key, 'card-primary');
assert.equal(routed.doctrine.route_selection_is_not_payment_proof, true);

const blockedRoute = selectRavenSettlementRoute({
  order: {
    order_key: 'epo_no_route',
    amount_cents: 10000,
    currency: 'EUR',
    billing_mode: 'monthly',
  },
  adapters: [
    {
      adapter_key: 'usd-only',
      enabled: true,
      health: 'healthy',
      currencies: ['USD'],
      billing_modes: ['one_time'],
      priority: 1,
    },
  ],
});
assert.equal(blockedRoute.route_state, 'blocked_no_eligible_adapter');
assert.equal(blockedRoute.selected_adapter, null);


const freshFollowup = recommendReceivableFollowup({
  receivable: {
    order_key: 'epo_fresh',
    order_state: 'checkout_open',
    canonical_paid: false,
    customer_email: 'buyer@example.com',
    checkout_created_at: '2026-10-05T18:00:00.000Z',
  },
  now: new Date('2026-10-06T12:00:00.000Z'),
});
assert.equal(freshFollowup.action, 'none');
assert.equal(freshFollowup.eligible_to_send, false);

const gentleFollowup = recommendReceivableFollowup({
  receivable: {
    order_key: 'epo_gentle',
    order_state: 'checkout_open',
    canonical_paid: false,
    customer_email: 'buyer@example.com',
    checkout_created_at: '2026-10-04T06:00:00.000Z',
  },
  now: new Date('2026-10-06T12:00:00.000Z'),
});
assert.equal(gentleFollowup.action, 'gentle_reminder');
assert.equal(gentleFollowup.eligible_to_send, true);

const dedupedFollowup = recommendReceivableFollowup({
  receivable: {
    order_key: 'epo_gentle',
    order_state: 'checkout_open',
    canonical_paid: false,
    customer_email: 'buyer@example.com',
    checkout_created_at: '2026-10-04T06:00:00.000Z',
  },
  followupHistory: [{
    order_key: 'epo_gentle',
    action: 'gentle_reminder',
    status: 'sent',
    sent_at: '2026-10-05T18:00:00.000Z',
  }],
  now: new Date('2026-10-06T12:00:00.000Z'),
});
assert.equal(dedupedFollowup.reason, 'cadence_dedupe_hold');
assert.equal(dedupedFollowup.eligible_to_send, false);

const paidFollowup = recommendReceivableFollowup({
  receivable: {
    order_key: 'epo_paid',
    order_state: 'paid',
    canonical_paid: true,
    customer_email: 'buyer@example.com',
    checkout_created_at: '2026-10-01T06:00:00.000Z',
  },
  now: new Date('2026-10-06T12:00:00.000Z'),
});
assert.equal(paidFollowup.action, 'none');
assert.equal(paidFollowup.reason, 'verified_paid');
assert.equal(paidFollowup.eligible_to_send, false);

const escalationFollowup = recommendReceivableFollowup({
  receivable: {
    order_key: 'epo_week_old',
    order_state: 'checkout_open',
    canonical_paid: false,
    customer_email: 'buyer@example.com',
    checkout_created_at: '2026-09-28T06:00:00.000Z',
  },
  now: new Date('2026-10-06T12:00:00.000Z'),
});
assert.equal(escalationFollowup.action, 'escalation_review');
assert.equal(escalationFollowup.eligible_to_send, true);
assert.equal(escalationFollowup.send_requires.recheck_payment_immediately_before_send, true);


const gatewayExecutions = [];
const settlementGateway = createRavenSettlementGateway({
  adapters: [{
    adapter_key: 'fake-settlement',
    provider: 'fake-provider',
    rail: 'test',
    enabled: true,
    health: 'healthy',
    currencies: ['USD'],
    billing_modes: ['one_time'],
    priority: 1,
    estimated_fee_bps: 1,
    estimated_fixed_fee_cents: 0,
    estimated_settlement_minutes: 1,
    execute: async ({ order: routedOrder, operation, params }) => {
      gatewayExecutions.push({ routedOrder, operation, params });
      return {
        adapter_key: 'fake-settlement',
        provider: 'fake-provider',
        rail: 'test',
        operation,
        payload: {
          status: 'complete',
          payment_status: 'paid',
          id: params.session_id || 'fake-session',
        },
      };
    },
  }],
});

const ravenHealth = settlementGateway.health();
assert.equal(ravenHealth.authority, 'Raven Nexus');
assert.equal(ravenHealth.payment_authority, 'Evercraft Payments');
assert.equal(ravenHealth.doctrine.raven_executes_settlement_adapters, true);
assert.equal(ravenHealth.doctrine.evercraft_payments_owns_paid_state, true);

const gatewayObservation = await settlementGateway.execute({
  order: {
    order_key: 'RIVET-INVOICE-2026-1001-001',
    amount_cents: 209300,
    currency: 'USD',
    billing_mode: 'one_time',
  },
  operation: 'checkout_session.get',
  params: { session_id: 'cs_test_raven_boundary' },
});
assert.equal(gatewayObservation.authority, 'Raven Nexus');
assert.equal(gatewayObservation.payment_authority, 'Evercraft Payments');
assert.equal(gatewayObservation.adapter_key, 'fake-settlement');
assert.equal(gatewayObservation.canonical_paid, false);
assert.equal(gatewayObservation.receipt_created, false);
assert.equal(gatewayObservation.doctrine.observation_is_not_payment_proof, true);
assert.equal(gatewayObservation.doctrine.only_evercraft_payments_can_mint_receipt, true);
assert.equal(gatewayExecutions.length, 1);

await assert.rejects(
  () => createRavenSettlementGateway({
    adapters: [{
      adapter_key: 'disabled-adapter',
      provider: 'none',
      rail: 'none',
      enabled: false,
      health: 'unavailable',
      currencies: ['USD'],
      billing_modes: ['one_time'],
      execute: async () => ({}),
    }],
  }).execute({
    order: {
      order_key: 'epo_gateway_block',
      amount_cents: 10000,
      currency: 'USD',
      billing_mode: 'one_time',
    },
    operation: 'checkout_session.list',
  }),
  /no eligible settlement adapter/i
);


const canonicalRavenAdapters = buildRavenSettlementAdapters({
  env: { RAVEN_STRIPE_SECRET_KEY: 'test_raven_secret' },
  fetchImpl: async () => ({
    ok: true,
    json: async () => ({ id: 'fake' }),
  }),
});
assert.equal(canonicalRavenAdapters.length, 1);
assert.equal(canonicalRavenAdapters[0].adapter_key, 'evercraft-payments-central-v1');
assert.equal(canonicalRavenAdapters[0].route_key, 'evercraft-payments-central-v1');
assert.equal(canonicalRavenAdapters[0].provider, 'stripe');
assert.equal(canonicalRavenAdapters[0].health, 'healthy');
