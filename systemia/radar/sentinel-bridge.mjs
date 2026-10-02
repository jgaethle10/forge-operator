import fs from 'node:fs';
import path from 'node:path';

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const unique = (values = []) => [...new Set((Array.isArray(values) ? values : [values]).map(clean).filter(Boolean))];

function ms(value) {
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : null;
}

function clamp01(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

function nodeByIncident(snapshot) {
  return new Map((snapshot?.event_graph?.nodes || []).map((node) => [node.incident_id, node]));
}

function clusterByIncident(snapshot) {
  const out = new Map();
  for (const cluster of snapshot?.event_graph?.clusters || []) {
    for (const incidentId of cluster.incident_ids || []) {
      if (!out.has(incidentId)) out.set(incidentId, []);
      out.get(incidentId).push(cluster);
    }
  }
  return out;
}

function levelAnomaly(level, confidence) {
  const levelWeight = {
    watch: 0.28,
    corroborating: 0.48,
    elevated: 0.72,
    urgent: 0.92
  }[String(level || '').toLowerCase()] ?? 0.25;
  return Number(clamp01(0.65 * levelWeight + 0.35 * clamp01(confidence, 0.5)).toFixed(3));
}

function sourceHealthSummary(snapshot) {
  const coverage = snapshot?.coverage || {};
  const blind = Array.isArray(coverage.blind_spots) ? coverage.blind_spots : [];
  return {
    healthy: coverage.healthy === true,
    required_source_coverage_ratio: Number(coverage.required_source_coverage_ratio ?? 0),
    blind_spot_count: blind.length,
    blind_spots: blind.map((row) => ({
      source_id: clean(row.source_id),
      domain: clean(row.domain),
      independence_group: clean(row.independence_group),
      reason: clean(row.reason)
    }))
  };
}

export function sentinelSnapshotToRadarObservations(snapshot, {
  min_level = 'corroborating'
} = {}) {
  if (!snapshot || snapshot.schema !== 'systemia.sentinel.resident-cycle.v1') {
    throw new TypeError('Systemia Sentinel resident-cycle snapshot is required');
  }

  const threshold = { watch: 0, corroborating: 1, elevated: 2, urgent: 3 }[
    String(min_level || 'corroborating').toLowerCase()
  ] ?? 1;
  const nodes = nodeByIncident(snapshot);
  const clusters = clusterByIncident(snapshot);
  const coverage = sourceHealthSummary(snapshot);
  const observations = [];

  for (const picture of snapshot.operator_pictures || []) {
    const level = String(picture.level || 'watch').toLowerCase();
    const levelScore = { watch: 0, corroborating: 1, elevated: 2, urgent: 3 }[level] ?? 0;
    if (levelScore < threshold) continue;

    const node = nodes.get(picture.incident_id) || null;
    const relatedClusters = clusters.get(picture.incident_id) || [];
    const clusterPatterns = unique(relatedClusters.map((cluster) => cluster.pattern));
    const provenanceRefs = unique(node?.provenance_refs || []);
    const domains = unique(picture.domains || node?.domains || ['general']).map((x) => x.toLowerCase());
    const region = clean(picture.region_key || node?.region_key || 'global');
    const observedAt = clean(picture.last_seen_at || node?.last_seen_at || snapshot.observed_at);

    observations.push({
      observation_id: `sentinel-radar:${clean(picture.incident_id)}:${observedAt}`,
      source_system: 'systemia-sentinel',
      source_family: 'systemia-sentinel-derived',
      observed_at: observedAt,
      region_key: region,
      domains,
      kind: 'sentinel_cross_domain_assessment',
      evidence_state: 'modeled',
      reliability: clamp01(
        0.45 +
        0.08 * Number(picture.independent_source_groups?.length || 0) +
        0.08 * Number(picture.verified_observations || 0),
        0.55
      ),
      anomaly_score: levelAnomaly(level, picture.confidence),
      summary: `Systemia Sentinel classifies ${picture.incident_id} in ${region} as ${level}; ${Number(picture.independent_source_groups?.length || 0)} independent upstream group(s) span ${domains.length} domain(s), while attribution remains unresolved.`,
      provenance_refs: provenanceRefs,
      correlation_keys: [
        `sentinel:incident:${clean(picture.incident_id)}`,
        ...relatedClusters.map((cluster) => `sentinel:cluster:${clean(cluster.cluster_id)}`)
      ],
      facts: {
        subject_key: `sentinel:incident:${clean(picture.incident_id)}`,
        subject: `Systemia Sentinel incident ${clean(picture.incident_id)}`,
        sentinel_level: level,
        sentinel_confidence: Number(picture.confidence || 0),
        attribution: clean(picture.attribution || 'unresolved'),
        causal_state: 'unresolved',
        independent_upstream_groups: unique(picture.independent_source_groups || []),
        raw_source_families: unique(picture.source_families || []),
        verified_observations: Number(picture.verified_observations || 0),
        confirmed_hazard: picture.confirmed_hazard === true,
        event_graph_patterns: clusterPatterns,
        source_coverage_healthy: coverage.healthy,
        source_coverage_ratio: coverage.required_source_coverage_ratio,
        durable_record: false
      },
      metadata: {
        bridge: 'systemia-sentinel',
        derived_assessment: true,
        upstream_independence_groups: unique(picture.independent_source_groups || []),
        upstream_source_families: unique(picture.source_families || []),
        sentinel_snapshot_observed_at: snapshot.observed_at,
        sentinel_cycle_count: Number(snapshot.cycle_count || 0)
      }
    });
  }

  return {
    schema: 'evercraft.systemia-radar.sentinel-bridge-batch.v1',
    source_snapshot_at: snapshot.observed_at,
    source_cycle_count: Number(snapshot.cycle_count || 0),
    coverage,
    observations
  };
}

export function readSentinelRadarBridge({
  stateDir = path.resolve('artifacts', 'sentinel-resident'),
  now = new Date().toISOString(),
  maxAgeSeconds = 180,
  minLevel = 'corroborating'
} = {}) {
  const latestFile = path.join(stateDir, 'latest.json');
  const checkedAt = new Date(now).toISOString();

  if (!fs.existsSync(latestFile)) {
    return {
      schema: 'evercraft.systemia-radar.upstream-bridge-receipt.v1',
      bridge: 'systemia-sentinel',
      status: 'not_configured',
      checked_at: checkedAt,
      source_file: latestFile,
      observation_count: 0,
      batch: null,
      note: 'Sentinel resident snapshot is not present on this runtime.'
    };
  }

  try {
    const snapshot = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
    if (snapshot.schema !== 'systemia.sentinel.resident-cycle.v1') {
      throw new Error('unexpected Sentinel snapshot schema');
    }

    const observedMs = ms(snapshot.observed_at);
    const nowMs = ms(checkedAt);
    if (observedMs == null || nowMs == null) throw new Error('invalid Sentinel snapshot timestamp');
    const ageSeconds = Math.max(0, Math.round((nowMs - observedMs) / 1000));
    if (ageSeconds > Math.max(30, Number(maxAgeSeconds) || 180)) {
      return {
        schema: 'evercraft.systemia-radar.upstream-bridge-receipt.v1',
        bridge: 'systemia-sentinel',
        status: 'failed',
        checked_at: checkedAt,
        source_file: latestFile,
        source_observed_at: snapshot.observed_at,
        age_seconds: ageSeconds,
        error: 'sentinel_snapshot_stale',
        observation_count: 0,
        batch: null
      };
    }

    const batch = sentinelSnapshotToRadarObservations(snapshot, { min_level: minLevel });
    return {
      schema: 'evercraft.systemia-radar.upstream-bridge-receipt.v1',
      bridge: 'systemia-sentinel',
      status: 'pass',
      checked_at: checkedAt,
      source_file: latestFile,
      source_observed_at: snapshot.observed_at,
      age_seconds: ageSeconds,
      observation_count: batch.observations.length,
      coverage: batch.coverage,
      batch
    };
  } catch (error) {
    return {
      schema: 'evercraft.systemia-radar.upstream-bridge-receipt.v1',
      bridge: 'systemia-sentinel',
      status: 'failed',
      checked_at: checkedAt,
      source_file: latestFile,
      observation_count: 0,
      batch: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
