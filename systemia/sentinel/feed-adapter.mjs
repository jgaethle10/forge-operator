const ALLOWED_DOMAINS = new Set([
  'aviation',
  'weather',
  'communications',
  'infrastructure',
  'environmental',
  'acoustic',
  'optical',
  'emergency_report'
]);

const EVIDENCE_STATES = new Set(['modeled', 'reported', 'observed', 'verified']);
const EVIDENCE_RANK = Object.freeze({ modeled: 0, reported: 1, observed: 2, verified: 3 });

function required(value, name) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(name + ' must be non-empty');
  return text;
}

function finite01(value, fallback) {
  const n = Number(value ?? fallback);
  if (!Number.isFinite(n)) throw new TypeError('score must be finite');
  return Math.max(0, Math.min(1, n));
}

export function createFeedAdapter(config = {}) {
  const adapterId = required(config.adapter_id, 'adapter_id');
  const domain = required(config.domain, 'domain');
  if (!ALLOWED_DOMAINS.has(domain)) {
    throw new TypeError('domain is not approved for Sentinel feed normalization');
  }

  const sourceFamily = required(config.source_family, 'source_family');
  const independenceGroup = required(config.independence_group || sourceFamily, 'independence_group');
  const evidenceState = String(config.evidence_state || 'observed').toLowerCase();
  if (!EVIDENCE_STATES.has(evidenceState)) {
    throw new TypeError('evidence_state must be modeled, reported, observed, or verified');
  }

  const reliability = finite01(config.reliability, 0.7);
  const canConfirmHazard = domain === 'emergency_report' &&
    evidenceState === 'verified' &&
    String(config.authority || '').toLowerCase() === 'authorized_official';

  return function normalizeFeedRecord(record = {}, context = {}) {
    const regionKey = required(
      context.region_key || record.region_key,
      'region_key'
    );

    // Deliberately require a coarse region identifier. Exact coordinates belong
    // in a source system, not in Sentinel's correlation kernel.
    const observationId = required(
      record.observation_id || record.id,
      'observation_id'
    );
    const createdAt = new Date(record.created_at || record.timestamp);
    if (!Number.isFinite(createdAt.getTime())) {
      throw new TypeError('record timestamp must be valid');
    }

    const requestedEvidence = String(
      context.evidence_state || record.evidence_state || evidenceState
    ).toLowerCase();
    if (!EVIDENCE_STATES.has(requestedEvidence)) {
      throw new TypeError('record evidence_state is invalid');
    }
    const boundedEvidence = EVIDENCE_RANK[requestedEvidence] <= EVIDENCE_RANK[evidenceState]
      ? requestedEvidence
      : evidenceState;

    const requestedHazardState = String(
      context.hazard_state || record.hazard_state || 'unknown'
    ).toLowerCase();
    const boundedHazardState = requestedHazardState === 'confirmed_hazard' && !canConfirmHazard
      ? 'unknown'
      : requestedHazardState;

    return {
      observation_id: adapterId + ':' + observationId,
      created_at: createdAt.toISOString(),
      region_key: regionKey,
      source_family: sourceFamily,
      independence_group: independenceGroup,
      region_group: String(context.region_group || record.region_group || '').trim() || null,
      domain,
      kind: required(record.kind || config.default_kind || 'feed_deviation', 'kind'),
      anomaly_score: finite01(
        context.anomaly_score ?? record.anomaly_score,
        0
      ),
      reliability: finite01(
        context.reliability ?? record.reliability,
        reliability
      ),
      evidence_state: boundedEvidence,
      hazard_state: boundedHazardState,
      provenance_ref: String(
        record.provenance_ref || context.provenance_ref || (adapterId + '://' + observationId)
      ),
      summary: String(record.summary || '').slice(0, 280),
      adapter_receipt: {
        adapter_id: adapterId,
        exact_coordinates_retained: false,
        source_family: sourceFamily,
        independence_group: independenceGroup,
        evidence_ceiling: evidenceState,
        confirmed_hazard_authority: canConfirmHazard
      }
    };
  };
}

export const PUBLIC_FEED_ADAPTER_BLUEPRINTS = Object.freeze([
  {
    adapter_id: 'public-weather',
    domain: 'weather',
    source_family: 'public-weather-feed',
    evidence_state: 'observed',
    reliability: 0.85
  },
  {
    adapter_id: 'public-aviation',
    domain: 'aviation',
    source_family: 'public-aviation-feed',
    evidence_state: 'observed',
    reliability: 0.8
  },
  {
    adapter_id: 'public-environmental',
    domain: 'environmental',
    source_family: 'public-environmental-feed',
    evidence_state: 'observed',
    reliability: 0.8
  },
  {
    adapter_id: 'public-emergency',
    domain: 'emergency_report',
    source_family: 'public-emergency-feed',
    evidence_state: 'reported',
    reliability: 0.75
  }
]);
