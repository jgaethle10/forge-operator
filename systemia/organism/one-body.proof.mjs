#!/usr/bin/env node
import assert from 'node:assert/strict';
import { emptyBodyState, ingestBodyEvent, loadProductRegistry, routeBodyEvent } from './one-body.mjs';

const registry = loadProductRegistry();
const now = '2026-09-29T18:30:00Z';

const lancaster = routeBodyEvent({
  product: 'RIVET',
  source: 'rivet-data-sweep',
  signal_key: 'lancaster-auction-mart-ev-hub',
  title: 'Lancaster Auction Mart solar canopy EV hub procurement and planning signal',
  summary: 'Council procurement sought a supplier for an EV hub, solar canopy and battery storage. Planning was later approved and construction is expected.',
  signal_type: 'ev_infrastructure_procurement',
  procurement: {
    status: 'closed',
    deadline: '2026-02-12T12:00:00Z',
    authority: 'Lancaster City Council',
    tender_id: 'auction-mart-ev-hub',
    estimated_value: 'source-stated value preserved by adapter'
  },
  target_buyers: ['Lancaster City Council'],
  recommended_actions: ['identify awardee and remaining delivery scope'],
  evidence_state: 'authoritative',
  confidence: 'verified',
  detected_at: now,
}, { registry, now });

assert.equal(lancaster.product.product_key, 'aliev');
assert.equal(lancaster.commercial.state, 'missed_primary_tender');
assert.ok(lancaster.lanes.includes('revenue_circulation'));
assert.ok(lancaster.lanes.includes('organism_goal_runtime'));
assert.ok(lancaster.next_motion.includes('identify_awardee_subcontractors_and_secondary_scope_then_capture_lessons'));
assert.equal(lancaster.dead_end, false);

const normalReceipt = routeBodyEvent({
  product: 'Evercraft Network',
  source: 'runtime-health',
  kind: 'health_check',
  status: 'healthy',
  summary: 'Network control plane healthy',
  evidence_state: 'live_verified',
  created_at: now,
}, { registry, now });

assert.equal(normalReceipt.signal.severity, 'receipt');
assert.equal(normalReceipt.commercial.state, 'not_commercial');
assert.ok(normalReceipt.lanes.includes('signal_fabric'));

const dataOnly = routeBodyEvent({
  product: 'RIVET',
  source: 'rivet-data-sweep',
  signal_type: 'data_coverage_expansion',
  title: 'California charger data coverage expansion',
  target_buyers: ['EV charging developers', 'RIVET Pro users'],
  commercial_value_estimate: 'High product value, but no specific buyer intent observed.',
  evidence_state: 'authoritative',
  created_at: now,
}, { registry, now });

assert.equal(dataOnly.commercial.state, 'not_commercial');
assert.equal(dataOnly.commercial.opportunity_key, null);

const paymentGate = routeBodyEvent({
  product: 'Evercraft Clip',
  source: 'payments',
  kind: 'payment_blocked',
  action_kind: 'payment',
  status: 'blocked',
  summary: 'Customer payment requires human attention',
  human_action_required: true,
  external_action_requested: true,
  evidence_state: 'live_verified',
  created_at: now,
}, { registry, now });

assert.equal(paymentGate.gates.human_required, true);
assert.equal(paymentGate.signal.severity, 'critical');
assert.ok(paymentGate.next_motion.includes('hold_consequential_external_action_until_authorized'));

const unknown = routeBodyEvent({
  source: 'research',
  title: 'A new internal experiment with no existing product match',
  summary: 'Useful evidence that should never vanish just because product routing is unresolved.',
  work_required: true,
  created_at: now,
}, { registry, now });

assert.equal(unknown.product.product_key, 'unknown');
assert.ok(unknown.lanes.includes('portfolio_sentinel'));
assert.ok(unknown.lanes.includes('organism_goal_runtime'));
assert.equal(unknown.dead_end, false);

let state = emptyBodyState();
let first = ingestBodyEvent(state, {
  product: 'RIVET',
  source: 'rivet-data-sweep',
  id: 'same-source-event',
  title: 'Open RFP for EV charging site intelligence',
  procurement: { status: 'open', deadline: '2026-10-30T17:00:00Z', buyer: 'Example Buyer' },
  evidence_state: 'authoritative',
  created_at: now,
}, { registry, now });
state = first.state;
let second = ingestBodyEvent(state, {
  product: 'RIVET',
  source: 'rivet-data-sweep',
  id: 'same-source-event',
  title: 'Open RFP for EV charging site intelligence',
  procurement: { status: 'open', deadline: '2026-10-30T17:00:00Z', buyer: 'Example Buyer' },
  evidence_state: 'authoritative',
  created_at: now,
}, { registry, now });

assert.equal(first.decision.commercial.state, 'live_procurement');
assert.equal(second.decision.duplicate, true);
assert.equal(Object.keys(second.state.opportunities).length, 1);
assert.equal(second.state.products.aliev.commercial_opportunity_count, 1);

console.log(JSON.stringify({
  ok: true,
  schema: 'evercraft.one-body.proof.v1',
  checks: [
    'RIVET procurement becomes commercial opportunity',
    'closed tender becomes secondary recovery motion rather than dead end',
    'routine receipt stays quiet',
    'data-only value does not become a fake buyer opportunity',
    'consequential action preserves human gate',
    'unknown product routes to portfolio sentinel',
    'duplicate event does not duplicate opportunity'
  ]
}, null, 2));
