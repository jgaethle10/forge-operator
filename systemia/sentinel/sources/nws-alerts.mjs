import { createFeedAdapter } from '../feed-adapter.mjs';

export const NWS_ACTIVE_ALERTS_ENDPOINT = 'https://api.weather.gov/alerts/active';
export const NWS_MIN_POLL_INTERVAL_MS = 30000;

const severityScore = Object.freeze({
  Extreme: 1,
  Severe: 0.88,
  Moderate: 0.66,
  Minor: 0.42,
  Unknown: 0.3
});

const certaintyScore = Object.freeze({
  Observed: 1,
  Likely: 0.88,
  Possible: 0.62,
  Unlikely: 0.3,
  Unknown: 0.5
});

const urgencyScore = Object.freeze({
  Immediate: 1,
  Expected: 0.85,
  Future: 0.55,
  Past: 0.2,
  Unknown: 0.5
});

function cleanRegion(value) {
  return String(value || 'unknown-region')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function alertScore(properties = {}) {
  const severity = severityScore[properties.severity] ?? severityScore.Unknown;
  const certainty = certaintyScore[properties.certainty] ?? certaintyScore.Unknown;
  const urgency = urgencyScore[properties.urgency] ?? urgencyScore.Unknown;
  return Math.max(0, Math.min(1, Number((severity * 0.5 + certainty * 0.3 + urgency * 0.2).toFixed(3))));
}

function confirmedLifeSafetyHazard(properties = {}) {
  return ['Extreme', 'Severe'].includes(properties.severity) &&
    ['Observed', 'Likely'].includes(properties.certainty) &&
    ['Immediate', 'Expected'].includes(properties.urgency) &&
    String(properties.status || 'Actual') === 'Actual';
}

const officialAdapter = createFeedAdapter({
  adapter_id: 'nws-active-alerts',
  domain: 'emergency_report',
  source_family: 'nws-api',
  independence_group: 'noaa-nws',
  evidence_state: 'verified',
  reliability: 0.97,
  authority: 'authorized_official'
});

export function parseNwsAlertFeature(feature = {}) {
  const p = feature.properties || {};
  const id = feature.id || p.id || p['@id'];
  if (!id) throw new TypeError('NWS alert feature is missing an id');

  const createdAt = p.sent || p.effective || p.onset || p.expires;
  if (!createdAt) throw new TypeError('NWS alert feature is missing a usable timestamp');

  const hazardState = confirmedLifeSafetyHazard(p) ? 'confirmed_hazard' : 'unknown';

  return officialAdapter({
    id: String(id),
    timestamp: createdAt,
    kind: 'nws_alert:' + String(p.event || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    anomaly_score: alertScore(p),
    hazard_state: hazardState,
    provenance_ref: String(p['@id'] || feature.id || id),
    summary: [p.event, p.headline || p.description].filter(Boolean).join(': ').slice(0, 280)
  }, {
    region_key: cleanRegion(p.areaDesc || p.geocode?.UGC?.join(',') || 'nws-national'),
    anomaly_score: alertScore(p),
    evidence_state: 'verified',
    hazard_state: hazardState
  });
}

export function parseNwsAlerts(payload = {}) {
  const features = Array.isArray(payload.features) ? payload.features : [];
  return features.map(parseNwsAlertFeature);
}

export async function fetchNwsActiveAlerts({
  area = null,
  zone = null,
  fetchImpl = globalThis.fetch,
  userAgent = 'Evercraft-Sentinel/0.1 (https://github.com/jgaethle10/forge-operator)'
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  if (area && !/^[A-Z]{2}$/.test(area)) throw new TypeError('NWS area must be a two-letter uppercase area code');
  if (zone && !/^[A-Z0-9]{6}$/.test(zone)) throw new TypeError('NWS zone must be a six-character UGC zone code');

  const url = new URL(NWS_ACTIVE_ALERTS_ENDPOINT);
  if (area) url.searchParams.set('area', area);
  if (zone) url.searchParams.set('zone', zone);

  const response = await fetchImpl(url, {
    headers: {
      'User-Agent': userAgent,
      'Accept': 'application/geo+json'
    }
  });
  if (!response?.ok) {
    throw new Error('NWS request failed with status ' + String(response?.status ?? 'unknown'));
  }
  return parseNwsAlerts(await response.json());
}
