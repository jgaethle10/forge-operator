const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const DEFAULT_PRICE_FRESHNESS_MS = Object.freeze({
  fuel: 6 * HOUR,
  grocery: 24 * HOUR,
  retail: 24 * HOUR,
  meal: 24 * HOUR,
  service: 72 * HOUR,
  other: 24 * HOUR,
});

const clean = (value) => String(value ?? '').trim();
const finiteInt = (value, field) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(field + ' must be a non-negative integer');
  return number;
};

export function normalizePriceObservation(raw, now = new Date()) {
  if (!raw || typeof raw !== 'object') throw new TypeError('price observation must be an object');

  const id = clean(raw.id);
  const itemKey = clean(raw.item_key);
  const category = clean(raw.category).toLowerCase() || 'other';
  const locationId = clean(raw.location_id);
  const unit = clean(raw.unit);
  const sourceClass = clean(raw.source_class).toLowerCase();
  const sourceId = clean(raw.source_id);
  const observedAt = new Date(raw.observed_at ?? now).toISOString();

  if (!id) throw new Error('id is required');
  if (!itemKey) throw new Error('item_key is required');
  if (!locationId) throw new Error('location_id is required');
  if (!unit) throw new Error('unit is required');
  if (!sourceClass) throw new Error('source_class is required');
  if (!sourceId) throw new Error('source_id is required');

  const priceMicrosPerUnit = finiteInt(raw.price_micros_per_unit, 'price_micros_per_unit');

  return {
    id,
    item_key: itemKey,
    category,
    location_id: locationId,
    location_label: clean(raw.location_label),
    unit,
    price_micros_per_unit: priceMicrosPerUnit,
    observed_at: observedAt,
    source_class: sourceClass,
    source_id: sourceId,
    source_url: clean(raw.source_url),
    reporter_id: clean(raw.reporter_id),
    evidence_receipt_sha256: clean(raw.evidence_receipt_sha256),
    confidence: Math.max(0, Math.min(1, Number(raw.confidence ?? 0.5))),
    raw_metadata: raw.raw_metadata ?? null,
  };
}

export function isFreshPrice(observation, now = new Date(), freshnessMs = DEFAULT_PRICE_FRESHNESS_MS) {
  const maxAge = freshnessMs[observation.category] ?? freshnessMs.other;
  const age = now.getTime() - new Date(observation.observed_at).getTime();
  return age >= 0 && age <= maxAge;
}

const median = (values) => {
  const sorted = [...values].sort((a,b) => a-b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

function canStandAlone(row) {
  return ['official_public', 'merchant_public', 'licensed_feed', 'partner_feed'].includes(row.source_class)
    && Boolean(row.evidence_receipt_sha256 || row.source_url);
}

export function reconcilePriceGroup(rawObservations, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  const toleranceBps = Math.max(1, Number(options.tolerance_bps ?? 150));
  const minimumCommunityReporters = Math.max(2, Number(options.minimum_community_reporters ?? 2));

  const rows = (rawObservations ?? [])
    .map(raw => normalizePriceObservation(raw, now))
    .filter(row => isFreshPrice(row, now, options.freshness_ms ?? DEFAULT_PRICE_FRESHNESS_MS));

  if (!rows.length) {
    return {
      state: 'unavailable',
      price_micros_per_unit: null,
      observations_used: 0,
      distinct_reporters: 0,
      reason: 'no_fresh_observations',
    };
  }

  const keys = new Set(rows.map(row => row.item_key + '|' + row.location_id + '|' + row.unit));
  if (keys.size !== 1) throw new Error('price group must contain one item, location, and unit');

  const authoritative = rows.filter(canStandAlone);
  const community = rows.filter(row => row.source_class === 'community_observation');
  const communityReporterIds = new Set(community.map(row => row.reporter_id).filter(Boolean));

  let eligible;
  let evidenceState;
  if (authoritative.length) {
    eligible = authoritative;
    evidenceState = 'source_backed';
  } else if (communityReporterIds.size >= minimumCommunityReporters) {
    eligible = community;
    evidenceState = 'community_corroborated';
  } else {
    return {
      state: 'unconfirmed',
      price_micros_per_unit: null,
      observations_used: rows.length,
      distinct_reporters: communityReporterIds.size,
      reason: 'insufficient_independent_corroboration',
    };
  }

  const center = median(eligible.map(row => row.price_micros_per_unit));
  const maxDeviationBps = Math.max(...eligible.map(row =>
    center === 0 ? 0 : Math.round(Math.abs(row.price_micros_per_unit - center) / center * 10000)
  ));

  if (maxDeviationBps > toleranceBps) {
    return {
      state: 'disputed',
      price_micros_per_unit: center,
      observations_used: eligible.length,
      distinct_reporters: communityReporterIds.size,
      reason: 'material_price_disagreement',
      max_deviation_bps: maxDeviationBps,
      evidence_state: evidenceState,
    };
  }

  return {
    state: 'confirmed',
    price_micros_per_unit: center,
    observations_used: eligible.length,
    distinct_reporters: communityReporterIds.size,
    max_deviation_bps: maxDeviationBps,
    evidence_state: evidenceState,
    item_key: eligible[0].item_key,
    category: eligible[0].category,
    location_id: eligible[0].location_id,
    location_label: eligible[0].location_label,
    unit: eligible[0].unit,
    freshest_observed_at: eligible
      .map(row => row.observed_at)
      .sort()
      .at(-1),
    source_ids: [...new Set(eligible.map(row => row.source_id))],
  };
}

export function compareConfirmedPrices(groups) {
  const confirmed = (groups ?? [])
    .filter(group => group?.state === 'confirmed' && Number.isInteger(group.price_micros_per_unit))
    .sort((a,b) =>
      a.price_micros_per_unit - b.price_micros_per_unit ||
      String(a.location_id).localeCompare(String(b.location_id))
    );

  return {
    schema: 'systemia.household-fabric.price-comparison.v1',
    state: confirmed.length ? 'available' : 'unavailable',
    cheapest: confirmed[0] ?? null,
    alternatives: confirmed.slice(1),
    monetary_savings_claimed: false,
  };
}

export function quoteSavings({ selected_price_micros_per_unit, baseline_price_micros_per_unit, quantity }) {
  const selected = finiteInt(selected_price_micros_per_unit, 'selected_price_micros_per_unit');
  const baseline = finiteInt(baseline_price_micros_per_unit, 'baseline_price_micros_per_unit');
  const units = Number(quantity);

  if (!Number.isFinite(units) || units <= 0) throw new Error('quantity must be a positive number');

  const differenceMicros = Math.max(0, baseline - selected);
  const savingsCents = Math.floor((differenceMicros * units) / 10000);

  return {
    schema: 'systemia.household-fabric.price-quote.v1',
    selected_price_micros_per_unit: selected,
    baseline_price_micros_per_unit: baseline,
    quantity: units,
    gross_savings_cents: savingsCents,
    derived_from_explicit_quantity: true,
  };
}
