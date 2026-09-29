import { createHash } from 'node:crypto';
import { rankOpportunities } from './engine.mjs';

const HOUR = 60 * 60 * 1000;
const FRESHNESS_MS = Object.freeze({
  fuel: 6 * HOUR,
  grocery: 24 * HOUR,
});

const clean = (value) => String(value ?? '').trim();
const timeMs = (value) => value ? new Date(value).getTime() : Number.NaN;
const sourceKey = (row) => clean(row.source_name || row.source_id || row.source_url);

function hashId(...parts) {
  return createHash('sha256')
    .update(parts.map(clean).join('|').toLowerCase())
    .digest('hex')
    .slice(0, 20);
}

export function normalizePriceObservation(raw, now = new Date()) {
  if (!raw || typeof raw !== 'object') throw new TypeError('price observation must be an object');
  const category = clean(raw.category).toLowerCase();
  if (!['fuel', 'grocery'].includes(category)) throw new Error('unsupported price category');

  const id = clean(raw.id);
  const itemKey = clean(raw.item_key).toLowerCase();
  const itemLabel = clean(raw.item_label) || itemKey;
  const unit = clean(raw.unit).toLowerCase();
  const sourceUrl = clean(raw.source_url);
  const sourceId = clean(raw.source_id);
  const observedAt = raw.observed_at || now.toISOString();
  const price = Number(raw.price_cents_per_unit);

  if (!id) throw new Error('price observation id is required');
  if (!itemKey) throw new Error('item_key is required');
  if (!unit) throw new Error('unit is required');
  if (!sourceUrl && !sourceId) throw new Error('source_url or source_id is required');
  if (!Number.isFinite(price) || price < 0) throw new Error('price_cents_per_unit must be a non-negative number');

  const observedMs = timeMs(observedAt);
  if (!Number.isFinite(observedMs)) throw new Error('observed_at must be a valid date-time');

  return {
    id,
    item_key: itemKey,
    item_label: itemLabel,
    category,
    unit,
    price_cents_per_unit: price,
    observed_at: new Date(observedAt).toISOString(),
    source_url: sourceUrl,
    source_id: sourceId,
    source_name: clean(raw.source_name),
    evidence_state: clean(raw.evidence_state).toLowerCase() || 'unknown',
    confidence: Math.max(0, Math.min(1, Number(raw.confidence ?? 0.5))),
    location: raw.location ?? null,
    distance_miles: Math.max(0, Number(raw.distance_miles ?? 0)),
    travel_minutes: Math.max(0, Number(raw.travel_minutes ?? 0)),
    sponsored: Boolean(raw.sponsored),
    sponsor_label: clean(raw.sponsor_label),
  };
}

export function isFreshPriceObservation(observation, now = new Date()) {
  const limit = FRESHNESS_MS[observation.category];
  const observed = timeMs(observation.observed_at);
  const ageMs = now.getTime() - observed;
  return {
    fresh: Number.isFinite(observed) && ageMs >= 0 && ageMs <= limit,
    age_ms: Number.isFinite(observed) ? Math.max(0, ageMs) : null,
    max_age_ms: limit,
  };
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

export function buildLocalPriceIndex(rawObservations, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  const minimumDistinctSources = Math.max(2, Number(options.minimum_distinct_sources ?? 2));
  const defaultQuantity = Math.max(0.01, Number(options.quantity ?? 1));
  const allowedEvidence = new Set(options.allowed_evidence_states ?? ['observed', 'public', 'licensed']);
  const normalized = (rawObservations ?? []).map(row => normalizePriceObservation(row, now));
  const fresh = normalized.filter(row =>
    isFreshPriceObservation(row, now).fresh &&
    allowedEvidence.has(row.evidence_state)
  );

  const groups = new Map();
  for (const row of fresh) {
    const key = row.category + '|' + row.item_key + '|' + row.unit;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const indexes = [];
  const rawOpportunities = [];

  for (const [key, rows] of groups.entries()) {
    const sources = new Set(rows.map(sourceKey).filter(Boolean));
    const benchmark = sources.size >= minimumDistinctSources
      ? median(rows.map(row => row.price_cents_per_unit))
      : null;
    const [category, itemKey, unit] = key.split('|');
    const quantity = Math.max(
      0.01,
      Number(options.quantity_by_item?.[itemKey] ?? defaultQuantity)
    );

    indexes.push({
      item_key: itemKey,
      item_label: rows[0]?.item_label || itemKey,
      category,
      unit,
      fresh_observations: rows.length,
      distinct_sources: sources.size,
      minimum_distinct_sources: minimumDistinctSources,
      benchmark_cents_per_unit: benchmark,
      benchmark_state: benchmark == null ? 'insufficient_source_diversity' : 'fresh_local_median',
      quantity,
    });

    if (benchmark == null) continue;

    for (const row of rows) {
      const grossSavings = Math.round((benchmark - row.price_cents_per_unit) * quantity);
      if (grossSavings <= 0) continue;

      rawOpportunities.push({
        id: 'price-' + hashId(row.id, itemKey, quantity),
        title: row.item_label + ' below local benchmark',
        description: row.price_cents_per_unit.toFixed(1) + '¢/' + unit +
          ' vs ' + benchmark.toFixed(1) + '¢ local median',
        category,
        source_url: row.source_url,
        source_id: row.source_id,
        source_name: row.source_name,
        observed_at: row.observed_at,
        evidence_state: row.evidence_state,
        confidence: row.confidence,
        eligibility: 'verified',
        gross_savings_cents: grossSavings,
        gross_earnings_cents: 0,
        distance_miles: row.distance_miles,
        travel_minutes: row.travel_minutes,
        sponsored: row.sponsored,
        sponsor_label: row.sponsor_label,
        location: row.location,
        actions: row.source_url ? [{
          type: 'view_source',
          label: 'View source',
          url: row.source_url,
        }] : [],
        raw_metadata: {
          source_kind: 'price_observation',
          observation_id: row.id,
          item_key: itemKey,
          item_label: row.item_label,
          unit,
          price_cents_per_unit: row.price_cents_per_unit,
          benchmark_cents_per_unit: benchmark,
          benchmark_state: 'fresh_local_median',
          comparison_quantity: quantity,
          gross_savings_cents: grossSavings,
        },
      });
    }
  }

  const opportunities = rankOpportunities(rawOpportunities, {
    ...options,
    now,
  });

  return {
    schema: 'systemia.household-fabric.price-index.v1',
    generated_at: now.toISOString(),
    indexes: indexes.sort((a, b) => a.item_key.localeCompare(b.item_key)),
    opportunities,
    guardrails: {
      stale_observations_used: false,
      benchmark_requires_source_diversity: true,
      sponsorship_affects_benchmark: false,
      sponsorship_affects_rank: false,
      missing_benchmark_imputed: false,
    },
  };
}
