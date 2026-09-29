#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { route as routeSignal } from '../signal-fabric/router.mjs';

const normalize = (value) => String(value ?? '').trim().toLowerCase();
const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const unique = (values) => [...new Set(values.filter(Boolean))];

const COMMERCIAL_PATTERNS = [
  /\btender\b/i,
  /\brfp\b/i,
  /\brfq\b/i,
  /request for proposals?/i,
  /request for quotations?/i,
  /procure(?:ment|d|s|ing)?/i,
  /seeking (?:a )?(?:supplier|vendor|contractor|partner)/i,
  /funding agreement/i,
  /grant (?:round|award|application|funding)/i,
  /capital expenditure|\bcapex\b/i,
  /network expansion/i,
  /fleet electrification/i,
  /construction (?:planned|expected|starting|begins)/i,
  /planning (?:approval|approved)/i,
  /contract (?:renewal|award|opportunity)/i,
];

const HIGH_INTENT_PATTERNS = [
  /tender/i,
  /request for proposals?/i,
  /request for quotations?/i,
  /seeking (?:a )?(?:supplier|vendor|contractor|partner)/i,
  /bids? (?:open|due|close|closing)/i,
  /procurement (?:open|live|notice|opportunity)/i,
];

const HUMAN_GATE_KINDS = new Set([
  'payment',
  'refund',
  'contract',
  'legal',
  'employment',
  'safety',
  'trust',
  'external_publish',
  'external_message',
  'destructive_change',
]);

function hash(value, length = 24) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, length);
}

export function loadProductRegistry(root = process.cwd()) {
  const file = path.join(root, 'registry', 'catalog.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function productTerms(product) {
  return unique([
    product.product_key,
    product.name,
    ...(product.aliases || []),
    ...(product.triggers || []),
    ...(product.intents || []),
  ].map((value) => String(value || '').trim()).filter(Boolean));
}

function scoreProduct(product, haystack) {
  let score = 0;
  for (const term of productTerms(product)) {
    const needle = normalize(term);
    if (!needle || needle.length < 3) continue;
    if (haystack.includes(needle)) score += needle.length >= 12 ? 8 : 4;
    const words = needle.split(/[^a-z0-9]+/).filter((word) => word.length >= 4);
    for (const word of words) if (haystack.includes(word)) score += 1;
  }
  return score;
}

export function resolveProduct(raw, registry = loadProductRegistry()) {
  const products = registry.products || [];
  const explicit = normalize(raw.product_key || raw.product || raw.service || raw.brand);
  if (explicit) {
    for (const product of products) {
      if (productTerms(product).some((term) => normalize(term) === explicit)) {
        return { product_key: product.product_key, name: product.name, confidence: 'explicit' };
      }
    }
  }

  const haystack = normalize([
    raw.title,
    raw.summary,
    raw.message,
    raw.kind,
    raw.signal_type,
    raw.domain_key,
    ...asArray(raw.target_buyers),
    ...asArray(raw.recommended_actions),
  ].join(' '));

  let best = null;
  for (const product of products) {
    const score = scoreProduct(product, haystack);
    if (!best || score > best.score) best = { product, score };
  }
  if (best && best.score >= 6) {
    return { product_key: best.product.product_key, name: best.product.name, confidence: 'matched' };
  }
  return { product_key: 'unknown', name: 'Unresolved Evercraft surface', confidence: 'unresolved' };
}

function textOf(raw) {
  return [
    raw.title,
    raw.summary,
    raw.message,
    raw.kind,
    raw.signal_type,
    raw.commercial_value_estimate,
    ...asArray(raw.recommended_actions),
    ...asArray(raw.target_buyers),
  ].filter(Boolean).join(' ');
}

function dateState(value, now) {
  if (!value) return 'unknown';
  const t = Date.parse(value);
  const n = Date.parse(now);
  if (!Number.isFinite(t) || !Number.isFinite(n)) return 'unknown';
  return t < n ? 'past' : 'future';
}

export function classifyCommercial(raw, { now = new Date().toISOString(), product } = {}) {
  const text = textOf(raw);
  const procurement = raw.procurement || {};
  const deadline = procurement.deadline || raw.procurement_deadline || raw.deadline || null;
  const deadlineState = dateState(deadline, now);
  const status = normalize(procurement.status || raw.procurement_status || raw.commercial_status);
  const buyers = unique([
    ...asArray(raw.target_buyers),
    ...asArray(raw.buyers),
    raw.buyer,
    raw.authority,
    procurement.buyer,
    procurement.authority,
  ].map((value) => String(value || '').trim()));

  const explicitCommercial =
    Boolean(raw.commercial_value_estimate) ||
    buyers.length > 0 ||
    Boolean(raw.procurement) ||
    Boolean(raw.procurement_deadline) ||
    raw.commercial_signal === true;

  const commercialPattern = COMMERCIAL_PATTERNS.some((pattern) => pattern.test(text));
  const highIntent = HIGH_INTENT_PATTERNS.some((pattern) => pattern.test(text));
  const isCommercial = explicitCommercial || commercialPattern;

  if (!isCommercial) {
    return {
      state: 'not_commercial',
      opportunity_key: null,
      buyers: [],
      deadline,
      deadline_state: deadlineState,
      next_action: 'none',
    };
  }

  let state = 'candidate';
  if (
    deadlineState === 'past' ||
    ['closed', 'awarded', 'expired', 'cancelled', 'canceled'].includes(status)
  ) {
    state = highIntent || Boolean(procurement.tender_id) ? 'missed_primary_tender' : 'secondary_opportunity';
  } else if (
    deadlineState === 'future' ||
    ['open', 'live', 'accepting_bids', 'accepting_proposals'].includes(status) ||
    highIntent
  ) {
    state = 'live_procurement';
  } else if (/planning (?:approval|approved)|construction (?:planned|expected)/i.test(text)) {
    state = 'secondary_opportunity';
  } else if (buyers.length && (raw.commercial_value_estimate || raw.signal_score >= 80)) {
    state = 'qualified_signal';
  }

  const productKey = product?.product_key || raw.product_key || 'unknown';
  const identity = [
    productKey,
    raw.signal_key,
    raw.id,
    raw.title,
    buyers.join('|'),
    deadline,
  ].filter(Boolean).join('|');

  const nextAction =
    state === 'live_procurement' ? 'resolve_buyer_contact_and_prepare_bounded_offer_before_deadline' :
    state === 'missed_primary_tender' ? 'identify_awardee_subcontractors_and_secondary_scope_then_capture_lessons' :
    state === 'secondary_opportunity' ? 'identify_remaining_buyers_contractors_installers_financing_and_follow_on_scope' :
    state === 'qualified_signal' ? 'build_proof_first_offer_and_assign_commercial_owner' :
    'enrich_buyer_value_deadline_and_fit_before_outreach';

  return {
    state,
    opportunity_key: `opp-${hash(identity || text)}`,
    buyers,
    deadline,
    deadline_state: deadlineState,
    estimated_value: procurement.estimated_value || raw.estimated_value || raw.commercial_value_estimate || null,
    evidence_state: raw.evidence_state || 'unknown',
    next_action: nextAction,
  };
}

function needsHumanGate(raw) {
  if (raw.human_gate_required === true) return true;
  if (raw.human_gate_required === false) return false;
  const kind = normalize(raw.action_kind || raw.kind);
  if (HUMAN_GATE_KINDS.has(kind)) return true;
  if (raw.external_action_requested === true) return true;
  if (raw.money_movement === true || raw.legal_effect === true || raw.employment_effect === true) return true;
  return false;
}

function missionIntent(raw, commercial) {
  if (commercial.state !== 'not_commercial') return true;
  if (raw.work_required === true || raw.follow_up_required === true) return true;
  if (['warning', 'critical'].includes(normalize(raw.severity_hint))) return true;
  return false;
}

export function routeBodyEvent(raw, {
  registry = loadProductRegistry(),
  now = raw.created_at || raw.detected_at || new Date().toISOString(),
} = {}) {
  const product = resolveProduct(raw, registry);
  const commercial = classifyCommercial(raw, { now, product });
  const signal = routeSignal({
    ...raw,
    product: product.product_key,
    summary: raw.summary || raw.title || raw.message || '',
    created_at: raw.created_at || raw.detected_at || now,
  });

  const gates = {
    human_required: needsHumanGate(raw),
    reason: raw.human_gate_reason || (needsHumanGate(raw) ? 'consequential_action_preserves_existing_human_authority' : null),
  };

  const lanes = new Set(['evidence_ledger', 'context_fabric', 'signal_fabric']);
  if (product.product_key === 'unknown') lanes.add('portfolio_sentinel');
  if (missionIntent(raw, commercial)) lanes.add('organism_goal_runtime');
  if (commercial.state !== 'not_commercial') {
    lanes.add('revenue_circulation');
    lanes.add('chum_commercial_mesh');
  }
  if (
    raw.payment_verified === true ||
    normalize(raw.status) === 'paid' ||
    normalize(raw.stage) === 'payment_verified' ||
    raw.fulfillment_ready === true
  ) lanes.add('portfolio_fulfillment_router');
  if (raw.publish_candidate === true && raw.public_safe === true) {
    lanes.add('media_studio');
    lanes.add('evercraft_clip_distribution');
  }
  if (raw.discovery_candidate === true || raw.public_discovery_candidate === true) {
    lanes.add('chum_discovery');
  }

  const eventIdentity = [
    raw.id,
    raw.signal_key,
    raw.source_ref,
    raw.title,
    raw.summary,
    product.product_key,
    raw.created_at,
    raw.detected_at,
  ].filter(Boolean).join('|');

  const eventId = raw.body_event_id || `body-${hash(eventIdentity || JSON.stringify(raw))}`;
  const nextMotion = [];
  if (product.product_key === 'unknown') nextMotion.push('resolve_product_or_create_portfolio_admission_candidate');
  if (commercial.state !== 'not_commercial') nextMotion.push(commercial.next_action);
  if (gates.human_required) nextMotion.push('hold_consequential_external_action_until_authorized');
  if (signal.severity === 'warning' || signal.severity === 'critical') nextMotion.push('open_or_update_operational_incident');
  if (!nextMotion.length) nextMotion.push('receipt_and_keep_available_to_shared_context');

  return {
    schema: 'evercraft.one-body.event.v1',
    event_id: eventId,
    occurred_at: raw.created_at || raw.detected_at || now,
    source: raw.source || 'unknown',
    source_ref: raw.source_ref || raw.signal_key || raw.id || null,
    product,
    evidence: {
      state: raw.evidence_state || 'unknown',
      confidence: raw.confidence || 'unknown',
      source_refs: unique(asArray(raw.source_refs)),
    },
    signal,
    commercial,
    gates,
    lanes: [...lanes],
    next_motion: unique(nextMotion),
    dead_end: false,
  };
}

export function emptyBodyState() {
  return {
    schema: 'evercraft.one-body.state.v1',
    events: {},
    opportunities: {},
    products: {},
    lane_queues: {},
  };
}

export function ingestBodyEvent(state, raw, options = {}) {
  const next = structuredClone(state || emptyBodyState());
  const decision = routeBodyEvent(raw, options);
  const prior = next.events[decision.event_id] || null;

  next.events[decision.event_id] = {
    event_id: decision.event_id,
    product_key: decision.product.product_key,
    occurred_at: decision.occurred_at,
    source_ref: decision.source_ref,
    lanes: decision.lanes,
    repeat_count: (prior?.repeat_count || 0) + 1,
  };

  const productKey = decision.product.product_key;
  next.products[productKey] ||= {
    product_key: productKey,
    event_count: 0,
    commercial_opportunity_count: 0,
    last_seen_at: null,
  };
  if (!prior) next.products[productKey].event_count += 1;
  next.products[productKey].last_seen_at = decision.occurred_at;

  if (decision.commercial.opportunity_key) {
    const key = decision.commercial.opportunity_key;
    const existing = next.opportunities[key] || null;
    next.opportunities[key] = {
      opportunity_key: key,
      product_key: productKey,
      state: decision.commercial.state,
      buyers: decision.commercial.buyers,
      deadline: decision.commercial.deadline,
      estimated_value: decision.commercial.estimated_value,
      evidence_state: decision.commercial.evidence_state,
      next_action: decision.commercial.next_action,
      first_seen_at: existing?.first_seen_at || decision.occurred_at,
      last_seen_at: decision.occurred_at,
      repeat_count: (existing?.repeat_count || 0) + 1,
    };
    if (!existing) next.products[productKey].commercial_opportunity_count += 1;
  }

  if (!prior) {
    for (const lane of decision.lanes) {
      next.lane_queues[lane] ||= [];
      next.lane_queues[lane].push(decision.event_id);
    }
  }

  return {
    state: next,
    decision: {
      ...decision,
      duplicate: Boolean(prior),
      repeat_count: (prior?.repeat_count || 0) + 1,
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = Buffer.concat(chunks).toString('utf8').trim();
  if (!input) {
    console.error('Expected one JSON event on stdin');
    process.exit(2);
  }
  process.stdout.write(JSON.stringify(routeBodyEvent(JSON.parse(input)), null, 2) + '\n');
}
