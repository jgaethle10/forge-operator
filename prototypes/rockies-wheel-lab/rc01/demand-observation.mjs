import crypto from 'node:crypto';
import { ingestContextObservation, emptyContextState } from '../../../systemia/worldstate/observation-fabric.mjs';

// An internal research intake adapter. It never fetches, scrapes, publishes,
// contacts people, or writes into canonical Systemia production on its own.
const clean = (v) => String(v ?? '').trim();
const digest = (v) => crypto.createHash('sha256').update(v).digest('hex').slice(0, 20);

export function normalizeCommunityDemand(input = {}) {
  const provenance = clean(input.provenance_ref);
  if (!provenance.startsWith('intake:founder-screenshot:')) {
    throw new TypeError('A scoped internal founder-screenshot provenance reference is required');
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(clean(input.observed_at)) ||
      !Number.isFinite(Date.parse(input.observed_at))) {
    throw new TypeError('An explicit observed_at ISO timestamp is required');
  }
  if (input.public_post_url || input.poster_name || input.commenter_names || input.identities) {
    throw new TypeError('This private intake must omit personal identities and unverified public URLs');
  }
  const need = clean(input.need);
  if (need.length < 12 || need.length > 240) throw new TypeError('A concise, non-identifying need is required');
  const region = clean(input.region_key).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(region)) throw new TypeError('A valid region key is required');
  const reactions = Number(input.reactions);
  const comments = Number(input.comments);
  if (![reactions, comments].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 100000)) {
    throw new TypeError('Screenshot interaction counts must be bounded nonnegative integers');
  }
  if (input.buyers_verified || input.merchant_opt_in || input.willingness_to_pay_verified) {
    throw new TypeError('Screenshot interactions are not buyer verification');
  }
  const id = 'rockies-demand:' + digest([provenance, region, need.toLowerCase()].join('|'));
  return {
    observation_id: id,
    source_system: 'rockies-manual-intake',
    source_family: 'founder-provided-community-screenshot',
    observed_at: new Date(input.observed_at).toISOString(),
    region_key: region,
    domain: 'commerce',
    kind: 'consumer_feature_request',
    evidence_state: 'reported',
    anomaly_score: 0,
    reliability: 0.5,
    summary: 'A founder-provided community screenshot reports interest in ' + need + '. Buying intent remains unverified.',
    provenance_refs: [provenance],
    correlation_keys: [region + '::commerce::wheel-shopping-experience'],
    facts: {
      category: 'wheel_visualizer',
      screenshot_count: 1,
      reactions_in_screenshot: reactions,
      comments_in_screenshot: comments,
      independent_verified_buyers: 0,
      merchant_opt_ins: 0,
      price_validation: 'unverified',
      public_post_permalink: 'not_provided'
    },
    metadata: {
      restricted_to_internal_research: true,
      personal_identities_excluded: true,
      manual_source: true,
      source_publicly_retrievable: false,
      action_authority: 'none',
      mission_admission: 'not_implied'
    }
  };
}

export function proveDemandObservationInMemory(raw) {
  const observation = normalizeCommunityDemand(raw);
  const first = ingestContextObservation(emptyContextState(), observation);
  const second = ingestContextObservation(first.state, observation);
  return {
    observation,
    decision: first.decision,
    dedupe_decision: second.decision,
    consumer_count: first.decision.consumers.length,
    context_count: Object.keys(first.state.contexts).length,
    // No persistent write or production mission admission occurs.
    simulated_only: true
  };
}
