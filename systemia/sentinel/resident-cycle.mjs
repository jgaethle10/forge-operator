import { emptyState, ingestObservation, toSignalFabricRecord } from './engine.mjs';
import {
  emptySourceHealthState,
  recordSourceReceipt,
  evaluateSourceCoverage,
  coverageToSignal
} from './source-health.mjs';
import { buildRegionalEventGraph } from './event-graph.mjs';
import { buildOperatorPicture } from './operator-picture.mjs';
import { emptyBaselineState, scoreAgainstBaseline } from './baseline.mjs';
import {
  pollNwsActiveAlerts,
  NWS_SOURCE_CONTRACT
} from './sources/nws-alerts.mjs';
import {
  pollUsgsEarthquakes,
  USGS_SOURCE_CONTRACT
} from './sources/usgs-earthquakes.mjs';
import {
  pollNwpsRiverGauges,
  NWPS_SOURCE_CONTRACT
} from './sources/nwps-rivers.mjs';
import {
  pollUsgsWaterLatest,
  USGS_WATER_SOURCE_CONTRACT
} from './sources/usgs-water.mjs';

export const BUILTIN_SENTINEL_SOURCES = Object.freeze([
  {
    source_id: NWS_SOURCE_CONTRACT.source_id,
    contract: NWS_SOURCE_CONTRACT,
    poll_interval_seconds: 60,
    poll: pollNwsActiveAlerts
  },
  {
    source_id: USGS_SOURCE_CONTRACT.source_id,
    contract: USGS_SOURCE_CONTRACT,
    poll_interval_seconds: 60,
    poll: pollUsgsEarthquakes
  }
]);

export function buildBuiltinSentinelSources({ nwpsGaugeIds = [], usgsWaterLocationIds = [] } = {}) {
  const sources = [...BUILTIN_SENTINEL_SOURCES];
  const gaugeIds = [...new Set((nwpsGaugeIds || []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (gaugeIds.length) {
    sources.push({
      source_id: NWPS_SOURCE_CONTRACT.source_id,
      contract: NWPS_SOURCE_CONTRACT,
      poll_interval_seconds: 300,
      poll: (options = {}) => pollNwpsRiverGauges({ ...options, gaugeIds })
    });
  }
  const locations = [...new Set((usgsWaterLocationIds || []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (locations.length) {
    sources.push({
      source_id: USGS_WATER_SOURCE_CONTRACT.source_id,
      contract: USGS_WATER_SOURCE_CONTRACT,
      poll_interval_seconds: 300,
      poll: (options = {}) => pollUsgsWaterLatest({ ...options, monitoringLocationIds: locations })
    });
  }
  return sources;
}

const LEVEL_SCORE = Object.freeze({
  watch: 0,
  corroborating: 1,
  elevated: 2,
  urgent: 3
});

function atMs(value, name = 'timestamp') {
  const n = new Date(value).getTime();
  if (!Number.isFinite(n)) throw new TypeError(name + ' must be a valid timestamp');
  return n;
}

function deterministicJitterSeconds(sourceId, at, maxJitterSeconds = 7) {
  const max = Math.max(0, Math.floor(Number(maxJitterSeconds) || 0));
  if (!max) return 0;
  const text = String(sourceId) + '|' + String(at);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % (max + 1);
}

export function emptyResidentState() {
  return {
    schema: 'systemia.sentinel.resident-state.v1',
    cycle_count: 0,
    last_cycle_at: null,
    sentinel_state: emptyState(),
    source_health_state: emptySourceHealthState(),
    baseline_state: emptyBaselineState(),
    source_schedule: {}
  };
}

export function computeNextPollAt({
  source,
  receipt,
  sourceHealthState,
  checkedAt,
  maxBackoffSeconds = 900,
  maxJitterSeconds = 7
}) {
  const baseSeconds = Math.max(
    30,
    Number(source?.poll_interval_seconds || source?.contract?.poll_interval_seconds || 60)
  );
  const sourceId = source.source_id || source.contract?.source_id;
  const health = sourceHealthState?.sources?.[sourceId] || null;
  const failures = receipt?.status === 'error'
    ? Math.max(1, Number(health?.consecutive_failures || 1))
    : 0;
  const backoff = failures
    ? Math.min(maxBackoffSeconds, baseSeconds * (2 ** Math.min(6, failures - 1)))
    : baseSeconds;
  const jitter = deterministicJitterSeconds(sourceId, checkedAt, maxJitterSeconds);
  return new Date(atMs(checkedAt) + (backoff + jitter) * 1000).toISOString();
}

function sourceDue(state, source, nowMs) {
  const next = state.source_schedule?.[source.source_id]?.next_poll_at;
  if (!next) return true;
  return atMs(next, 'next_poll_at') <= nowMs;
}

function pruneSentinelState(inputState, now, {
  incidentRetentionSeconds = 86400,
  maxIncidents = 1000
} = {}) {
  const state = structuredClone(inputState || emptyState());
  const nowMs = atMs(now, 'now');
  const cutoff = nowMs - Math.max(3600, Number(incidentRetentionSeconds) || 86400) * 1000;

  const incidents = Object.values(state.incidents || {})
    .filter((incident) => {
      const last = atMs(incident.last_seen_at, 'incident.last_seen_at');
      return last >= cutoff;
    })
    .sort((a, b) => atMs(b.last_seen_at) - atMs(a.last_seen_at))
    .slice(0, Math.max(10, Number(maxIncidents) || 1000));

  const keep = new Set(incidents.map((incident) => incident.id));
  state.incidents = Object.fromEntries(incidents.map((incident) => [incident.id, incident]));
  state.observation_ids = Object.fromEntries(
    Object.entries(state.observation_ids || {})
      .filter(([, incidentId]) => keep.has(incidentId))
  );

  return state;
}

function incidentRank(incident) {
  return (
    (LEVEL_SCORE[incident.assessment?.level] || 0) * 1000 +
    Number(incident.assessment?.confidence || 0) * 100
  );
}

function summarizePoll(sourceId, result, due) {
  return {
    source_id: sourceId,
    due,
    status: result?.receipt?.status || (due ? 'error' : 'skipped_not_due'),
    item_count: result?.receipt?.item_count ?? 0,
    checked_at: result?.receipt?.checked_at || null,
    error: result?.error || null
  };
}

export async function runSentinelResidentCycle({
  inputState = null,
  now = new Date().toISOString(),
  sources = BUILTIN_SENTINEL_SOURCES,
  sourceOptions = {},
  eventGraphWindowSeconds = 1800,
  maxOperatorPictures = 50,
  incidentRetentionSeconds = 86400,
  maxIncidents = 1000,
  maxObservationsPerSourcePerCycle = 1000
} = {}) {
  const state = structuredClone(inputState || emptyResidentState());
  if (state.schema !== 'systemia.sentinel.resident-state.v1') {
    throw new TypeError('resident state schema is invalid');
  }

  const nowIso = new Date(atMs(now, 'now')).toISOString();
  const nowMs = atMs(nowIso);
  state.cycle_count = Number(state.cycle_count || 0) + 1;
  state.last_cycle_at = nowIso;
  state.sentinel_state = pruneSentinelState(
    state.sentinel_state,
    nowIso,
    { incidentRetentionSeconds, maxIncidents }
  );
  state.source_health_state = state.source_health_state || emptySourceHealthState();
  state.baseline_state = state.baseline_state || emptyBaselineState();
  state.source_schedule = state.source_schedule || {};

  const pollResults = [];
  const cycleDecisions = [];

  for (const source of sources) {
    const due = sourceDue(state, source, nowMs);
    if (!due) {
      pollResults.push(summarizePoll(source.source_id, null, false));
      continue;
    }

    let result;
    try {
      result = await source.poll({
        ...(sourceOptions[source.source_id] || {}),
        checkedAt: nowIso
      });
    } catch (error) {
      result = {
        contract: source.contract,
        receipt: {
          source_id: source.source_id,
          status: 'error',
          checked_at: nowIso,
          item_count: 0,
          error_code: String(error?.message || error).slice(0, 120)
        },
        observations: [],
        error: String(error?.message || error)
      };
    }

    state.source_health_state = recordSourceReceipt(
      state.source_health_state,
      result.receipt
    );

    state.source_schedule[source.source_id] = {
      source_id: source.source_id,
      last_poll_at: nowIso,
      last_status: result.receipt.status,
      next_poll_at: computeNextPollAt({
        source,
        receipt: result.receipt,
        sourceHealthState: state.source_health_state,
        checkedAt: nowIso
      })
    };

    const observations = Array.isArray(result.observations)
      ? result.observations.slice(0, Math.max(1, Number(maxObservationsPerSourcePerCycle) || 1000))
      : [];

    for (const observation of observations) {
      let candidate = observation;
      let baseline = null;

      if (Number.isFinite(Number(observation.metric_value))) {
        const scored = scoreAgainstBaseline(state.baseline_state, {
          region_key: observation.region_key,
          domain: observation.domain,
          kind: observation.baseline_kind || observation.kind,
          value: Number(observation.metric_value),
          created_at: observation.created_at
        }, observation.baseline_options || {});
        state.baseline_state = scored.state;
        baseline = scored.result;

        if (!baseline.baseline_ready || baseline.anomaly_score <= 0) {
          cycleDecisions.push({
            source_id: source.source_id,
            observation_id: observation.observation_id,
            action: 'baseline_learning',
            duplicate: false,
            material: false,
            baseline
          });
          continue;
        }

        candidate = {
          ...observation,
          anomaly_score: baseline.anomaly_score
        };
      }

      const ingested = ingestObservation(state.sentinel_state, candidate);
      state.sentinel_state = ingested.state;
      cycleDecisions.push({
        source_id: source.source_id,
        observation_id: candidate.observation_id,
        material: true,
        baseline,
        ...ingested.decision
      });
    }

    pollResults.push(summarizePoll(source.source_id, result, true));
  }

  const contracts = sources.map((source) => source.contract);
  const coverage = evaluateSourceCoverage(state.source_health_state, contracts, nowIso);
  const coverageSignal = coverageToSignal(coverage);
  const graph = buildRegionalEventGraph(state.sentinel_state, {
    edgeWindowSeconds: eventGraphWindowSeconds,
    generatedAt: nowIso
  });

  const incidents = Object.values(state.sentinel_state.incidents || {})
    .filter((incident) => incident.open !== false)
    .sort((a, b) => incidentRank(b) - incidentRank(a));

  const operatorPictures = incidents
    .slice(0, Math.max(1, Number(maxOperatorPictures) || 50))
    .map(buildOperatorPicture);

  const incidentSignals = incidents
    .filter((incident) => ['elevated', 'urgent'].includes(incident.assessment?.level))
    .map(toSignalFabricRecord);

  const signals = [coverageSignal, ...incidentSignals];
  const urgentIncidents = incidents.filter((incident) => incident.assessment?.level === 'urgent');
  const elevatedIncidents = incidents.filter((incident) => incident.assessment?.level === 'elevated');

  const snapshot = {
    schema: 'systemia.sentinel.resident-cycle.v1',
    cycle_count: state.cycle_count,
    observed_at: nowIso,
    coverage,
    source_polls: pollResults,
    summary: {
      sources_configured: sources.length,
      sources_polled: pollResults.filter((row) => row.due).length,
      sources_deferred: pollResults.filter((row) => !row.due).length,
      coverage_healthy: coverage.healthy,
      blind_spots: coverage.blind_spots.length,
      active_incidents: incidents.length,
      elevated_incidents: elevatedIncidents.length,
      urgent_incidents: urgentIncidents.length,
      regional_clusters: graph.cluster_count,
      signals: signals.length
    },
    event_graph: graph,
    operator_pictures: operatorPictures,
    signals,
    cycle_decisions: cycleDecisions,
    doctrine: {
      sensor_failure_is_not_threat_evidence: true,
      graph_cooccurrence_is_not_causation: true,
      attribution_remains_unresolved_without_authorized_evidence: true,
      autonomous_intervention: false
    }
  };

  return { state, snapshot };
}


export function buildSentinelMissionSnapshot(snapshot) {
  if (!snapshot || snapshot.schema !== 'systemia.sentinel.resident-cycle.v1') {
    throw new TypeError('resident cycle snapshot is required');
  }

  const evidenceRefs = [...new Set([
    ...(snapshot.operator_pictures || []).flatMap((picture) =>
      picture?.hypothesis_review?.hypotheses
        ? []
        : []
    ),
    ...(snapshot.event_graph?.nodes || []).flatMap((node) => node.provenance_refs || []),
    ...(snapshot.coverage?.blind_spots || []).map((row) => 'source-health:' + row.source_id)
  ].filter(Boolean))].slice(0, 500);

  const changed = (snapshot.cycle_decisions || []).filter((row) => !row.duplicate && row.material !== false).length;
  const admitted =
    Number(snapshot.summary?.elevated_incidents || 0) +
    Number(snapshot.summary?.urgent_incidents || 0);
  const held = Number(snapshot.summary?.blind_spots || 0);
  const scanned =
    Number(snapshot.summary?.sources_polled || 0) +
    (snapshot.cycle_decisions || []).length;

  return {
    schema: 'evercraft.kaidance.mission-snapshot.v1',
    snapshot_ref: 'sentinel-life-safety:' + snapshot.observed_at,
    mission_key: 'evercraft-life-safety-sentinel',
    workflow_key: 'sentinel-life-safety-resident',
    cadence_seconds: 30,
    counts: {
      scanned,
      changed,
      admitted,
      held
    },
    evidence_refs: evidenceRefs,
    observed_at: snapshot.observed_at
  };
}
