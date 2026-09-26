const EVIDENCE_WEIGHT = Object.freeze({
  modeled: 0.35,
  reported: 0.5,
  observed: 0.8,
  verified: 1
});

const LEVEL_ORDER = Object.freeze({
  watch: 0,
  corroborating: 1,
  elevated: 2,
  urgent: 3
});

const ALLOWED_ACTIONS = new Set([
  'observe',
  'request_corroboration',
  'alert_operator',
  'recommend_passive_protection',
  'prepare_authorized_handoff',
  'record_recovery'
]);

const round3 = (value) => Math.round(value * 1000) / 1000;
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value)));

function requireText(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(name + ' must be a non-empty string');
  }
  return value.trim();
}

function normalizeObservation(raw) {
  const evidenceState = String(raw.evidence_state || 'reported').toLowerCase();
  if (!(evidenceState in EVIDENCE_WEIGHT)) {
    throw new TypeError('evidence_state must be modeled, reported, observed, or verified');
  }

  const createdAt = new Date(raw.created_at);
  if (!Number.isFinite(createdAt.getTime())) {
    throw new TypeError('created_at must be a valid timestamp');
  }

  const hazardState = String(raw.hazard_state || 'unknown').toLowerCase();
  if (!['unknown', 'benign', 'confirmed_hazard'].includes(hazardState)) {
    throw new TypeError('hazard_state must be unknown, benign, or confirmed_hazard');
  }

  return {
    observation_id: requireText(raw.observation_id, 'observation_id'),
    created_at: createdAt.toISOString(),
    region_key: requireText(raw.region_key, 'region_key'),
    source_family: requireText(raw.source_family, 'source_family'),
    domain: requireText(raw.domain, 'domain'),
    kind: requireText(raw.kind || 'anomaly', 'kind'),
    anomaly_score: clamp01(raw.anomaly_score ?? 0.5),
    reliability: clamp01(raw.reliability ?? 0.5),
    evidence_state: evidenceState,
    hazard_state: hazardState,
    provenance_ref: typeof raw.provenance_ref === 'string' ? raw.provenance_ref : null,
    summary: typeof raw.summary === 'string' ? raw.summary.slice(0, 280) : null
  };
}

export function emptyState() {
  return {
    schema: 'systemia.sentinel.state.v1',
    incident_counter: 0,
    observation_ids: {},
    incidents: {}
  };
}

function findIncident(state, observation, windowMs) {
  const at = new Date(observation.created_at).getTime();
  let best = null;

  for (const incident of Object.values(state.incidents)) {
    if (!incident.open || incident.region_key !== observation.region_key) continue;
    const last = new Date(incident.last_seen_at).getTime();
    const distance = Math.abs(at - last);
    if (distance > windowMs) continue;
    if (!best || distance < best.distance) best = { incident, distance };
  }

  return best?.incident || null;
}

function classify(observations) {
  const families = new Set(observations.map((o) => o.source_family));
  const domains = new Set(observations.map((o) => o.domain));
  const verifiedCount = observations.filter((o) => o.evidence_state === 'verified').length;
  const directCount = observations.filter((o) => ['observed', 'verified'].includes(o.evidence_state)).length;
  const confirmedHazard = observations.some((o) => o.hazard_state === 'confirmed_hazard');
  const allModeled = observations.every((o) => o.evidence_state === 'modeled');

  let weightedNumerator = 0;
  let weightedDenominator = 0;
  for (const observation of observations) {
    const evidenceWeight = EVIDENCE_WEIGHT[observation.evidence_state];
    const weight = Math.max(0.05, observation.reliability * evidenceWeight);
    weightedNumerator += observation.anomaly_score * weight;
    weightedDenominator += weight;
  }

  const anomaly = weightedDenominator ? weightedNumerator / weightedDenominator : 0;
  const independence = Math.min(1, families.size / 4);
  const domainBreadth = Math.min(1, domains.size / 3);
  const evidenceQuality = observations.reduce(
    (sum, o) => sum + EVIDENCE_WEIGHT[o.evidence_state],
    0
  ) / observations.length;

  const confidence = round3(
    0.45 * anomaly +
    0.25 * independence +
    0.2 * domainBreadth +
    0.1 * evidenceQuality
  );

  let level = 'watch';
  if (families.size >= 2 && confidence >= 0.48) level = 'corroborating';
  if (families.size >= 3 && domains.size >= 2 && directCount >= 2 && confidence >= 0.64) {
    level = 'elevated';
  }
  if (
    families.size >= 4 &&
    domains.size >= 3 &&
    verifiedCount >= 1 &&
    directCount >= 3 &&
    confidence >= 0.76
  ) {
    level = 'urgent';
  }

  if (allModeled && LEVEL_ORDER[level] > LEVEL_ORDER.corroborating) {
    level = 'corroborating';
  }

  const actionByLevel = {
    watch: 'observe',
    corroborating: 'request_corroboration',
    elevated: 'alert_operator',
    urgent: 'prepare_authorized_handoff'
  };

  return {
    level,
    confidence,
    independent_source_families: families.size,
    domains: domains.size,
    verified_observations: verifiedCount,
    direct_observations: directCount,
    confirmed_hazard: confirmedHazard,
    action: actionByLevel[level],
    hypothesis_plan: [
      'benign_or_ordinary_activity',
      'weather_or_environmental',
      'sensor_or_data_fault',
      'infrastructure_or_communications_failure',
      'coordinated_hazard',
      'unknown'
    ]
  };
}

export function toSignalFabricRecord(incident) {
  const signalSeverity = (
    incident.assessment.level === 'urgent' && incident.assessment.confirmed_hazard
  )
    ? 'critical'
    : ({
        watch: 'receipt',
        corroborating: 'notice',
        elevated: 'warning',
        urgent: 'warning'
      }[incident.assessment.level]);

  return {
    schema: 'systemia.signal.v1',
    company: 'Evercraft',
    product: 'Systemia Sentinel',
    source: 'sentinel',
    kind: 'cross_domain_anomaly',
    component: incident.region_key,
    status: 'open',
    severity_hint: signalSeverity,
    evidence_state: incident.assessment.verified_observations > 0 ? 'live_verified' : 'corroborated',
    impact: incident.assessment.confirmed_hazard ? 'confirmed_life_safety_hazard' : 'unattributed_anomaly',
    created_at: incident.last_seen_at,
    summary: incident.assessment.level + ' cross-domain anomaly; ' +
      incident.assessment.independent_source_families + ' independent source families across ' +
      incident.assessment.domains + ' domains; confidence ' + incident.assessment.confidence
  };
}

export function ingestObservation(inputState, rawObservation, options = {}) {
  const state = structuredClone(inputState || emptyState());
  const observation = normalizeObservation(rawObservation);
  const windowMs = (options.windowSeconds ?? 600) * 1000;

  if (state.observation_ids[observation.observation_id]) {
    const incident = state.incidents[state.observation_ids[observation.observation_id]];
    return {
      state,
      decision: {
        action: 'deduped',
        duplicate: true,
        incident_id: incident.id,
        assessment: incident.assessment,
        signal: toSignalFabricRecord(incident)
      }
    };
  }

  let incident = findIncident(state, observation, windowMs);
  if (!incident) {
    state.incident_counter += 1;
    const id = 'sentinel-' + String(state.incident_counter).padStart(6, '0');
    incident = {
      id,
      region_key: observation.region_key,
      open: true,
      first_seen_at: observation.created_at,
      last_seen_at: observation.created_at,
      observations: [],
      assessment: null
    };
    state.incidents[id] = incident;
  }

  incident.observations.push(observation);
  incident.last_seen_at = observation.created_at;
  incident.assessment = classify(incident.observations);
  state.observation_ids[observation.observation_id] = incident.id;

  if (!ALLOWED_ACTIONS.has(incident.assessment.action)) {
    throw new Error('Sentinel produced an action outside its safety boundary');
  }

  return {
    state,
    decision: {
      action: incident.assessment.action,
      duplicate: false,
      incident_id: incident.id,
      assessment: incident.assessment,
      signal: toSignalFabricRecord(incident)
    }
  };
}

export function closeIncident(inputState, incidentId, closedAt = new Date().toISOString()) {
  const state = structuredClone(inputState || emptyState());
  const incident = state.incidents[incidentId];
  if (!incident) throw new Error('Unknown incident');

  incident.open = false;
  incident.closed_at = new Date(closedAt).toISOString();

  return {
    state,
    decision: {
      action: 'record_recovery',
      incident_id: incidentId,
      closed_at: incident.closed_at
    }
  };
}
