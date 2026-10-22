import { emptyLedger, ingestBatch } from './ingest.mjs';
import { buildEconomicPressureHouseholdView } from './economic-pressure-bridge.mjs';
import sourceRegistry from './source-registry.json' with { type: 'json' };
import reviewed from './economic-pressure-reviewed-snapshots.json' with { type: 'json' };
import officialReferrals from './economic-pressure-review-referrals.json' with { type: 'json' };

/**
 * Reproducible, read-only proof for the Yakima Economic Pressure Atlas bridge.
 * Produces a dated JSON contract with explicitly degraded household coverage
 * and reviewed, expiring official assistance links. No financial figures,
 * local deals, eligibility grants or live collector data are fabricated.
 */
export function buildReviewProof(now = new Date()) {
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
  // These are manually reviewed informational doors, not collected offers,
  // promises of eligibility, or attributable household savings.
  const { ledger } = ingestBatch(emptyLedger(), officialReferrals.referrals, { now });
  return buildEconomicPressureHouseholdView({
    signals: evidence,
    ledger,
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
