import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { admitProofFirstOutreach } from './engine.mjs';
import { commercialExclusion } from '../saban/revenue-swarm.mjs';
import { reviewDemandBatch } from './demand-portfolio-review.mjs';

// A read-only specialist for Systemia's existing proof-first-sales pipeline.
// These are routing hypotheses, not claims of independent service readiness.
export const CLIENT_SCOUT_OFFERS = Object.freeze([
  Object.freeze({
    key: 'work_saban_report_pilot',
    name: 'Work Saban: monthly sales reporting pilot',
    need_tags: ['monthly_reporting', 'spreadsheet_reconciliation', 'sales_csv'],
    sale_state: 'private_pilot_interest',
    public_proof_url: 'https://jgaethle10.github.io/forge-operator/work-saban/report/',
    price_usd: null,
    required_gate: 'consented_pilot_and_approved_scope_before_price',
  }),
  Object.freeze({
    key: 'asset_diagnosis',
    name: 'Evercraft Asset Diagnosis',
    need_tags: ['website_diagnosis', 'broken_workflow', 'digital_asset_audit'],
    sale_state: 'scope_confirmation_required',
    public_proof_url: 'https://jgaethle10.github.io/forge-operator/mesh/checkout-ready/asset-diagnosis/',
    price_usd: 149,
    required_gate: 'scope_capacity_and_checkout_account_reconciliation',
  }),
  Object.freeze({
    key: 'social_intelligence_launch',
    name: 'Evercraft Social Intelligence Launch',
    need_tags: ['audience_research', 'campaign_strategy', 'market_launch'],
    sale_state: 'scope_confirmation_required',
    public_proof_url: 'https://jgaethle10.github.io/forge-operator/mesh/checkout-ready/social-intelligence-launch/',
    price_usd: 1000,
    required_gate: 'scope_capacity_and_checkout_account_reconciliation',
  }),
  Object.freeze({
    key: 'site_survive_audit',
    name: 'Evercraft Network: Site-Survive Audit',
    need_tags: ['site_resilience', 'business_continuity'],
    sale_state: 'scope_confirmation_required',
    public_proof_url: null,
    price_usd: 1250,
    required_gate: 'technical_delivery_and_client_scope_verification',
  }),
  Object.freeze({
    key: 'commercial_studio',
    name: 'Evercraft Commercial Studio',
    need_tags: ['video_commercial', 'product_video', 'brand_story'],
    sale_state: 'custom_quote',
    public_proof_url: null,
    price_usd: null,
    required_gate: 'asset_rights_scope_and_schedule_approval',
  }),
]);

const ALLOWED_KINDS = new Set([
  'client_request', 'client_reply', 'partner_invitation',
  'public_hiring', 'public_service_description', 'public_announcement',
]);
const VALID_NEEDS = new Set(CLIENT_SCOUT_OFFERS.flatMap(offer => offer.need_tags));

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}
function unique(values) {
  return [...new Set(values)];
}
function evidenceAgeDays(dateString, now) {
  const then = Date.parse(clean(dateString));
  const at = new Date(now).getTime();
  if (!Number.isFinite(then) || !Number.isFinite(at) || then > at) return null;
  return (at - then) / 86400000;
}
function boundedInt(number, max) {
  const n = Number(number);
  return Number.isFinite(n) ? Math.max(0, Math.min(max, Math.floor(n))) : 0;
}

// Internal buyer-specific scope hypotheses, not approved offer/price bindings.
// Explicit source and evidence references are required; no fuzzy name matching.
function portfolioMatches(raw, portfolio, evidence, sourceKind) {
  if (portfolio?.schema !== 'evercraft.saban.scoped-portfolio-review.v1' ||
      portfolio.review_only !== true || sourceKind === 'unknown' || !evidence.length)
    return [];
  const candidates = new Map();
  const ambiguous = new Set();
  for (const row of portfolio.candidates || []) {
    if (!['machine_offer','registry_product'].includes(row?.source) ||
        typeof row.key !== 'string' || commercialExclusion({
          public_id: row.key, commercial_state: row.source_commercial_state
        })) continue;
    const id = row.source + ':' + row.key;
    if (candidates.has(id)) ambiguous.add(id);
    candidates.set(id, row);
  }
  const matches = [];
  const seen = new Set();
  for (const hint of (Array.isArray(raw.portfolio_scope_hypotheses) ? raw.portfolio_scope_hypotheses : []).slice(0,50)) {
    const id = hint?.source + ':' + hint?.key;
    const row = candidates.get(id);
    const ref = clean(hint?.evidence_ref);
    const scope = clean(hint?.proposed_deliverable);
    if (!row || ambiguous.has(id) || seen.has(id) || !evidence.includes(ref) ||
        !scope || scope.length > 1000) continue;
    seen.add(id);
    matches.push({
      key: id, name: row.name, evidence_ref: ref, proposed_deliverable: scope,
      sale_state: 'buyer_specific_scope_review', price_usd: null,
      required_gate: 'verify_need_feasibility_scope_capacity_exact_price_and_authority',
      public_proof_url: null, first_delivery_permitted_for_review: true,
      commercial_commitment_authorized: false
    });
  }
  return matches;
}

export function qualifyClientSignal(raw = {}, now = new Date(), { portfolio = null } = {}) {
  const prospectKey = clean(raw.prospect_key);
  const business = clean(raw.business);
  if (!prospectKey || !business) throw new Error('prospect_key_and_business_required');
  const evidence = unique((Array.isArray(raw.evidence_refs) ? raw.evidence_refs : []).map(clean).filter(Boolean));
  const sourceKind = ALLOWED_KINDS.has(raw.source_kind) ? raw.source_kind : 'unknown';
  const needTags = unique((Array.isArray(raw.need_tags) ? raw.need_tags : []).filter(t => VALID_NEEDS.has(t)));
  const matches = CLIENT_SCOUT_OFFERS.filter(o => o.need_tags.some(t => needTags.includes(t)));
  const scopedMatches = portfolioMatches(raw, portfolio, evidence, sourceKind);
  const hasEvidence = evidence.length > 0 && sourceKind !== 'unknown';
  const age = evidenceAgeDays(raw.observed_at, now);
  const replyConfirmed = raw.reply_confirmed === true;
  const scopeRequested = raw.scope_requested === true;
  const budgetConfirmed = raw.budget_confirmed === true;
  const decisionMakerConfirmed = raw.decision_maker_confirmed === true;
  const deliveryCapacityConfirmed = raw.delivery_capacity_confirmed === true;

  // A job ad is a workload clue, not budget, authority or permission.
  let score = 0;
  if (hasEvidence) score += 15;
  if (hasEvidence && age !== null && age <= 30) score += 10;
  if (hasEvidence && sourceKind === 'client_request') score += 25;
  else if (hasEvidence && sourceKind === 'client_reply' && replyConfirmed) score += 22;
  else if (hasEvidence && sourceKind === 'partner_invitation' && replyConfirmed) score += 12;
  else if (hasEvidence && sourceKind === 'public_hiring') score += 5;
  else if (hasEvidence) score += 2;
  if (matches.length) score += 12;
  if (replyConfirmed && scopeRequested) score += 12;
  if (decisionMakerConfirmed) score += 8;
  if (budgetConfirmed) score += 10;
  if (deliveryCapacityConfirmed) score += 8;
  score = Math.min(100, score);

  const unanswered = boundedInt(raw.unanswered_outbound, 99);
  const optOut = raw.opted_out === true;
  const promiseOverdue = raw.unfulfilled_commitment === true;
  const priorRelationship = replyConfirmed || sourceKind === 'client_request' || sourceKind === 'partner_invitation';
  let disposition = 'research_only', reason = 'no_verified_buying_intent';
  if (optOut) {
    disposition = 'do_not_contact'; reason = 'channel_opted_out';
  } else if (promiseOverdue) {
    disposition = 'fulfill_prior_commitment'; reason = 'commitment_precedes_new_pitch';
  } else if (unanswered >= 2) {
    disposition = 'waiting_reply'; reason = 'unanswered_outbound_limit_reached';
  } else if (!hasEvidence) {
    disposition = 'research_only'; reason = 'source_evidence_missing';
  } else if (!matches.length && scopedMatches.length) {
    disposition = 'scope_hypothesis_review'; reason = 'portfolio_fit_requires_buyer_and_deliverable_verification';
  } else if (!matches.length) {
    disposition = 'research_only'; reason = 'no_scoped_offer_fit';
  } else if (priorRelationship && scopeRequested && budgetConfirmed && deliveryCapacityConfirmed) {
    disposition = 'scoping_priority'; reason = 'explicit_scope_and_budget_but_not_paid';
  } else if (priorRelationship) {
    disposition = 'relationship_review'; reason = 'relationship_signal_not_purchase';
  } else {
    disposition = 'research_only'; reason = 'public_clue_not_buyer_permission';
  }

  // Reuse the existing Systemia proof-first outreach gate, never a second sender.
  const outbound = admitProofFirstOutreach({
    prospect_key: prospectKey,
    business,
    pain_evidence_state: hasEvidence ? 'source_grounded' : 'unknown',
    proof_state: raw.public_proof_verified === true ? 'public_https_verified' : 'missing',
    opted_out: optOut,
    unanswered_outbound: unanswered,
    last_outbound_at: raw.last_outbound_at,
    human_approval_state: raw.human_approval_state,
    human_approval_ref: raw.human_approval_ref,
  }, now);

  return {
    schema: 'evercraft.systemia.client-qualification.v1',
    prospect_key: prospectKey,
    business,
    source_kind: sourceKind,
    evidence_refs: evidence,
    observed_at: clean(raw.observed_at) || null,
    evidence_age_days: age === null ? null : Math.floor(age),
    score,
    disposition,
    reason,
    buyer_confirmed: false,
    paid_order_confirmed: false,
    contact_permission_inferred: false,
    matched_offers: matches.map(o => ({
      key: o.key, name: o.name, sale_state: o.sale_state,
      price_usd: o.price_usd, required_gate: o.required_gate,
      public_proof_url: o.public_proof_url,
    })),
    portfolio_scope_hypotheses: scopedMatches,
    next_action: disposition === 'scope_hypothesis_review'
      ? 'review_evidence_and_define_feasible_buyer_specific_deliverable'
      : disposition === 'scoping_priority'
      ? 'verify_scope_capacity_checkout_and_exact_buyer_terms'
      : disposition === 'relationship_review'
        ? 'review_last_exchange_then_request_specific_need_only_if_contact_permitted'
        : disposition === 'fulfill_prior_commitment'
          ? 'complete_existing_promise_before_upselling'
          : disposition === 'waiting_reply'
            ? 'wait_for_inbound'
            : disposition === 'do_not_contact'
              ? 'no_contact'
              : 'research_buyer_problem_and_permissions',
    outreach_preflight: {
      state: outbound.state, reason: outbound.reason,
      interaction_ledger_preflight_required: true,
      passport_grant_and_exact_message_permit_required: true,
      can_send_from_this_module: false,
    },
  };
}

export function rankClientSignals(signals, now = new Date(), options = {}) {
  if (!Array.isArray(signals)) throw new Error('signals_array_required');
  const seen = new Set();
  const ranked = [];
  for (const signal of signals) {
    const result = qualifyClientSignal(signal, now, options);
    if (seen.has(result.prospect_key)) {
      // Duplicate records must be reconciled, not treated as two prospects.
      continue;
    }
    seen.add(result.prospect_key);
    ranked.push(result);
  }
  const priority = { scoping_priority: 0, relationship_review: 1, scope_hypothesis_review: 2, research_only: 3,
    fulfill_prior_commitment: 4, waiting_reply: 5, do_not_contact: 6 };
  return ranked.sort((a, b) =>
    (priority[a.disposition] - priority[b.disposition]) ||
    (b.score - a.score) ||
    a.prospect_key.localeCompare(b.prospect_key)
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    process.stderr.write('Usage: node systemia/proof-first-sales/client-qualifier.mjs /path/to/private-signals.json\n');
    process.exitCode = 2;
  } else {
    // Read local authorized records only. Do not commit real customer/prospect inputs.
    const records = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const portfolioPath = process.argv[3];
    const portfolio = portfolioPath ? JSON.parse(fs.readFileSync(portfolioPath,'utf8')).scoped_portfolio_review : null;
    const painIndexPath = process.argv[4];
    if (painIndexPath && !portfolio) throw Error('scoped_portfolio_required');
    const report = painIndexPath
      ? reviewDemandBatch(records, {portfolio, painIndex:JSON.parse(fs.readFileSync(painIndexPath,'utf8')), qualify:qualifyClientSignal})
      : rankClientSignals(records, new Date(), {portfolio});
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  }
}
