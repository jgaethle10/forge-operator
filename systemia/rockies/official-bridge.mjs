// First owned Rockies read path reuses existing Radar official-source collectors.
// This is an optional, read-only, in-process adapter: no external publication,
// private data export, resident installation, agent claims or alert dispatch.
import crypto from 'node:crypto';
import { runOfficialCollectors } from '../radar/collectors.mjs';
import { emptyContextState, ingestContextObservation } from '../worldstate/observation-fabric.mjs';

export const ROCKIES_OFFICIAL_SOURCE_CONTRACT = Object.freeze({
  'usgs-earthquakes': Object.freeze({
    range: 'seismic',
    source_url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson',
    source_family: 'usgs-earthquake-hazards'
  }),
  'noaa-space-weather': Object.freeze({
    range: 'space_weather',
    source_url: 'https://services.swpc.noaa.gov/products/alerts.json',
    source_family: 'noaa-space-weather-prediction-center'
  })
});
const validDate = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v));
const sourceDigest = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 24);
const statuses = Object.freeze({
  observed: 'observations_propagated_to_context',
  quiet: 'source_read_passed_no_new_observations',
  deduped: 'source_read_passed_no_new_context',
  failed: 'source_read_failed',
  unverified: 'source_receipt_missing_or_mismatched'
});

function verifyReceiptAndObservations(collectorRun, collector, spec) {
  const matching = (collectorRun?.receipts || []).filter((row) => row.collector === collector);
  if (matching.length !== 1) return { ok: false, reason: 'receipt_count_not_one' };
  const receipt = matching[0];
  if (receipt.status !== 'pass') return { ok: false, reason: 'collector_failed' };
  if (receipt.schema !== 'evercraft.systemia-radar.collector-receipt.v1'
      || receipt.source_url !== spec.source_url) {
    return { ok: false, reason: 'source_identity_mismatch' };
  }
  const observations = (collectorRun?.observations || []).filter(
    (observation) => observation?.metadata?.collector === collector
  );
  if (Number(receipt.observation_count) !== observations.length) {
    return { ok: false, reason: 'observation_count_mismatch' };
  }
  for (const observation of observations) {
    if (observation.source_system !== 'systemia-radar'
        || observation.source_family !== spec.source_family
        || !Array.isArray(observation.provenance_refs)
        || !observation.provenance_refs.includes(spec.source_url)
        || !validDate(observation.observed_at)) {
      return { ok: false, reason: 'observation_source_or_time_mismatch' };
    }
  }
  return { ok: true, observations };
}

/** Strictly project just the two currently implemented native Radar collector lanes. */
export function bridgeOfficialRadarRunToRockies(collectorRun, {
  contextState = emptyContextState()
} = {}) {
  if (collectorRun?.schema !== 'evercraft.systemia-radar.collector-run.v1') {
    throw new TypeError('RADAR_COLLECTOR_RUN_V1_REQUIRED');
  }
  let state = structuredClone(contextState);
  const coverage = [];
  const decisions = [];

  for (const [collector, spec] of Object.entries(ROCKIES_OFFICIAL_SOURCE_CONTRACT)) {
    const checked = verifyReceiptAndObservations(collectorRun, collector, spec);
    if (!checked.ok) {
      coverage.push({
        range: spec.range,
        collector,
        source_family: spec.source_family,
        status: checked.reason === 'collector_failed' ? statuses.failed : statuses.unverified,
        reason: checked.reason,
        projected_observations: 0,
        independent_source_families: 0
      });
      continue;
    }

    let admitted = 0;
    let duplicates = 0;
    for (const row of checked.observations) {
      // A feed's generated timestamp may change without a material state change.
      // The observed payload, rather than a polling timestamp, defines replay identity.
      const stableValue = {
        source_family: row.source_family,
        correlation_keys: row.correlation_keys || [],
        kind: row.kind,
        summary: row.summary,
        facts: row.facts || {},
        measurements: row.measurements || []
      };
      const observation = {
        ...structuredClone(row),
        observation_id: 'rockies:official:' + sourceDigest(stableValue)
      };
      const ingested = ingestContextObservation(state, observation);
      state = ingested.state;
      if (ingested.decision.action === 'propagate') admitted++;
      if (ingested.decision.action === 'deduped') duplicates++;
      decisions.push({
        range: spec.range,
        observation_id: observation.observation_id,
        action: ingested.decision.action,
        consumers: ingested.decision.consumers,
        publication_authority: false
      });
    }

    coverage.push({
      range: spec.range,
      collector,
      source_family: spec.source_family,
      status: admitted ? statuses.observed : checked.observations.length ? statuses.deduped : statuses.quiet,
      projected_observations: admitted,
      replay_deduped: duplicates,
      independent_source_families: checked.observations.length ? 1 : 0
    });
  }
  const count = coverage.reduce((n, r) => n + r.projected_observations, 0);
  return {
    schema: 'evercraft.rockies.official-bridge-receipt.v1',
    source: 'existing_systemia_radar_collectors',
    range_count_observed_in_this_cycle: coverage.filter((r) => r.projected_observations > 0).length,
    projected_observation_count: count,
    covered_source_families: coverage.filter((r) => r.projected_observations > 0).length,
    designed_range_count: 26,
    declared_baseline_logical_rockies: 99,
    active_worker_count: null,
    full_roster_runtime_verified: false,
    quiet_baselines_not_fully_integrated: true,
    coverage,
    decisions,
    contextState: state,
    publication_authority: false,
    institutional_outreach_authority: false,
    human_alert_authority: false
  };
}

/**
 * An ACTUAL bounded network read is attempted only when an authorized caller
 * invokes this function on its owned runtime. Synthetic test fetches are not
 * live proof. The public-source read is not evidence of 99 running workers.
 */
export async function runRockiesOfficialSourceCycle({
  fetchImpl = globalThis.fetch,
  now = new Date().toISOString(),
  contextState = emptyContextState()
} = {}) {
  const collectorRun = await runOfficialCollectors({ fetchImpl, now });
  return bridgeOfficialRadarRunToRockies(collectorRun, { contextState });
}
