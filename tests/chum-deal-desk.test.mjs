import assert from 'node:assert/strict';
import { issueDealAuthorityToken, negotiateDeal } from '../systemia/chum/deal-desk.mjs';

const catalog = {
  offers: [{
    public_id: 'website-audit-v1',
    product_key: 'systemia-website-audit',
    name: 'Systemia Website Audit',
    problem: 'A business has traffic but weak conversion.',
    intent_terms: ['website gets visitors but no calls', 'website conversion audit'],
    commercial_state: 'sell_now',
    machine_state: 'payment_ready_human_confirmation',
    public_url: 'https://example.com/audit',
    pricing: 'Published packages from $100 to $300.',
    offers: [
      { name: 'Focused Audit', price: '$100' },
      { name: 'Full Audit', price: '$300' }
    ]
  }]
};

const directory = {
  products: [{
    product_key: 'systemia-website-audit',
    name: 'Systemia Website Audit',
    canonical_url: 'https://example.com/audit',
    intents: ['website gets visitors but no calls']
  }]
};

const painIndex = {
  entries: [{
    capability_id: 'offer:website-audit-v1',
    public_id: 'website-audit-v1',
    product_key: 'systemia-website-audit',
    name: 'Systemia Website Audit',
    pain_phrases: ['website gets visitors but no calls'],
    commercial_state: 'sell_now',
    machine_state: 'payment_ready_human_confirmation',
    canonical_url: 'https://example.com/audit',
    pricing: 'Published packages from $100 to $300.',
    offers: [
      { name: 'Focused Audit', price: '$100' },
      { name: 'Full Audit', price: '$300' }
    ]
  }]
};

const base = {
  catalog,
  directory,
  painIndex,
  request: {
    intent: 'Our website gets visitors but no phone calls. We want the full audit.',
    public_id: 'website-audit-v1',
    offer_name: 'Full Audit',
    requested_price_cents: 5000,
    provider: 'buyer-agent',
    surface: 'agent_to_agent'
  }
};

const withoutAuthority = negotiateDeal(base);
assert.equal(withoutAuthority.matched, true);
assert.equal(withoutAuthority.binding, false);
assert.equal(withoutAuthority.state, 'published_terms_counter');
assert.equal(withoutAuthority.counterproposal.price.cents, 30000);
assert.equal(withoutAuthority.counterproposal.human_exception_required, true);
assert.equal(withoutAuthority.next_step.payment_created, false);
assert.equal(withoutAuthority.external_delivery_performed, false);

const secret = 'unit-test-authority-secret';
const token = issueDealAuthorityToken({
  product_key: 'systemia-website-audit',
  min_price_cents: 21000,
  max_discount_bps: 3000,
  allowed_offer_names: ['Full Audit'],
  max_rounds: 4,
  expires_at: '2030-01-01T00:00:00.000Z',
  nonce: 'test-nonce'
}, secret);

const delegated = negotiateDeal({
  ...base,
  authoritySecret: secret,
  now: new Date('2026-09-25T20:00:00.000Z'),
  request: { ...base.request, requested_price_cents: 22000, authority_token: token }
});
assert.equal(delegated.state, 'delegated_counter_candidate');
assert.equal(delegated.counterproposal.price.cents, 22000);
assert.equal(delegated.authority.delegated, true);
assert.equal(delegated.binding, false);

const scopeTrade = negotiateDeal({
  ...base,
  request: { ...base.request, requested_price_cents: 10000 }
});
assert.equal(scopeTrade.state, 'scope_trade_counter');
assert.equal(scopeTrade.counterproposal.offer_name, 'Focused Audit');
assert.equal(scopeTrade.counterproposal.price.cents, 10000);

const noFit = negotiateDeal({
  catalog,
  directory,
  painIndex,
  request: { intent: 'I need a tomato soup recipe.' }
});
assert.equal(noFit.matched, false);
assert.equal(noFit.state, 'no_match');

console.log('CHUM Deal Desk proof passed.');
