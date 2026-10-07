import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDistributionLoopPortfolio,
  classifyCommercialEvidence,
  classifyDiscoveryLane,
} from '../systemia/commerce/distribution-loop.mjs';

test('anonymous Raven checkout is quarantined instead of becoming a receivable', () => {
  const result = classifyCommercialEvidence({
    order: {
      order_key: 'RAVEN-WEBSITE-AUDIT-QUICK-WIN-example',
      source_ref: 'raven-nexus-purchase-intent',
      product_key: 'systemia-website-audit',
      amount_cents: 4900,
      currency: 'usd',
      state: 'checkout_open',
      synthetic: false,
    },
    context: {},
  });

  assert.equal(result.signal_class, 'machine_checkout_noise');
  assert.equal(result.status, 'quarantined');
  assert.equal(result.canonical_paid, false);
});

test('customer-selected check rail is explicit intent but remains unpaid after instructions are sent', () => {
  const result = classifyCommercialEvidence({
    order: {
      order_key: 'INVOICE-EXAMPLE-001',
      source_ref: 'invoice:EXAMPLE-001',
      product_key: 'example.invoice',
      amount_cents: 209300,
      currency: 'usd',
      state: 'checkout_open',
      synthetic: false,
      business_name: 'Example Hospitality LLC',
    },
    offlineSettlement: {
      rail: 'check',
      state: 'instructions_sent',
      requested_by_customer: true,
    },
  });

  assert.equal(result.signal_class, 'receivable');
  assert.equal(result.stage, 'explicit_intent');
  assert.equal(result.human_intent_state, 'explicit');
  assert.equal(result.canonical_paid, false);
  assert.match(result.next_action, /Do not send another card-checkout chase/);
});

test('canonical receipt, not checkout state, crosses the payment boundary', () => {
  const result = classifyCommercialEvidence({
    order: {
      order_key: 'ORDER-PAID-001',
      source_ref: 'invoice:ORDER-PAID-001',
      product_key: 'example.invoice',
      amount_cents: 209300,
      currency: 'usd',
      state: 'paid',
      business_name: 'Example LLC',
    },
    receipt: {
      receipt_key: 'receipt:ORDER-PAID-001',
      verified_at: '2026-10-07T20:00:00Z',
    },
  });

  assert.equal(result.signal_class, 'canonical_paid');
  assert.equal(result.stage, 'paid');
  assert.equal(result.canonical_paid, true);
});

test('machine discovery is not promoted to human demand', () => {
  const discovery = classifyDiscoveryLane({ discoveryCount: 50, qualificationCount: 0 });
  assert.equal(discovery.signal_class, 'machine_discovery');
  assert.equal(discovery.human_intent_state, 'unknown');

  const qualified = classifyDiscoveryLane({ discoveryCount: 50, qualificationCount: 1 });
  assert.equal(qualified.signal_class, 'qualified_demand');
  assert.equal(qualified.stage, 'qualified');
});

test('portfolio excludes quarantined checkout noise from commercial open value', () => {
  const rows = [
    classifyCommercialEvidence({
      order: {
        order_key: 'INVOICE-EXAMPLE-001',
        source_ref: 'invoice:EXAMPLE-001',
        product_key: 'example.invoice',
        amount_cents: 209300,
        currency: 'usd',
        state: 'checkout_open',
        business_name: 'Example LLC',
      },
      offlineSettlement: {
        rail: 'check',
        state: 'instructions_sent',
        requested_by_customer: true,
      },
    }),
    classifyCommercialEvidence({
      order: {
        order_key: 'RAVEN-CANARY-001',
        source_ref: 'raven-nexus-purchase-intent',
        product_key: 'systemia-website-audit',
        amount_cents: 4900,
        currency: 'usd',
        state: 'checkout_open',
      },
    }),
  ];

  const portfolio = buildDistributionLoopPortfolio(rows);
  assert.equal(portfolio.commercial_open_count, 1);
  assert.equal(portfolio.commercial_open_amount_cents, 209300);
  assert.equal(portfolio.quarantined_count, 1);
});
