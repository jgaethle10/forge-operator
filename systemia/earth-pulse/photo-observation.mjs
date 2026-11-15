import { createHash } from 'node:crypto';

// Research-only community media intake. This cannot publish hazards, trigger
// Sentinel alerts, or verify environmental conditions.
const CATEGORIES = new Set(['waterway', 'infrastructure', 'habitat', 'fungi', 'energy']);
const MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const SITE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(label + ' is required');
  return value.trim();
}

function canonicalTime(value, label) {
  const text = requiredText(value, label);
  const ms = Date.parse(text);
  if (!Number.isFinite(ms) || !/T/.test(text)) throw new TypeError(label + ' must be a timestamp');
  return { iso: new Date(ms).toISOString(), ms };
}

function geoCell(location) {
  if (!location || typeof location !== 'object') throw new TypeError('location is required');
  const lat = location.latitude, lon = location.longitude;
  if (typeof lat !== 'number' || typeof lon !== 'number' ||
      !Number.isFinite(lat) || !Number.isFinite(lon) ||
      lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new TypeError('valid latitude and longitude are required');
  }
  // Public region IDs represent ~0.1 degree cells, not exact coordinates.
  return 'g10:' + Math.min(1799, Math.floor((lat + 90) * 10)) + ':' +
    Math.min(3599, Math.floor((lon + 180) * 10));
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function normalizePhotoObservation(input = {}) {
  const category = requiredText(input.category, 'category');
  if (!CATEGORIES.has(category)) throw new TypeError('unsupported observation category');
  const sha256 = requiredText(input.media?.sha256, 'media.sha256').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new TypeError('invalid media SHA-256');
  const mime = requiredText(input.media?.mime_type, 'media.mime_type').toLowerCase();
  if (!MEDIA_TYPES.has(mime)) throw new TypeError('unsupported image type');
  const received = canonicalTime(input.received_at, 'received_at');
  const captured = input.observed_at == null ? null : canonicalTime(input.observed_at, 'observed_at');
  if (captured && captured.ms > received.ms + 300000) {
    throw new RangeError('observation date is in the future');
  }
  const cell = geoCell(input.location);
  const siteId = input.site_id == null ? null : requiredText(input.site_id, 'site_id');
  if (siteId && !SITE_ID_PATTERN.test(siteId)) throw new TypeError('invalid site_id');
  const consent = input.public_share_consent === true;

  return Object.freeze({
    schema: 'evercraft.earth-pulse.photo-observation.v0',
    observation_id: 'eop:' + digest([sha256, category, cell, captured?.iso || 'unknown'].join('|')).slice(0, 24),
    category,
    site_id: siteId,
    site_claim_state: siteId ? 'contributor_supplied_unverified' : 'unknown',
    media_sha256: sha256,
    media_type: mime,
    region_cell: cell,
    geographic_precision: 'coarse_0.1_degree',
    observed_at: captured?.iso || null,
    observed_time_state: captured ? 'contributor_supplied_unverified' : 'unknown',
    received_at: received.iso,
    evidence_state: 'reported',
    publication_state: consent ? 'pending_privacy_and_rights_review' : 'private',
    public_share_consent: consent,
    model_suggestions: [],
    review_state: 'unreviewed',
    // Raw images, EXIF, precise geotags and contributor identity remain in
    // separate restricted storage, NOT in this output object.
    permissible_claim: 'A photograph was submitted for assessment; conditions are unverified.'
  });
}

export function attachModelSuggestions(observation, suggestions = []) {
  if (observation?.schema !== 'evercraft.earth-pulse.photo-observation.v0') {
    throw new TypeError('normalized photo observation required');
  }
  if (!Array.isArray(suggestions) || suggestions.length > 20) throw new TypeError('invalid suggestions');
  const safe = suggestions.map(item => {
    const label = requiredText(item?.label, 'suggestion label');
    const confidence = item?.confidence;
    if (label.length > 120 || typeof confidence !== 'number' ||
        !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new TypeError('invalid suggestion');
    }
    return { label, confidence, status: 'unverified_model_hypothesis' };
  });
  return Object.freeze({ ...observation, model_suggestions: safe });
}

export function clusterPhotoObservations(observations = []) {
  if (!Array.isArray(observations)) throw new TypeError('observations must be an array');
  const groups = new Map();
  for (const item of observations) {
    if (item?.schema !== 'evercraft.earth-pulse.photo-observation.v0') {
      throw new TypeError('normalized photo observation required');
    }
    const key = item.category + '|' + item.region_cell;
    if (!groups.has(key)) groups.set(key, new Map());
    groups.get(key).set(item.media_sha256, item);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, unique]) => {
    const [category, region_cell] = key.split('|');
    return {
      category,
      region_cell,
      distinct_photo_count: unique.size,
      evidence_state: 'reported',
      verification_state: 'requires_independent_review',
      environmental_condition: 'undetermined'
    };
  });
}
