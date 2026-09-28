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
  const evidenceState = String(config.evidence_state || 'observed').toLowerCase();
  if (!EVIDENCE_STATES.has(evidenceState)) {
    throw new TypeError('evidence_state must be modeled, reported, observed, or verified');
  }

  const reliability = finite01(config.reliability, 0.7);

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

    return {
      observation_id: adapterId + ':' + observationId,
      created_at: createdAt.toISOString(),
      region_key: regionKey,
      source_family: sourceFamily,
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
      evidence_state: String(
        context.evidence_state || record.evidence_state || evidenceState
      ).toLowerCase(),
      hazard_state: String(
        context.hazard_state || record.hazard_state || 'unknown'
      ).toLowerCase(),
      provenance_ref: String(
        record.provenance_ref || context.provenance_ref || (adapterId + '://' + observationId)
      ),
      summary: String(record.summary || '').slice(0, 280),
      adapter_receipt: {
        adapter_id: adapterId,
        exact_coordinates_retained: false,
        source_family: sourceFamily
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
    source_family: 'authorized-public-safety-feed',
    evidence_state: 'verified',
    reliability: 0.95
  }
]);
