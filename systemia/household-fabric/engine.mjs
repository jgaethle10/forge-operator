const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const DEFAULT_FRESHNESS_MS = Object.freeze({
  fuel: 6 * HOUR,
  grocery: 24 * HOUR,
  retail: 24 * HOUR,
  meal: 24 * HOUR,
  event: 72 * HOUR,
  job: 72 * HOUR,
  gig: 24 * HOUR,
  rebate: 7 * DAY,
  benefit: 7 * DAY,
  utility: 7 * DAY,
  transit: 24 * HOUR,
  service: 72 * HOUR,
  other: 24 * HOUR,
});

const money = (value) => Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0;
const dateMs = (value) => value ? new Date(value).getTime() : Number.NaN;
const text = (value) => String(value ?? '').trim();

export function normalizeOpportunity(raw, now = new Date()) {
  if (!raw || typeof raw !== 'object') throw new TypeError('opportunity must be an object');
  const category = text(raw.category).toLowerCase() || 'other';
  const observedAt = raw.observed_at || raw.updated_at || now.toISOString();
  const evidenceState = text(raw.evidence_state).toLowerCase() || 'unknown';

  if (!text(raw.id)) throw new Error('opportunity.id is required');
  if (!text(raw.title)) throw new Error('opportunity.title is required');
  if (!text(raw.source_url) && !text(raw.source_id)) throw new Error('source_url or source_id is required');

  return {
    id: text(raw.id),
    title: text(raw.title),
    category,
    description: text(raw.description),
    source_url: text(raw.source_url),
    source_id: text(raw.source_id),
    source_name: text(raw.source_name),
    observed_at: new Date(observedAt).toISOString(),
    expires_at: raw.expires_at ? new Date(raw.expires_at).toISOString() : null,
    evidence_state: evidenceState,
    confidence: Math.max(0, Math.min(1, Number(raw.confidence ?? 0.5))),
    location: raw.location ?? null,
    distance_miles: Math.max(0, Number(raw.distance_miles ?? 0)),
    travel_minutes: Math.max(0, Number(raw.travel_minutes ?? 0)),
    action_minutes: Math.max(0, Number(raw.action_minutes ?? 0)),
    action_steps: Math.max(0, Math.round(Number(raw.action_steps ?? 1))),
    gross_savings_cents: Math.max(0, money(raw.gross_savings_cents)),
    gross_earnings_cents: Math.max(0, money(raw.gross_earnings_cents)),
    eligibility: text(raw.eligibility).toLowerCase() || 'unknown',
    audience_tags: Array.isArray(raw.audience_tags) ? raw.audience_tags.map(text).filter(Boolean) : [],
    holiday_tags: Array.isArray(raw.holiday_tags) ? raw.holiday_tags.map(text).filter(Boolean) : [],
    actions: Array.isArray(raw.actions) ? raw.actions : [],
    sponsored: Boolean(raw.sponsored),
    sponsor_label: text(raw.sponsor_label),
    raw_metadata: raw.raw_metadata ?? null,
  };
}

export function assessFreshness(opportunity, now = new Date(), freshnessMs = DEFAULT_FRESHNESS_MS) {
  const nowMs = now.getTime();
  const observedMs = dateMs(opportunity.observed_at);
  const expiresMs = dateMs(opportunity.expires_at);
  const maxAge = freshnessMs[opportunity.category] ?? freshnessMs.other;

  if (!Number.isFinite(observedMs)) return { fresh: false, reason: 'missing_observed_at', age_ms: null };
  if (Number.isFinite(expiresMs) && nowMs > expiresMs) return { fresh: false, reason: 'expired', age_ms: nowMs - observedMs };
  if (nowMs - observedMs > maxAge) return { fresh: false, reason: 'stale', age_ms: nowMs - observedMs };
  return { fresh: true, reason: 'fresh', age_ms: Math.max(0, nowMs - observedMs) };
}

export function estimateHouseholdValue(opportunity, options = {}) {
  const mileageCostCents = Math.max(0, Number(options.mileage_cost_cents ?? 25));
  const timeValueCentsPerHour = Math.max(0, Number(options.time_value_cents_per_hour ?? 0));
  const frictionCentsPerStep = Math.max(0, Number(options.friction_cents_per_step ?? 0));

  const gross = opportunity.gross_savings_cents + opportunity.gross_earnings_cents;
  const travelCost = Math.round(opportunity.distance_miles * mileageCostCents);
  const minutes = opportunity.travel_minutes + opportunity.action_minutes;
  const timeCost = Math.round((minutes / 60) * timeValueCentsPerHour);
  const frictionCost = Math.round(opportunity.action_steps * frictionCentsPerStep);
  const net = gross - travelCost - timeCost - frictionCost;

  return {
    gross_value_cents: gross,
    travel_cost_cents: travelCost,
    time_cost_cents: timeCost,
    friction_cost_cents: frictionCost,
    net_value_cents: net,
  };
}

function holidayBoost(opportunity, mode) {
  if (mode !== 'holiday_pressure') return 0;
  const tags = new Set(opportunity.holiday_tags.map(x => x.toLowerCase()));
  let boost = 0;
  if (tags.has('winter-clothing')) boost += 500;
  if (tags.has('family-meal')) boost += 500;
  if (tags.has('gift')) boost += 350;
  if (tags.has('free-family-event')) boost += 250;
  if (tags.has('seasonal-work')) boost += 300;
  return boost;
}

export function rankOpportunities(rawOpportunities, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  const allowedEvidence = new Set(options.allowed_evidence_states ?? ['observed', 'public', 'licensed', 'modeled', 'inferred']);
  const rows = [];

  for (const raw of rawOpportunities ?? []) {
    const opportunity = normalizeOpportunity(raw, now);
    const freshness = assessFreshness(opportunity, now, options.freshness_ms ?? DEFAULT_FRESHNESS_MS);
    if (!freshness.fresh) continue;
    if (opportunity.eligibility === 'ineligible') continue;
    if (!allowedEvidence.has(opportunity.evidence_state)) continue;

    const value = estimateHouseholdValue(opportunity, options);
    if (value.net_value_cents <= 0 && !['event', 'benefit', 'transit'].includes(opportunity.category)) continue;

    const confidenceWeight = Math.max(0.25, opportunity.confidence);
    const uncertaintyPenalty = ['modeled', 'inferred', 'unknown'].includes(opportunity.evidence_state) ? 0.8 : 1;
    const priority_score = Math.round(
      (value.net_value_cents + holidayBoost(opportunity, options.mode)) *
      confidenceWeight *
      uncertaintyPenalty
    );

    rows.push({
      ...opportunity,
      freshness,
      value,
      priority_score,
      value_basis: opportunity.gross_earnings_cents > 0 ? 'earn' : 'save',
      evidence_label: opportunity.evidence_state,
      requires_eligibility_check: opportunity.eligibility === 'unknown',
    });
  }

  return rows.sort((a, b) =>
    b.priority_score - a.priority_score ||
    b.value.net_value_cents - a.value.net_value_cents ||
    a.distance_miles - b.distance_miles ||
    a.id.localeCompare(b.id)
  );
}

export function buildTodayBrief(rawOpportunities, options = {}) {
  const ranked = rankOpportunities(rawOpportunities, options);
  const limit = Math.max(1, Math.min(50, Number(options.limit ?? 12)));
  const selected = ranked.slice(0, limit);

  const totals = selected.reduce((acc, row) => {
    if (row.value_basis === 'earn') acc.earn_cents += row.value.net_value_cents;
    else acc.keep_cents += Math.max(0, row.value.net_value_cents);
    return acc;
  }, { keep_cents: 0, earn_cents: 0 });

  return {
    schema: 'systemia.household-fabric.today.v1',
    generated_at: (options.now instanceof Date ? options.now : new Date(options.now ?? Date.now())).toISOString(),
    geography: options.geography ?? null,
    mode: options.mode ?? 'daily',
    metrics: {
      money_kept_cents: totals.keep_cents,
      money_earned_cents: totals.earn_cents,
      opportunities_considered: (rawOpportunities ?? []).length,
      opportunities_shown: selected.length,
    },
    opportunities: selected,
    guardrails: {
      sponsorship_affects_rank: false,
      poverty_score_used: false,
      personal_data_sale_required: false,
      stale_money_claims_allowed: false,
    },
  };
}
