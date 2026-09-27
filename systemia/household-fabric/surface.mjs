import { buildTodayBrief } from './engine.mjs';
import { auditCoverage, latestOpportunities } from './ingest.mjs';

export function buildHouseholdToday(ledger, sourceRegistry, options = {}) {
  const geography = options.geography ?? 'yakima-wa';
  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  const coverage = auditCoverage(ledger, sourceRegistry, { ...options, geography, now });
  const opportunities = latestOpportunities(ledger);
  const brief = buildTodayBrief(opportunities, { ...options, geography, now });

  const degradedCategories = Object.entries(coverage.categories)
    .filter(([, row]) => !row.healthy)
    .map(([category]) => category);

  return {
    schema: 'systemia.household-fabric.surface.v1',
    generated_at: now.toISOString(),
    geography,
    mode: options.mode ?? 'daily',
    status: coverage.healthy ? 'healthy' : 'degraded',
    coverage: {
      healthy: coverage.healthy,
      degraded_categories: degradedCategories,
      categories: coverage.categories,
      conflicts_open: coverage.conflicts_open,
    },
    headline: {
      money_kept_cents: brief.metrics.money_kept_cents,
      money_earned_cents: brief.metrics.money_earned_cents,
      opportunities_shown: brief.metrics.opportunities_shown,
    },
    opportunities: brief.opportunities.map(row => ({
      id: row.id,
      title: row.title,
      category: row.category,
      value_basis: row.value_basis,
      net_value_cents: row.value.net_value_cents,
      confidence: row.confidence,
      evidence_label: row.evidence_label,
      requires_eligibility_check: row.requires_eligibility_check,
      observed_at: row.observed_at,
      expires_at: row.expires_at,
      source_name: row.source_name,
      source_url: row.source_url,
      location: row.location,
      actions: row.actions,
      sponsored: row.sponsored,
      sponsor_label: row.sponsor_label,
    })),
    message: coverage.healthy
      ? 'Fresh local coverage is available across required lanes.'
      : 'Some local lanes are thin or stale. Results remain visible where supported, but missing coverage is not filled with guesses.',
    guardrails: brief.guardrails,
  };
}
