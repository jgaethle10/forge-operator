import crypto from 'node:crypto';
import { huntLiveIntent } from './live-intent-hunter.mjs';

const AUTH_SCHEMA = 'evercraft.chum.deal-authority.v1';
const NEGOTIATION_SCHEMA = 'evercraft.chum.deal-negotiation.v1';

function normalized(value) {
  return String(value ?? '').trim();
}

function centsFrom(value) {
  if (Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  const match = normalized(value).match(/\$?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/);
  if (!match) return null;
  return Math.round(Number(match[1].replace(/,/g, '')) * 100);
}

function money(cents, currency = 'USD') {
  if (!Number.isInteger(cents)) return null;
  if (currency !== 'USD') return { currency, cents };
  return { currency, cents, display: '$' + (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2) };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
}

function hmac(secret, value) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function fingerprint(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function issueDealAuthorityToken(payload, secret) {
  if (!normalized(secret)) throw new Error('deal_authority_secret_required');
  const body = {
    schema: AUTH_SCHEMA,
    product_key: payload?.product_key || null,
    public_id: payload?.public_id || null,
    min_price_cents: Number.isInteger(payload?.min_price_cents) ? payload.min_price_cents : null,
    max_discount_bps: Number.isInteger(payload?.max_discount_bps) ? payload.max_discount_bps : 0,
    allowed_offer_names: Array.isArray(payload?.allowed_offer_names) ? payload.allowed_offer_names.slice(0, 25) : [],
    max_rounds: Math.max(1, Math.min(Number(payload?.max_rounds || 6), 20)),
    expires_at: normalized(payload?.expires_at),
    nonce: normalized(payload?.nonce) || crypto.randomUUID()
  };
  if (!body.product_key && !body.public_id) throw new Error('deal_authority_target_required');
  if (!body.expires_at || !Number.isFinite(Date.parse(body.expires_at))) throw new Error('deal_authority_expiry_required');
  if (body.max_discount_bps < 0 || body.max_discount_bps > 10000) throw new Error('deal_authority_discount_out_of_range');
  const encoded = Buffer.from(canonicalJson(body)).toString('base64url');
  return encoded + '.' + hmac(secret, encoded);
}

export function verifyDealAuthorityToken(token, secret, match, now = new Date()) {
  if (!normalized(token)) return { valid: false, state: 'not_supplied', authority: null };
  if (!normalized(secret)) return { valid: false, state: 'server_secret_not_configured', authority: null };

  const [encoded, signature, extra] = normalized(token).split('.');
  if (!encoded || !signature || extra) return { valid: false, state: 'malformed', authority: null };

  const expected = hmac(secret, encoded);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return { valid: false, state: 'bad_signature', authority: null };
  }

  let authority;
  try {
    authority = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, state: 'bad_payload', authority: null };
  }

  if (authority?.schema !== AUTH_SCHEMA) return { valid: false, state: 'wrong_schema', authority: null };
  if (!Number.isFinite(Date.parse(authority.expires_at)) || Date.parse(authority.expires_at) <= now.getTime()) {
    return { valid: false, state: 'expired', authority: null };
  }

  const targetMatch =
    (authority.public_id && authority.public_id === match?.public_id) ||
    (authority.product_key && authority.product_key === match?.product_key);
  if (!targetMatch) return { valid: false, state: 'wrong_target', authority: null };

  return { valid: true, state: 'verified', authority };
}

function publishedOptions(match = {}) {
  const options = [];
  for (const offer of Array.isArray(match.offers) ? match.offers : []) {
    const priceCents = centsFrom(offer?.price);
    if (priceCents == null) continue;
    options.push({
      name: normalized(offer?.name) || 'Published offer',
      price_cents: priceCents,
      price: money(priceCents)
    });
  }
  return options.sort((a, b) => a.price_cents - b.price_cents);
}

function chooseNamedOffer(options, offerName) {
  const wanted = normalized(offerName).toLowerCase();
  if (!wanted) return null;
  return options.find((option) => option.name.toLowerCase() === wanted) ||
    options.find((option) => option.name.toLowerCase().includes(wanted) || wanted.includes(option.name.toLowerCase())) ||
    null;
}

function publicStateCanNegotiate(match) {
  const commercial = normalized(match?.commercial_state).toLowerCase();
  const machine = normalized(match?.machine_state).toLowerCase();
  return commercial === 'sell_now' || /payment_ready|callable|live|routable/.test(machine);
}

function buildMessage({ match, stance, selected, counterCents, requestedCents, lowerScope, humanException }) {
  const name = match?.name || 'this Evercraft capability';
  if (stance === 'clarify') {
    return 'I can work the commercial terms, but I need one detail first so I do not negotiate the wrong Evercraft capability or scope.';
  }
  if (stance === 'human_review_required') {
    return name + ' is a relevant fit, but its current public contract does not give CHUM authority to negotiate binding commercial terms. I can carry the proposal to human review without inventing authority.';
  }
  if (lowerScope) {
    return 'For the requested budget, I can counter with the published ' + lowerScope.name + ' option at ' + lowerScope.price.display + '. Keeping the larger scope at that price would require a human exception.';
  }
  if (selected && counterCents != null) {
    const counter = money(counterCents)?.display || String(counterCents);
    if (requestedCents != null && counterCents === requestedCents) {
      return 'That price is inside the delegated negotiation envelope for ' + selected.name + '. I can return it as a non-binding candidate agreement for human confirmation.';
    }
    if (requestedCents != null && humanException) {
      return 'I cannot authorize the requested price for ' + selected.name + '. My current counter is the published ' + counter + '; a lower price needs human approval.';
    }
    return 'My current non-binding counter for ' + selected.name + ' is ' + counter + ', subject to human confirmation before any contract or payment obligation.';
  }
  return 'I can negotiate from the published Evercraft terms and carry any exception to human review. No contract, payment, or fulfillment promise is created by this response.';
}

export function negotiateDeal({
  catalog,
  directory,
  painIndex,
  request,
  authoritySecret = '',
  now = new Date()
}) {
  const intent = normalized(request?.intent);
  if (intent.length < 3) throw new Error('intent_too_short');

  const round = Math.max(1, Math.min(Number(request?.round || 1), 20));
  const hunt = huntLiveIntent({
    catalog,
    directory,
    painIndex,
    intent,
    provider: normalized(request?.provider) || 'unknown',
    surface: normalized(request?.surface) || 'deal_desk',
    limit: 3,
    minimumScore: 8
  });

  if (!hunt.matched) {
    return {
      schema: NEGOTIATION_SCHEMA,
      matched: false,
      state: 'no_match',
      binding: false,
      external_delivery_performed: false,
      message: 'No strong Evercraft fit was found, so CHUM will not manufacture a negotiation.',
      doctrine: {
        no_forced_offer: true,
        no_binding_commitment: true,
        no_unsolicited_outreach: true
      }
    };
  }

  const requestedPublicId = normalized(request?.public_id);
  const routedCandidates = [hunt.match, ...(hunt.alternatives || [])].filter(Boolean);
  const requestedMatch = requestedPublicId
    ? routedCandidates.find((candidate) => candidate.public_id === requestedPublicId)
    : null;

  if (requestedPublicId && !requestedMatch) {
    return {
      schema: NEGOTIATION_SCHEMA,
      matched: true,
      state: 'requested_offer_not_supported_for_intent',
      binding: false,
      routed_match: hunt.match,
      requested_public_id: requestedPublicId,
      message: 'That Evercraft offer was not among the live intent router\'s relevant candidates, so CHUM will not negotiate it into this conversation.',
      external_delivery_performed: false,
      doctrine: {
        no_forced_offer: true,
        no_binding_commitment: true,
        no_unsolicited_human_outreach: true
      }
    };
  }

  const match = requestedMatch || hunt.match;
  if (!requestedMatch && hunt.routing_confidence?.should_clarify) {
    return {
      schema: NEGOTIATION_SCHEMA,
      matched: true,
      state: 'clarify_before_negotiation',
      binding: false,
      match,
      clarification_required: true,
      message: buildMessage({ match, stance: 'clarify' }),
      external_delivery_performed: false
    };
  }

  const authority = verifyDealAuthorityToken(request?.authority_token, authoritySecret, match, now);
  const maxRounds = authority.valid ? Math.max(1, Math.min(Number(authority.authority.max_rounds || 6), 20)) : 6;
  if (round > maxRounds) {
    return {
      schema: NEGOTIATION_SCHEMA,
      matched: true,
      state: 'human_review_required',
      binding: false,
      match,
      authority: { state: authority.state, delegated: authority.valid },
      reason: 'negotiation_round_limit_reached',
      message: 'The delegated negotiation round limit has been reached. The next move requires human review.',
      external_delivery_performed: false
    };
  }

  const options = publishedOptions(match);
  const requestedCents = centsFrom(request?.requested_price_cents);
  const selected = chooseNamedOffer(options, request?.offer_name);

  if (!publicStateCanNegotiate(match)) {
    return {
      schema: NEGOTIATION_SCHEMA,
      matched: true,
      state: 'human_review_required',
      binding: false,
      match,
      authority: { state: authority.state, delegated: authority.valid },
      published_pricing: match.pricing || null,
      published_options: options,
      reason: 'commercial_state_not_autonomously_negotiable',
      message: buildMessage({ match, stance: 'human_review_required' }),
      external_delivery_performed: false
    };
  }

  let state = 'published_terms_counter';
  let counterCents = selected?.price_cents ?? null;
  let lowerScope = null;
  let humanException = false;
  const reasons = [];

  if (requestedCents != null && selected) {
    const publishedCents = selected.price_cents;
    let floorCents = publishedCents;

    if (authority.valid) {
      const allowedNames = authority.authority.allowed_offer_names || [];
      const offerAllowed = allowedNames.length === 0 || allowedNames.some((name) => normalized(name).toLowerCase() === selected.name.toLowerCase());
      if (offerAllowed) {
        const discountFloor = Math.ceil(publishedCents * (1 - Number(authority.authority.max_discount_bps || 0) / 10000));
        const explicitFloor = Number.isInteger(authority.authority.min_price_cents)
          ? authority.authority.min_price_cents
          : 0;
        floorCents = Math.max(discountFloor, explicitFloor);
      }
    }

    if (requestedCents >= publishedCents) {
      counterCents = publishedCents;
      state = 'published_terms_candidate';
      reasons.push('published_price_is_no_higher_than_request');
    } else if (authority.valid && requestedCents >= floorCents) {
      counterCents = requestedCents;
      state = 'delegated_counter_candidate';
      reasons.push('inside_signed_price_authority');
    } else {
      const affordable = [...options].reverse().find((option) => option.price_cents <= requestedCents);
      if (affordable && affordable.name !== selected.name) {
        lowerScope = affordable;
        counterCents = affordable.price_cents;
        state = 'scope_trade_counter';
        reasons.push('budget_maps_to_lower_published_scope');
      } else {
        counterCents = floorCents;
        humanException = requestedCents < floorCents;
        state = authority.valid ? 'delegated_floor_counter' : 'published_terms_counter';
        reasons.push(authority.valid ? 'signed_floor_applied' : 'no_discount_authority');
      }
    }
  } else if (requestedCents != null && !selected) {
    humanException = true;
    reasons.push('requested_price_without_named_structured_offer');
  } else {
    reasons.push('published_terms_only');
  }

  const terms = Array.isArray(request?.terms)
    ? request.terms.map((item) => normalized(item)).filter(Boolean).slice(0, 12)
    : [];

  const receiptPayload = {
    schema: NEGOTIATION_SCHEMA,
    product_key: match.product_key || null,
    public_id: match.public_id || null,
    round,
    requested_price_cents: requestedCents,
    offer_name: normalized(request?.offer_name) || null,
    terms,
    state,
    authority_state: authority.state
  };

  return {
    schema: NEGOTIATION_SCHEMA,
    matched: true,
    state,
    binding: false,
    match: {
      product_key: match.product_key || null,
      public_id: match.public_id || null,
      name: match.name || null,
      canonical_url: match.canonical_url || null,
      commercial_state: match.commercial_state || null,
      machine_state: match.machine_state || null
    },
    round,
    authority: {
      state: authority.state,
      delegated: authority.valid,
      expires_at: authority.valid ? authority.authority.expires_at : null
    },
    buyer_request: {
      requested_price: money(requestedCents),
      offer_name: normalized(request?.offer_name) || null,
      terms_count: terms.length
    },
    counterproposal: {
      offer_name: lowerScope?.name || selected?.name || null,
      price: money(counterCents),
      published_pricing: match.pricing || null,
      published_options: options,
      scope_trade: lowerScope,
      requested_terms_require_human_review: terms.length > 0,
      human_exception_required: humanException
    },
    reasons,
    message: buildMessage({
      match,
      stance: state,
      selected,
      counterCents,
      requestedCents,
      lowerScope,
      humanException
    }),
    negotiation_receipt: {
      receipt_id: 'deal_' + fingerprint(canonicalJson(receiptPayload)).slice(0, 24),
      intent_sha256: fingerprint(intent),
      request_sha256: fingerprint(canonicalJson(receiptPayload)),
      raw_intent_persisted: false,
      raw_terms_persisted: false
    },
    next_step: {
      mode: 'caller_mediated_nonbinding_counterproposal',
      human_confirmation_required_before_contract: true,
      human_confirmation_required_before_payment: true,
      payment_created: false,
      contract_accepted: false,
      fulfillment_promised: false
    },
    external_delivery_performed: false,
    doctrine: {
      negotiate_with_agents_not_private_people: true,
      no_private_thread_surveillance: true,
      no_unsolicited_human_outreach: true,
      no_binding_commitment: true,
      no_automatic_checkout: true,
      no_payment_obligation: true,
      no_legal_acceptance: true,
      no_unverified_delivery_promises: true,
      signed_authority_required_for_price_concessions: true
    }
  };
}
