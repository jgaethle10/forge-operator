#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveSentinelRegionConfig } from './region-profile.mjs';
import { pollNwsActiveAlerts } from './sources/nws-alerts.mjs';
import { pollUsgsEarthquakes } from './sources/usgs-earthquakes.mjs';
import { pollUsgsWaterLatest } from './sources/usgs-water.mjs';
import { pollNwpsRiverGauges } from './sources/nwps-rivers.mjs';

const DEFAULT_PROFILE = 'yakima-basin-wa';
const MAX_HISTORY = 96;
const WATER_FRESHNESS_SECONDS = 7200;

function nowIso(value = new Date().toISOString()) {
  const n = new Date(value).getTime();
  if (!Number.isFinite(n)) throw new TypeError('now must be a valid timestamp');
  return new Date(n).toISOString();
}

function ageSeconds(timestamp, now) {
  const then = new Date(timestamp).getTime();
  const current = new Date(now).getTime();
  if (!Number.isFinite(then) || !Number.isFinite(current)) return null;
  return Math.max(0, Math.round((current - then) / 1000));
}

function hasForbiddenPrecision(value, depth = 0) {
  if (depth > 10 || value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some((item) => hasForbiddenPrecision(item, depth + 1));
  if (typeof value !== 'object') return false;
  const forbidden = new Set(['latitude', 'longitude', 'lat', 'lon', 'lng', 'geometry', 'coordinates']);
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(String(key).toLowerCase())) return true;
    if (hasForbiddenPrecision(child, depth + 1)) return true;
  }
  return false;
}

function provenanceSane(observations) {
  return observations.every((observation) =>
    String(observation?.provenance_ref || '').startsWith('https://')
  );
}

function sourceReceipt({
  sourceId,
  result,
  now,
  requireObservations = false,
  maxObservationAgeSeconds = null,
  expectedLocationIds = []
}) {
  const observations = Array.isArray(result?.observations) ? result.observations : [];
  const errors = [];

  if (result?.receipt?.status !== 'ok') {
    errors.push('source_status:' + String(result?.receipt?.status || 'missing'));
  }
  if (hasForbiddenPrecision(observations)) errors.push('precision_leak');
  if (observations.length && !provenanceSane(observations)) errors.push('invalid_provenance');
  if (requireObservations && observations.length === 0) errors.push('no_live_observations');

  let freshestObservationAgeSeconds = null;
  if (observations.length) {
    const ages = observations
      .map((observation) => ageSeconds(observation.created_at, now))
      .filter(Number.isFinite);
    if (ages.length) freshestObservationAgeSeconds = Math.min(...ages);
  }

  if (
    Number.isFinite(maxObservationAgeSeconds) &&
    (freshestObservationAgeSeconds === null || freshestObservationAgeSeconds > maxObservationAgeSeconds)
  ) {
    errors.push('stale_live_observation');
  }

  const expected = new Set((expectedLocationIds || []).map((value) => String(value).toUpperCase()));
  const observedLocations = [...new Set(
    observations
      .map((observation) => observation?.metric_metadata?.monitoring_location_id)
      .filter(Boolean)
      .map((value) => String(value).toUpperCase())
  )].sort();
  const matchedLocations = observedLocations.filter((id) => expected.has(id));

  return {
    source_id: sourceId,
    status: errors.length ? 'fail' : 'pass',
    upstream_status: result?.receipt?.status || 'missing',
    item_count: observations.length,
    checked_at: result?.receipt?.checked_at || null,
    freshest_observation_age_seconds: freshestObservationAgeSeconds,
    expected_location_count: expected.size || null,
    observed_location_count: observedLocations.length || null,
    matched_profile_locations: matchedLocations.length || null,
    precision_retained: hasForbiddenPrecision(observations),
    provenance_sane: observations.length ? provenanceSane(observations) : true,
    errors,
    upstream_error: result?.error || null
  };
}

export async function runSentinelLiveProfileCanary({
  profileId = DEFAULT_PROFILE,
  now = new Date().toISOString(),
  clients = {}
} = {}) {
  const observedAt = nowIso(now);
  const profile = resolveSentinelRegionConfig({ profileId });
  const pollers = {
    nws: clients.nws || pollNwsActiveAlerts,
    earthquakes: clients.earthquakes || pollUsgsEarthquakes,
    water: clients.water || pollUsgsWaterLatest,
    nwps: clients.nwps || pollNwpsRiverGauges
  };

  const tasks = [
    {
      sourceId: 'nws-active-alerts',
      promise: pollers.nws({ area: profile.nws_area, checkedAt: observedAt }),
      options: {}
    },
    {
      sourceId: 'usgs-earthquakes',
      promise: pollers.earthquakes({ checkedAt: observedAt }),
      options: {}
    }
  ];

  if (profile.usgs_water_locations.length) {
    tasks.push({
      sourceId: 'usgs-water-latest-continuous',
      promise: pollers.water({
        monitoringLocationIds: profile.usgs_water_locations,
        checkedAt: observedAt
      }),
      options: {
        requireObservations: true,
        maxObservationAgeSeconds: WATER_FRESHNESS_SECONDS,
        expectedLocationIds: profile.usgs_water_locations
      }
    });
  }

  if (profile.nwps_gauges.length) {
    tasks.push({
      sourceId: 'nwps-river-gauges',
      promise: pollers.nwps({ gaugeIds: profile.nwps_gauges, checkedAt: observedAt }),
      options: { requireObservations: true }
    });
  }

  const settled = await Promise.allSettled(tasks.map((task) => task.promise));
  const sources = settled.map((entry, index) => {
    const task = tasks[index];
    if (entry.status === 'rejected') {
      return {
        source_id: task.sourceId,
        status: 'fail',
        upstream_status: 'exception',
        item_count: 0,
        checked_at: observedAt,
        freshest_observation_age_seconds: null,
        expected_location_count: task.options.expectedLocationIds?.length || null,
        observed_location_count: null,
        matched_profile_locations: null,
        precision_retained: false,
        provenance_sane: true,
        errors: ['poll_exception'],
        upstream_error: String(entry.reason?.message || entry.reason)
      };
    }
    return sourceReceipt({
      sourceId: task.sourceId,
      result: entry.value,
      now: observedAt,
      ...task.options
    });
  });

  const pass = sources.every((source) => source.status === 'pass');
  return {
    schema: 'systemia.sentinel.live-profile-canary.v1',
    profile_id: profile.profile?.profile_id || profileId,
    profile_label: profile.profile?.label || null,
    observed_at: observedAt,
    pass,
    source_count: sources.length,
    passed_sources: sources.filter((source) => source.status === 'pass').length,
    failed_sources: sources.filter((source) => source.status === 'fail').length,
    sources,
    resolved_profile: {
      nws_area: profile.nws_area,
      nwps_gauge_count: profile.nwps_gauges.length,
      usgs_water_location_count: profile.usgs_water_locations.length,
      provenance_count: profile.profile?.provenance_count || 0
    },
    doctrine: {
      reachability_only: true,
      incident_ingestion: false,
      threat_decisions_emitted: 0,
      autonomous_intervention: false,
      zero_alerts_can_be_healthy: true
    }
  };
}

export function buildLiveCanaryMissionSnapshot(receipt) {
  if (!receipt || receipt.schema !== 'systemia.sentinel.live-profile-canary.v1') {
    throw new TypeError('live profile canary receipt is required');
  }

  const failed = (receipt.sources || []).filter((source) => source.status === 'fail');
  const evidenceRefs = (receipt.sources || []).map((source) => {
    const suffix = source.errors?.length
      ? ':' + source.errors.join(',')
      : ':pass';
    return 'sentinel-canary:' + receipt.profile_id + ':' + source.source_id + suffix;
  });

  return {
    schema: 'evercraft.kaidance.mission-snapshot.v1',
    snapshot_ref: 'sentinel-source-health:' + receipt.profile_id + ':' + receipt.observed_at,
    mission_key: 'evercraft-life-safety-sentinel-source-health',
    workflow_key: 'sentinel-live-profile-canary',
    cadence_seconds: 900,
    counts: {
      scanned: Number(receipt.source_count || 0),
      changed: failed.length,
      admitted: 0,
      held: failed.length
    },
    evidence_refs: evidenceRefs.slice(0, 100),
    observed_at: receipt.observed_at
  };
}

export function updateCanaryHistory(previous, receipt) {
  const priorRuns = Array.isArray(previous?.runs) ? previous.runs : [];
  const compact = {
    observed_at: receipt.observed_at,
    profile_id: receipt.profile_id,
    pass: receipt.pass,
    passed_sources: receipt.passed_sources,
    failed_sources: receipt.failed_sources,
    failures: receipt.sources
      .filter((source) => source.status === 'fail')
      .map((source) => ({ source_id: source.source_id, errors: source.errors }))
  };
  const runs = [...priorRuns, compact].slice(-MAX_HISTORY);
  let consecutivePasses = 0;
  for (let i = runs.length - 1; i >= 0; i -= 1) {
    if (!runs[i].pass) break;
    consecutivePasses += 1;
  }
  const failures = runs.filter((run) => !run.pass);
  return {
    schema: 'systemia.sentinel.live-profile-canary-history.v1',
    profile_id: receipt.profile_id,
    updated_at: receipt.observed_at,
    run_count: runs.length,
    consecutive_passes: consecutivePasses,
    last_failure_at: failures.length ? failures[failures.length - 1].observed_at : null,
    runs
  };
}

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function readJson(file, fallback) {
  if (!file || !fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

async function main() {
  const profileId = arg('--profile', process.env.SYSTEMIA_SENTINEL_REGION_PROFILE || DEFAULT_PROFILE);
  const out = path.resolve(arg('--out', 'artifacts/sentinel-live-canary/latest.json'));
  const historyPath = path.resolve(arg('--history', 'artifacts/sentinel-live-canary/history.json'));
  const missionPath = path.resolve(arg('--mission', 'artifacts/sentinel-live-canary/mission-snapshot.json'));
  const receipt = await runSentinelLiveProfileCanary({ profileId });
  const history = updateCanaryHistory(
    readJson(historyPath, { schema: 'systemia.sentinel.live-profile-canary-history.v1', profile_id: profileId, runs: [] }),
    receipt
  );
  writeJson(out, receipt);
  writeJson(historyPath, history);
  writeJson(missionPath, buildLiveCanaryMissionSnapshot(receipt));
  process.stdout.write(JSON.stringify({
    pass: receipt.pass,
    profile_id: receipt.profile_id,
    passed_sources: receipt.passed_sources,
    failed_sources: receipt.failed_sources,
    consecutive_passes: history.consecutive_passes,
    last_failure_at: history.last_failure_at
  }) + '\n');
  if (!receipt.pass) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await main();
}
