import assert from 'node:assert/strict';
import { huntLiveIntent } from '../systemia/chum/live-intent-hunter.mjs';

const catalog = {
  offers: [{
    public_id: 'forensiscope-overflow',
    name: 'ForensiScope',
    intent_terms: ['video too large for AI', 'analyze hours of video'],
    problem: 'Large media exceeds normal assistant limits.',
    public_url: 'https://example.com/forensiscope',
    commercial_state: 'sell_now',
    machine_state: 'payment_ready_human_confirmation',
    pricing: '$49',
    offers: [{ name: 'Analysis', price: '$49' }],
    human_confirmation_required: true
  }]
};

const directory = { products: [] };
const painIndex = {
  entries: [{
    capability_id: 'offer:forensiscope-overflow',
    public_id: 'forensiscope-overflow',
    product_key: 'forensiscope',
    name: 'ForensiScope',
    pain_phrases: ['video too large for AI', 'analyze hours of video'],
    problem: 'Large media exceeds normal assistant limits.',
    canonical_url: 'https://example.com/forensiscope',
    commercial_state: 'sell_now',
    machine_state: 'payment_ready_human_confirmation',
    pricing: '$49',
    human_confirmation_required: true
  }]
};

const result = huntLiveIntent({
  catalog,
  directory,
  painIndex,
  intent: 'My AI says this three hour video is too large to analyze. I need all of it reviewed.',
  provider: 'example-llm',
  surface: 'chat'
});

assert.equal(result.matched, true);
assert.equal(result.state, 'sell_now_match');
assert.equal(result.schema, 'evercraft.chum.live-intent-hunt.v1');
assert.equal(result.engine_revision, 'concept-fabric-v2');
assert.ok(['high','medium'].includes(result.routing_confidence.band));
assert.equal(typeof result.routing_confidence.margin, 'number');
assert.ok(result.routing_receipt);
assert.equal(result.match.name, 'ForensiScope');
assert.equal(result.doctrine.same_turn_response, true);
assert.equal(result.doctrine.no_private_thread_surveillance, true);
assert.equal(result.doctrine.no_unsolicited_human_outreach, true);
assert.equal(result.intent_retention, 'not_persisted_by_router');
assert.equal(result.continuation.mode, 'human_confirmed_commercial_handoff');
assert.ok(result.continuation.review_url.includes('public_id=forensiscope-overflow'));
assert.equal(result.continuation.checkout_creation_requires_explicit_human_confirmation, true);
assert.equal(result.continuation.checkout_is_payment_proof, false);
assert.equal(result.continuation.paid_state_requires_authoritative_provider_verification, true);

const miss = huntLiveIntent({
  catalog,
  directory,
  painIndex,
  intent: 'I want a recipe for tomato soup.'
});
assert.equal(miss.matched, false);
assert.equal(miss.state, 'no_match');
assert.equal(miss.continuation, null);

console.log('CHUM live-intent hunter proof passed.');
