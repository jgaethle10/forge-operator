import assert from 'node:assert/strict';
import test from 'node:test';
import { CLIENT_SCOUT_OFFERS, qualifyClientSignal, rankClientSignals } from './client-qualifier.mjs';
const now = new Date('2026-11-15T20:00:00Z');

test('maps distinct offers without pretending readiness equals payment', () => {
  const result = qualifyClientSignal({
    prospect_key: 'synthetic-a', business: 'Synthetic A',
    source_kind: 'client_request', evidence_refs: ['synthetic:ask-1'],
    observed_at: '2026-11-14T12:00:00Z',
    need_tags: ['audience_research'], reply_confirmed: true,
    scope_requested: true, budget_confirmed: true,
    delivery_capacity_confirmed: true, decision_maker_confirmed: true,
  }, now);
  assert.equal(result.disposition, 'scoping_priority');
  assert.equal(result.matched_offers[0].key, 'social_intelligence_launch');
  assert.equal(result.matched_offers[0].price_usd, 1000);
  assert.equal(result.buyer_confirmed, false);
  assert.equal(result.paid_order_confirmed, false);
  assert.equal(result.outreach_preflight.can_send_from_this_module, false);
  assert.equal(result.outreach_preflight.state, 'proof_required');
});

test('public hiring signals never become buyers or contact permission', () => {
  const result = qualifyClientSignal({
    prospect_key: 'synthetic-b', business: 'Synthetic B',
    source_kind: 'public_hiring', evidence_refs: ['https://example.com/job'],
    observed_at: '2026-11-14T00:00:00Z',
    need_tags: ['monthly_reporting'], decision_maker_confirmed: false,
    public_proof_verified: true,
  }, now);
  assert.equal(result.disposition, 'research_only');
  assert.equal(result.reason, 'public_clue_not_buyer_permission');
  assert.equal(result.matched_offers[0].sale_state, 'private_pilot_interest');
  assert.equal(result.contact_permission_inferred, false);
  assert.equal(result.outreach_preflight.state, 'awaiting_human_approval');
});

test('safety holds override high commercial fit', () => {
  const candidate = {
    prospect_key: 'synthetic-c', business: 'Synthetic C',
    source_kind: 'client_request', evidence_refs: ['synthetic:ask-3'],
    need_tags: ['website_diagnosis'], reply_confirmed: true,
    scope_requested: true, budget_confirmed: true,
    delivery_capacity_confirmed: true, public_proof_verified: true,
  };
  assert.equal(qualifyClientSignal({...candidate, opted_out: true}, now).disposition, 'do_not_contact');
  assert.equal(qualifyClientSignal({...candidate, unanswered_outbound: 2}, now).disposition, 'waiting_reply');
  assert.equal(qualifyClientSignal({...candidate, unfulfilled_commitment: true}, now).disposition, 'fulfill_prior_commitment');
  assert.equal(qualifyClientSignal({...candidate, opted_out: true}, now).outreach_preflight.state, 'blocked');
});

test('missing proof cannot be patched by a high score or approval flag', () => {
  const result = qualifyClientSignal({
    prospect_key: 'synthetic-d', business: 'Synthetic D',
    source_kind: 'client_reply', reply_confirmed: true,
    need_tags: ['site_resilience'], budget_confirmed: true,
    delivery_capacity_confirmed: true, scope_requested: true,
    human_approval_state: 'explicit', human_approval_ref: 'synthetic:approval',
    public_proof_verified: true,
  }, now);
  assert.equal(result.disposition, 'research_only');
  assert.equal(result.outreach_preflight.state, 'research_required');
});

test('ranks actionable relationships first and deduplicates prospect keys', () => {
  const rows = rankClientSignals([
    { prospect_key: 'x', business: 'X', source_kind: 'public_hiring',
      evidence_refs: ['synthetic:job'], need_tags: ['monthly_reporting'] },
    { prospect_key: 'y', business: 'Y', source_kind: 'client_request',
      evidence_refs: ['synthetic:buyer'], need_tags: ['video_commercial'],
      scope_requested: true, budget_confirmed: true,
      reply_confirmed: true, delivery_capacity_confirmed: true },
    { prospect_key: 'y', business: 'Y duplicate', source_kind: 'client_request',
      evidence_refs: ['synthetic:duplicate'] },
  ], now);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].prospect_key, 'y');
  assert.equal(rows[0].matched_offers[0].key, 'commercial_studio');
  assert.equal(CLIENT_SCOUT_OFFERS.length, 6);
});

test('Quick Win Audit maps an owner-described website problem without claiming a live checkout', () => {
  const result = qualifyClientSignal({
    prospect_key: 'synthetic-website-inbound',
    business: 'Synthetic Website Inbound',
    source_kind: 'client_request',
    evidence_refs: ['synthetic:website-ask'],
    observed_at: '2026-11-15T12:00:00Z',
    need_tags: ['website_conversion'],
    reply_confirmed: true, scope_requested: true,
    budget_confirmed: true, delivery_capacity_confirmed: true,
  }, now);
  assert.equal(result.disposition, 'scoping_priority');
  assert.equal(result.matched_offers[0].key, 'systemia_quick_win_audit');
  assert.equal(result.matched_offers[0].price_usd, 49);
  assert.equal(result.matched_offers[0].public_proof_url, null);
  assert.match(result.matched_offers[0].required_gate, /verify_live_offer_checkout_settlement/);
  assert.equal(result.paid_order_confirmed, false);
  assert.equal(result.outreach_preflight.state, 'proof_required');
  assert.equal(result.outreach_preflight.can_send_from_this_module, false);
});

test('public business profile with a website is research-only, not buying intent or contact permission', () => {
  const result = qualifyClientSignal({
    prospect_key: 'synthetic-public-profile',
    business: 'Synthetic Public Business',
    source_kind: 'public_service_description',
    evidence_refs: ['https://example.com/synthetic-public-business'],
    observed_at: '2026-11-15T12:00:00Z',
    need_tags: ['website_conversion'],
    public_proof_verified: false,
  }, now);
  assert.equal(result.disposition, 'research_only');
  assert.equal(result.reason, 'public_clue_not_buyer_permission');
  assert.equal(result.contact_permission_inferred, false);
  assert.equal(result.outreach_preflight.state, 'proof_required');
});
