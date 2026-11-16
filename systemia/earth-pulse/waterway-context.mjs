// Earth Pulse research context join: pure, offline, no fetches and no alerts.
// This links only operator-configured waterway photo review pairs to USGS
// observations from the existing authorized adapter. It does not verify
// the field site, infer causality, or establish water safety.
const PAIR_SCHEMA = 'evercraft.earth-pulse.repeat-review.v0';
const SOURCE_FAMILY = 'usgs-water-data-api';
const ALLOWED_CODES = Object.freeze(['00060', '00065']);
const KIND = Object.freeze({ '00060': 'stream_discharge', '00065': 'gage_height' });
const SITE_ID = /^[a-z0-9][a-z0-9-]{2,63}$/;
const CELL = /^g10:\d{1,4}:\d{1,4}$/;
const STATION_ID = /^USGS-[A-Z0-9]{5,20}$/;

function timestamp(text, label) {
  if (typeof text !== 'string' || !/T/.test(text)) throw new TypeError(label + ' must be a timestamp');
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) throw new TypeError(label + ' must be a timestamp');
  return ms;
}

function sourceIsOfficial(record) {
  try {
    const u = new URL(record.provenance_ref);
    return u.protocol === 'https:' && u.hostname === 'api.waterdata.usgs.gov' &&
      u.pathname.startsWith('/ogcapi/v0/collections/latest-continuous/items/');
  } catch {
    return false;
  }
}

function prepareRegistry(sites) {
  const registry = new Map();
  for (const site of sites) {
    if (!site || typeof site !== 'object' || typeof site.id !== 'string' ||
        !SITE_ID.test(site.id) || registry.has(site.id) ||
        site.category !== 'waterway' || typeof site.region_cell !== 'string' ||
        !CELL.test(site.region_cell)) {
      throw new TypeError('invalid or duplicate research site');
    }
    if (site.review_enabled !== true) continue;
    // A configured station is context, never evidence that the station
    // and the photograph observe exactly the same place.
    if (site.usgs_station_id != null &&
        (typeof site.usgs_station_id !== 'string' ||
         !STATION_ID.test(site.usgs_station_id))) {
      throw new TypeError('invalid USGS station ID');
    }
    registry.set(site.id, {
      id: site.id, region_cell: site.region_cell,
      usgs_station_id: site.usgs_station_id || null
    });
  }
  return registry;
}

function usableRecord(record, stationId, asOfMs) {
  if (!record || record.domain !== 'hydrology' ||
      record.source_family !== SOURCE_FAMILY ||
      record.metric_metadata?.monitoring_location_id !== stationId ||
      !ALLOWED_CODES.includes(record.metric_metadata?.parameter_code) ||
      record.kind !== KIND[record.metric_metadata.parameter_code] ||
      typeof record.metric_value !== 'number' ||
      !Number.isFinite(record.metric_value) ||
      typeof record.metric_metadata.unit_of_measure !== 'string' ||
      !record.metric_metadata.unit_of_measure.trim() ||
      !sourceIsOfficial(record)) return null;
  const ms = Date.parse(record.created_at);
  if (!Number.isFinite(ms) || ms > asOfMs) return null;
  return { ms, record };
}

/**
 * Build conservative evidence packets for offline manual review.
 * Sites and photo timestamps are contributor/operator *claims*, not
 * scientific truth. Missing official data remain missing, never zero.
 */
export function buildWaterwayContextPackets({
  pairs = [], sites = [], usgsObservations = [],
  asOf, maxOffsetHours = 24
} = {}) {
  if (!Array.isArray(pairs) || pairs.length > 1000 ||
      !Array.isArray(sites) || sites.length > 1000 ||
      !Array.isArray(usgsObservations) || usgsObservations.length > 10000) {
    throw new TypeError('bounded arrays required');
  }
  if (!Number.isInteger(maxOffsetHours) || maxOffsetHours < 1 ||
      maxOffsetHours > 168) throw new TypeError('maxOffsetHours must be 1..168');
  const asOfMs = timestamp(asOf, 'asOf');
  const registry = prepareRegistry(sites);
  const output = [];
  for (const pair of pairs) {
    if (!pair || pair.schema !== PAIR_SCHEMA ||
        pair.review_state !== 'site_and_viewpoint_alignment_required' ||
        pair.publication_state !== 'not_authorized' ||
        pair.alert_eligible !== false || pair.category !== 'waterway' ||
        typeof pair.pair_id !== 'string') {
      throw new TypeError('unreviewed research-only waterway pair required');
    }
    const site = registry.get(pair.site_id);
    if (!site || pair.region_cell !== site.region_cell) continue;
    const before = timestamp(pair.before_claimed_at, 'before_claimed_at');
    const after = timestamp(pair.after_claimed_at, 'after_claimed_at');
    if (before >= after || after > asOfMs + 300000) continue;
    const maxDelta = maxOffsetHours * 3600000;
    const measurement = {};
    for (const code of ALLOWED_CODES) {
      const candidates = site.usgs_station_id
        ? usgsObservations
            .map(r => usableRecord(r, site.usgs_station_id, asOfMs))
            .filter(x => x && x.record.metric_metadata.parameter_code === code)
            .map(x => ({ ...x, offset: Math.abs(x.ms - after) }))
            .filter(x => x.offset <= maxDelta)
            .sort((a, b) => a.offset - b.offset ||
              Number(b.record.metric_metadata.approval_status === 'approved') -
              Number(a.record.metric_metadata.approval_status === 'approved') ||
              b.ms - a.ms)
        : [];
      const candidate = candidates[0]?.record;
      measurement[KIND[code]] = candidate ? {
        state: 'context_record_available',
        measured_at: candidate.created_at,
        value: candidate.metric_value,
        unit: candidate.metric_metadata.unit_of_measure,
        source_quality: candidate.metric_metadata.approval_status === 'approved' ?
          'source_approved' : 'source_not_approved',
        source_ref: candidate.provenance_ref,
        station_id: site.usgs_station_id,
        spatial_relation: 'operator_configured_context_not_colocated_proof'
      } : {
        state: site.usgs_station_id ? 'no_matching_record_in_supplied_window' :
          'no_station_configured',
        value: null,
        station_id: site.usgs_station_id
      };
    }
    output.push({
      schema: 'evercraft.earth-pulse.waterway-context.v0',
      pair_id: pair.pair_id,
      site_id: site.id,
      region_cell: site.region_cell,
      photo_claimed_at: pair.after_claimed_at,
      station_id: site.usgs_station_id,
      station_link_state: 'operator_configured_not_spatially_validated',
      photo_alignment_state: 'requires_human_review',
      observation_change: 'undetermined',
      water_quality: 'not_assessed',
      environmental_hazard: 'not_assessed',
      measurements: measurement,
      review_state: 'research_review_required',
      publication_state: 'not_authorized',
      alert_eligible: false
    });
  }
  return output.sort((a, b) => a.site_id.localeCompare(b.site_id) ||
    a.photo_claimed_at.localeCompare(b.photo_claimed_at) || a.pair_id.localeCompare(b.pair_id));
}
