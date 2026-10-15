import { emptyLedger } from './ingest.mjs';
import { buildEconomicPressureHouseholdView } from './economic-pressure-bridge.mjs';
import sourceRegistry from './source-registry.json' with { type: 'json' };
import reviewed from './economic-pressure-reviewed-snapshots.json' with { type: 'json' };

/**
 * Reproducible, read-only proof for the Yakima Economic Pressure Atlas bridge.
 * Produces a dated JSON contract with explicitly degraded household coverage.
 * No financial figures, local deals or live collector data are fabricated.
 */
export function buildReviewProof(now = new Date('2026-10-14T23:30:00.000Z')) {
  const evidence = reviewed.snapshots.map(snapshot => ({
    metric: snapshot.metric,
    geography: snapshot.geography,
    value: snapshot.value,
    unit: snapshot.unit,
    observed_period: snapshot.observed_period,
    release_at: snapshot.release_at,
    evidence_state: snapshot.evidence_state,
    source_url: snapshot.source_url,
  }));
  return buildEconomicPressureHouseholdView({
    signals: evidence,
    ledger: emptyLedger(),
    sourceRegistry,
    geography: 'yakima-wa',
    now,
  });
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const proof = buildReviewProof();
  if (proof.household_opportunities.status !== 'degraded') {
    throw new Error('Safety invariant violated: uncollected opportunities cannot be presented as healthy');
  }
  process.stdout.write(JSON.stringify(proof, null, 2) + '\n');
}
