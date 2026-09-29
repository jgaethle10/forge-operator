import { createFeedAdapter } from '../feed-adapter.mjs';
import { coarseCellFromGeometry } from '../coarse-geo.mjs';

export const USGS_ALL_HOUR_GEOJSON = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson';

const usgsAdapter = createFeedAdapter({
  adapter_id: 'usgs-earthquake-feed',
  domain: 'environmental',
  source_family: 'usgs-earthquake-feed',
  independence_group: 'usgs',
  evidence_state: 'verified',
  reliability: 0.98
});

function magnitudeScore(mag) {
  const value = Number(mag);
  if (!Number.isFinite(value)) return 0.2;
  if (value >= 7) return 1;
  if (value >= 6) return 0.92;
  if (value >= 5) return 0.78;
  if (value >= 4.5) return 0.64;
  if (value >= 3) return 0.42;
  return 0.22;
}

function alertFloor(alert) {
  return ({
    red: 0.98,
    orange: 0.88,
    yellow: 0.72,
    green: 0.48
  })[String(alert || '').toLowerCase()] || 0;
}

function coarsePlace(place) {
  const text = String(place || 'unknown-region').replace(/\s+/g, ' ').trim();
  const match = text.match(/\bof\s+(.+)$/i);
  return (match?.[1] || text).slice(0, 160);
}

function scoreFeature(feature = {}) {
  const p = feature.properties || {};
  let score = magnitudeScore(p.mag);
  score = Math.max(score, alertFloor(p.alert));
  if (Number(p.tsunami) === 1) score = Math.max(score, 0.9);
  if (Number.isFinite(Number(p.sig))) score = Math.max(score, Math.min(1, Number(p.sig) / 1000));
  return Number(score.toFixed(3));
}

export function parseUsgsEarthquakeFeature(feature = {}) {
  const p = feature.properties || {};
  const id = feature.id || p.code;
  if (!id) throw new TypeError('USGS earthquake feature is missing an id');
  if (!Number.isFinite(Number(p.time))) throw new TypeError('USGS earthquake feature is missing time');

  const anomaly = scoreFeature(feature);
  const coarseRegionGroup = coarseCellFromGeometry(feature.geometry);
  return usgsAdapter({
    id: String(id),
    timestamp: new Date(Number(p.time)).toISOString(),
    kind: 'earthquake',
    anomaly_score: anomaly,
    hazard_state: 'unknown',
    provenance_ref: String(p.url || p.detail || id),
    summary: ('M' + String(p.mag ?? '?') + ' ' + String(p.place || 'earthquake')).slice(0, 280)
  }, {
    region_key: coarsePlace(p.place),
    region_group: coarseRegionGroup,
    anomaly_score: anomaly,
    evidence_state: 'verified',
    hazard_state: 'unknown'
  });
}

export function parseUsgsEarthquakes(payload = {}) {
  const features = Array.isArray(payload.features) ? payload.features : [];
  return features.map(parseUsgsEarthquakeFeature);
}

export async function fetchUsgsEarthquakes({
  feedUrl = USGS_ALL_HOUR_GEOJSON,
  fetchImpl = globalThis.fetch
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');

  const url = new URL(feedUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'earthquake.usgs.gov') {
    throw new TypeError('USGS source URL must use https://earthquake.usgs.gov');
  }

  const response = await fetchImpl(url, {
    headers: { 'Accept': 'application/geo+json, application/json' }
  });
  if (!response?.ok) {
    throw new Error('USGS request failed with status ' + String(response?.status ?? 'unknown'));
  }
  return parseUsgsEarthquakes(await response.json());
}
