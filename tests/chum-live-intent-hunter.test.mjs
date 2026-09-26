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
assert.equal(result.engine_revision, 'concept-fabric-v3');
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

const evCatalog = {
  offers: [{
    public_id: 'rivet-site-underwriting-v1',
    name: 'RIVET EV Infrastructure Intelligence',
    intent_terms: [
      'underwrite an EV charging site',
      'EV charger investment report',
      'EV charging diligence',
      'preliminary EV charging site plan'
    ],
    problem: 'Address-specific EV infrastructure diligence and underwriting.',
    public_url: 'https://example.com/rivet',
    commercial_state: 'sell_now',
    machine_state: 'payment_ready_human_confirmation',
    pricing: '$299 preliminary; $750 full',
    human_confirmation_required: true
  }]
};

const evPainIndex = {
  entries: [
    {
      capability_id: 'product:aliev',
      product_key: 'aliev',
      name: 'AliEV',
      pain_phrases: [
        'I own a hotel and need to know whether this property is a good EV charging site and what the opportunity looks like',
        'is this property good for EV charging',
        'estimate the EV charging opportunity for this property',
        'hotel EV charging site analysis'
      ],
      canonical_url: 'https://example.com/aliev',
      commercial_state: 'product_contract',
      machine_state: 'specialist_mcp_declared'
    },
    {
      capability_id: 'offer:rivet-site-underwriting-v1',
      public_id: 'rivet-site-underwriting-v1',
      name: 'RIVET EV Infrastructure Intelligence',
      pain_phrases: [
        'underwrite an EV charging site',
        'EV charger investment report',
        'EV charging diligence',
        'preliminary EV charging site plan'
      ],
      canonical_url: 'https://example.com/rivet',
      commercial_state: 'sell_now',
      machine_state: 'payment_ready_human_confirmation',
      pricing: '$299 preliminary; $750 full'
    }
  ]
};

const genericEv = huntLiveIntent({
  catalog: evCatalog,
  directory,
  painIndex: evPainIndex,
  intent: 'I own a hotel and need to know whether this property is a good EV charging site and what the opportunity looks like.'
});
assert.equal(genericEv.match.product_key, 'aliev');
assert.equal(genericEv.routing_receipt.ranking_mode, 'problem_first');
assert.equal(genericEv.routing_receipt.explicit_commercial_continuation, false);

const commercialEv = huntLiveIntent({
  catalog: evCatalog,
  directory,
  painIndex: evPainIndex,
  intent: 'I want a paid EV charger investment report and underwriting for this address.'
});
assert.equal(commercialEv.match.public_id, 'rivet-site-underwriting-v1');
assert.equal(commercialEv.routing_receipt.explicit_commercial_continuation, true);

console.log('CHUM live-intent hunter proof passed.');
