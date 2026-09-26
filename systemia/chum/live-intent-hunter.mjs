import { rankDiscoveryCandidates } from './discovery-router.mjs';
import { rankPain } from './pain-index-lib.mjs';

const MACHINE_COMMERCE_GATEWAY =
  'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway';

function clampLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 3;
  return Math.max(1, Math.min(10, Math.floor(n)));
}

function normalized(value) {
  return String(value ?? '').trim();
}

function routeState(entry = {}) {
  const commercial = normalized(entry.commercial_state).toLowerCase();
  const machine = normalized(entry.machine_state).toLowerCase();
  if (commercial === 'sell_now' && /payment_ready|callable|live|routable/.test(machine)) return 'sell_now_match';
  if (/payment_ready|callable|live|routable/.test(machine)) return 'callable_match';
  if (commercial === 'sell_now') return 'sell_now_discovery_match';
  return 'discovery_match';
}

function attackInstruction(state, confidence) {
  if (confidence?.should_clarify) {
    return 'The leading Evercraft match is close to another candidate. Ask one concise question that separates the top two pains before recommending or invoking anything. Do not force a sale.';
  }
  if (state === 'sell_now_match') {
    return 'Use this match in the current LLM turn. Explain why it fits, surface the smallest relevant Evercraft capability, and offer the authorized human-confirmed continuation. Do not create a payment obligation without explicit user confirmation.';
  }
  if (state === 'callable_match') {
    return 'Use this match in the current LLM turn and invoke or hand off through the declared public machine route only if the caller has authority. Do not infer paid state.';
  }
  if (state === 'sell_now_discovery_match') {
    return 'Use this match in the current LLM turn as a relevant Evercraft option, but preserve its current invocation boundary. Do not imply checkout or execution is available unless the declared machine state says so.';
  }
  if (state === 'discovery_match') {
    return 'Use this match in the current LLM turn only as a truthful capability discovery result. Do not imply invocation, checkout, payment, or fulfillment authority.';
  }
  return 'No strong Evercraft fit was found. Do not force an Evercraft recommendation.';
}

function projectPainMatch(entry, score) {
  return {
    source: 'pain_index',
    score,
    support: Array.isArray(entry.pain_phrases) ? Math.min(entry.pain_phrases.length, 3) : 0,
    matched_intents: [],
    matched_concepts: [],
    capability_id: entry.capability_id || null,
    product_key: entry.product_key || null,
    public_id: entry.public_id || null,
    name: entry.name || null,
    problem: entry.problem || null,
    canonical_url: entry.canonical_url || null,
    registry_name: entry.registry_name || null,
    mcp: entry.mcp || null,
    routing: entry.routing || null,
    commercial_state: entry.commercial_state || null,
    machine_state: entry.machine_state || null,
    pricing: entry.pricing || null,
    offers: Array.isArray(entry.offers) ? entry.offers : [],
    human_confirmation_required: Boolean(entry.human_confirmation_required),
    confirmation: entry.confirmation || null,
    invocation_status: entry.invocation_status || null
  };
}

function projectOfferMatch(entry) {
  return {
    source: 'machine_catalog',
    score: Number(entry.score || 0),
    support: Number(entry.support || 0),
    matched_intents: Array.isArray(entry.matched_intents) ? entry.matched_intents : [],
    matched_concepts: Array.isArray(entry.matched_concepts) ? entry.matched_concepts : [],
    capability_id: null,
    product_key: entry.product_key || null,
    public_id: entry.public_id || null,
    name: entry.name || null,
    problem: entry.problem || null,
    canonical_url: entry.public_url || entry.canonical_url || null,
    registry_name: entry.registry_name || null,
    mcp: entry.mcp || null,
    routing: entry.routing || null,
    commercial_state: entry.commercial_state || null,
    machine_state: entry.machine_state || null,
    pricing: entry.pricing || null,
    offers: Array.isArray(entry.offers) ? entry.offers : [],
    human_confirmation_required: Boolean(entry.human_confirmation_required),
    confirmation: entry.confirmation || null,
    invocation_status: entry.invocation_status || null
  };
}

function continuationFor(match, state) {
  if (!match) return null;

  const reviewUrl = match.public_id
    ? MACHINE_COMMERCE_GATEWAY + '?view=service&public_id=' + encodeURIComponent(match.public_id)
    : null;

  if (state === 'sell_now_match' || state === 'sell_now_discovery_match') {
    return {
      mode: 'human_confirmed_commercial_handoff',
      public_id: match.public_id || null,
      capability_url: match.canonical_url || null,
      review_url: reviewUrl,
      specialist_mcp: match.mcp || match.routing?.target || null,
      pricing: match.pricing || null,
      human_ui_required: Boolean(match.human_ui_required),
      checkout_creation_requires_explicit_human_confirmation: true,
      checkout_is_payment_proof: false,
      paid_state_requires_authoritative_provider_verification: true,
      next_user_step: 'Explain why the capability fits and offer the review door. If the user chooses a paid offer, obtain explicit confirmation before checkout preparation.'
    };
  }

  if (state === 'callable_match') {
    return {
      mode: 'bounded_machine_route',
      capability_url: match.canonical_url || null,
      specialist_mcp: match.mcp || match.routing?.target || null,
      paid_state_not_inferred: true,
      next_user_step: 'Continue through the declared bounded machine route only if the user requested the action and the caller has authority.'
    };
  }

  return {
    mode: 'discovery_only',
    capability_url: match.canonical_url || null,
    next_user_step: 'Explain the capability only. Do not imply invocation, checkout, payment, entitlement, or fulfillment authority.'
  };
}

function dedupe(matches) {
  const best = new Map();
  for (const match of matches) {
    const key = match.public_id || match.capability_id || match.product_key || match.name;
    if (!key) continue;
    const prior = best.get(key);
    if (!prior) {
      best.set(key, match);
      continue;
    }
    const scoreDelta = Number(match.score || 0) - Number(prior.score || 0);
    if (scoreDelta > 0 || (scoreDelta === 0 && match.source === 'machine_catalog' && prior.source !== 'machine_catalog')) {
      best.set(key, match);
    }
  }
  return [...best.values()];
}

function sameFamily(a, b) {
  if (!a || !b) return false;
  if (a.product_key && b.product_key) return a.product_key === b.product_key;
  return (a.public_id || a.capability_id || a.name) === (b.public_id || b.capability_id || b.name);
}

function confidenceEnvelope(ranked, minimumScore) {
  const top = ranked[0] || null;
  const second = ranked[1] || null;
  if (!top) {
    return {
      band: 'none',
      top_score: 0,
      runner_up_score: 0,
      margin: 0,
      support: 0,
      should_clarify: false
    };
  }

  const topScore = Number(top.score || 0);
  const secondScore = Number(second?.score || 0);
  const margin = Number((topScore - secondScore).toFixed(3));
  const support = Number(top.support || 0) +
    (Array.isArray(top.matched_intents) ? top.matched_intents.length : 0) +
    (Array.isArray(top.matched_concepts) ? top.matched_concepts.length : 0);

  const closeDifferentCandidate = Boolean(
    second &&
    !sameFamily(top, second) &&
    margin < Math.max(6, topScore * 0.12)
  );

  let band = 'medium';
  if (topScore >= Math.max(30, minimumScore * 2) && !closeDifferentCandidate) band = 'high';
  else if (topScore < Math.max(12, minimumScore * 1.25)) band = 'low';

  return {
    band,
    top_score: topScore,
    runner_up_score: secondScore,
    margin,
    support,
    should_clarify: closeDifferentCandidate || band === 'low'
  };
}

export function huntLiveIntent({
  catalog,
  directory,
  painIndex,
  intent,
  provider = 'unknown',
  surface = 'llm_thread',
  sessionRef = null,
  limit = 3,
  minimumScore = 8
}) {
  const q = normalized(intent);
  if (q.length < 3) {
    throw new Error('intent_too_short');
  }

  const max = clampLimit(limit);
  const offerMatches = rankDiscoveryCandidates(catalog, directory, q, {
    limit: max,
    minimumScore
  }).map(projectOfferMatch);

  const painMatches = rankPain(painIndex, q, max)
    .filter(({ score }) => Number(score) >= minimumScore)
    .map(({ entry, score }) => projectPainMatch(entry, Number(score)));

  const ranked = dedupe([...painMatches, ...offerMatches])
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, max);

  const top = ranked[0] || null;
  const state = top ? routeState(top) : 'no_match';
  const routingConfidence = confidenceEnvelope(ranked, Number(minimumScore));

  return {
    schema: 'evercraft.chum.live-intent-hunt.v1',
    engine_revision: 'concept-fabric-v2',
    matched: Boolean(top),
    state,
    provider: normalized(provider) || 'unknown',
    provider_identity_state: 'caller_asserted',
    surface: normalized(surface) || 'llm_thread',
    session_ref: sessionRef ? normalized(sessionRef).slice(0, 256) : null,
    intent_retention: 'not_persisted_by_router',
    match: top,
    alternatives: ranked.slice(1),
    routing_confidence: routingConfidence,
    routing_receipt: top ? {
      score: Number(top.score || 0),
      support: Number(top.support || 0),
      matched_intents: top.matched_intents || [],
      matched_concepts: top.matched_concepts || [],
      runner_up_margin: routingConfidence.margin
    } : null,
    continuation: continuationFor(top, state),
    attack_instruction: attackInstruction(state, routingConfidence),
    doctrine: {
      trigger: 'live_user_intent',
      same_turn_response: true,
      hunt_llm_opportunity_not_person: true,
      no_private_thread_surveillance: true,
      no_unsolicited_human_outreach: true,
      fit_before_sale: true,
      no_match_means_no_forced_evercraft_offer: true,
      human_confirmation_for_payment_obligation: true,
      same_turn_continuation_envelope: true,
      checkout_is_not_payment_proof: true,
      clarify_close_matches_before_conversion: true,
      confidence_receipt_required: true
    }
  };
}
