import { createHash } from 'node:crypto';
import { normalizeOpportunity, assessFreshness, DEFAULT_FRESHNESS_MS } from './engine.mjs';

const canonical = (value) => JSON.stringify(value, Object.keys(value).sort());

export function emptyLedger() {
  return {
    schema: 'systemia.household-fabric.ledger.v1',
    observations: {},
    latest_by_opportunity: {},
    conflicts: [],
    receipts: [],
  };
}

export function observationFingerprint(opportunity) {
  const payload = {
    id: opportunity.id,
    source_url: opportunity.source_url,
    source_id: opportunity.source_id,
    observed_at: opportunity.observed_at,
    gross_savings_cents: opportunity.gross_savings_cents,
    gross_earnings_cents: opportunity.gross_earnings_cents,
    expires_at: opportunity.expires_at,
    evidence_state: opportunity.evidence_state,
  };
  return createHash('sha256').update(canonical(payload)).digest('hex');
}

export function ingestOpportunity(ledger, raw, options = {}) {
  const next = structuredClone(ledger ?? emptyLedger());
  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  const item = normalizeOpportunity(raw, now);
  const fingerprint = observationFingerprint(item);

  if (next.observations[fingerprint]) {
    return {
      ledger: next,
      receipt: {
        status: 'deduped',
        fingerprint,
        opportunity_id: item.id,
        observed_at: item.observed_at,
      },
    };
  }

  const priorFingerprint = next.latest_by_opportunity[item.id] ?? null;
  const prior = priorFingerprint ? next.observations[priorFingerprint] : null;

  if (prior && new Date(item.observed_at).getTime() < new Date(prior.observed_at).getTime()) {
    next.observations[fingerprint] = item;
    const receipt = {
      status: 'historical',
      fingerprint,
      opportunity_id: item.id,
      observed_at: item.observed_at,
      latest_fingerprint: priorFingerprint,
    };
    next.receipts.push(receipt);
    return { ledger: next, receipt };
  }

  if (
    prior &&
    prior.observed_at === item.observed_at &&
    (
      prior.gross_savings_cents !== item.gross_savings_cents ||
      prior.gross_earnings_cents !== item.gross_earnings_cents ||
      prior.expires_at !== item.expires_at
    )
  ) {
    next.conflicts.push({
      opportunity_id: item.id,
      prior_fingerprint: priorFingerprint,
      incoming_fingerprint: fingerprint,
      observed_at: item.observed_at,
      reason: 'same_timestamp_material_value_conflict',
      source_id: item.source_id,
      source_url: item.source_url,
    });
  }

  next.observations[fingerprint] = item;
  next.latest_by_opportunity[item.id] = fingerprint;
  const receipt = {
    status: 'accepted',
    fingerprint,
    opportunity_id: item.id,
    observed_at: item.observed_at,
    replaced_fingerprint: priorFingerprint,
  };
  next.receipts.push(receipt);
  return { ledger: next, receipt };
}

export function ingestBatch(ledger, rawItems, options = {}) {
  let next = ledger ?? emptyLedger();
  const receipts = [];
  for (const raw of rawItems ?? []) {
    const result = ingestOpportunity(next, raw, options);
    next = result.ledger;
    receipts.push(result.receipt);
  }
  return { ledger: next, receipts };
}

export function latestOpportunities(ledger) {
  return Object.values(ledger?.latest_by_opportunity ?? {})
    .map(fp => ledger.observations[fp])
    .filter(Boolean);
}

export function auditCoverage(ledger, sourceRegistry, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  const freshnessMs = options.freshness_ms ?? DEFAULT_FRESHNESS_MS;
  const latest = latestOpportunities(ledger);
  const requirements = sourceRegistry?.geographies?.[options.geography]?.coverage ?? {};
  const categories = {};

  for (const [category, rule] of Object.entries(requirements)) {
    const candidates = latest.filter(item => item.category === category);
    const fresh = candidates.filter(item => assessFreshness(item, now, freshnessMs).fresh);
    const sourceNames = new Set(fresh.map(item => item.source_name || item.source_id || item.source_url).filter(Boolean));

    const minFresh = Number(rule.min_fresh_observations ?? 1);
    const minSources = Number(rule.min_distinct_sources ?? 1);
    const healthy = fresh.length >= minFresh && sourceNames.size >= minSources;

    categories[category] = {
      healthy,
      fresh_observations: fresh.length,
      distinct_sources: sourceNames.size,
      required_fresh_observations: minFresh,
      required_distinct_sources: minSources,
      action: healthy ? 'serve' : 'degrade_and_refresh',
    };
  }

  return {
    schema: 'systemia.household-fabric.coverage.v1',
    geography: options.geography,
    generated_at: now.toISOString(),
    healthy: Object.values(categories).every(row => row.healthy),
    categories,
    conflicts_open: ledger?.conflicts?.length ?? 0,
  };
}
