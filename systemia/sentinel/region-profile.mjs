import fs from 'node:fs';

const REGISTRY_URL = new URL('./profiles/registry.json', import.meta.url);
const PROFILE_ID = /^[a-z0-9][a-z0-9-]{1,63}$/;
const NWS_AREA = /^[A-Z]{2}$/;
const NWPS_GAUGE = /^[A-Z0-9_-]{2,32}$/;
const USGS_LOCATION = /^USGS-[0-9A-Z]{5,20}$/;

function unique(values) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function validateProfile(raw) {
  const profile = structuredClone(raw || {});
  if (!PROFILE_ID.test(String(profile.profile_id || ''))) {
    throw new TypeError('region profile_id is invalid');
  }
  if (!String(profile.label || '').trim()) {
    throw new TypeError('region profile label is required');
  }
  const sources = profile.sources || {};
  const nwsArea = String(sources.nws_area || '').trim().toUpperCase();
  if (nwsArea && !NWS_AREA.test(nwsArea)) {
    throw new TypeError('region profile nws_area must be a two-letter area code');
  }

  const nwpsGauges = unique(sources.nwps_gauges);
  for (const id of nwpsGauges) {
    if (!NWPS_GAUGE.test(id.toUpperCase())) {
      throw new TypeError('region profile NWPS gauge id is invalid');
    }
  }

  const usgsWaterLocations = unique(sources.usgs_water_locations);
  for (const id of usgsWaterLocations) {
    if (!USGS_LOCATION.test(id.toUpperCase())) {
      throw new TypeError('region profile USGS water location id is invalid');
    }
  }

  return {
    schema: 'systemia.sentinel.region-profile.v1',
    profile_id: profile.profile_id,
    label: String(profile.label).trim(),
    geography: structuredClone(profile.geography || {}),
    sources: {
      nws_area: nwsArea || null,
      nwps_gauges: nwpsGauges.map((id) => id.toUpperCase()),
      usgs_water_locations: usgsWaterLocations.map((id) => id.toUpperCase())
    },
    provenance: Array.isArray(profile.provenance)
      ? profile.provenance.map((row) => ({
          provider: String(row?.provider || '').trim() || null,
          monitoring_location_id: String(row?.monitoring_location_id || '').trim() || null,
          label: String(row?.label || '').trim() || null,
          url: String(row?.url || '').trim() || null
        }))
      : [],
    verified_at: String(profile.verified_at || '').trim() || null,
    notes: Array.isArray(profile.notes) ? profile.notes.map((value) => String(value)) : []
  };
}

export function loadSentinelRegionProfileRegistry() {
  const parsed = JSON.parse(fs.readFileSync(REGISTRY_URL, 'utf8'));
  if (parsed?.schema !== 'systemia.sentinel.region-profile-registry.v1') {
    throw new TypeError('Sentinel region profile registry schema is invalid');
  }
  const profiles = (parsed.profiles || []).map(validateProfile);
  const ids = new Set();
  for (const profile of profiles) {
    if (ids.has(profile.profile_id)) {
      throw new TypeError('duplicate Sentinel region profile: ' + profile.profile_id);
    }
    ids.add(profile.profile_id);
  }
  return {
    schema: parsed.schema,
    profiles
  };
}

export function listSentinelRegionProfiles() {
  return loadSentinelRegionProfileRegistry().profiles.map((profile) => ({
    profile_id: profile.profile_id,
    label: profile.label,
    geography: profile.geography,
    verified_at: profile.verified_at
  }));
}

export function getSentinelRegionProfile(profileId) {
  const id = String(profileId || '').trim();
  if (!id) return null;
  const profile = loadSentinelRegionProfileRegistry().profiles.find((row) => row.profile_id === id);
  if (!profile) {
    throw new Error('Unknown Sentinel region profile: ' + id);
  }
  return structuredClone(profile);
}

export function resolveSentinelRegionConfig({
  profileId = null,
  nwsArea = null,
  nwpsGaugeIds = [],
  usgsWaterLocationIds = []
} = {}) {
  const profile = profileId ? getSentinelRegionProfile(profileId) : null;
  const explicitArea = String(nwsArea || '').trim().toUpperCase();
  if (explicitArea && !NWS_AREA.test(explicitArea)) {
    throw new TypeError('NWS area override must be a two-letter code');
  }

  const gauges = unique([
    ...(profile?.sources?.nwps_gauges || []),
    ...nwpsGaugeIds
  ]).map((id) => id.toUpperCase());
  for (const id of gauges) {
    if (!NWPS_GAUGE.test(id)) throw new TypeError('NWPS gauge id is invalid');
  }

  const waterLocations = unique([
    ...(profile?.sources?.usgs_water_locations || []),
    ...usgsWaterLocationIds
  ]).map((id) => id.toUpperCase());
  for (const id of waterLocations) {
    if (!USGS_LOCATION.test(id)) throw new TypeError('USGS water location id is invalid');
  }

  return {
    schema: 'systemia.sentinel.resolved-region-config.v1',
    profile: profile ? {
      profile_id: profile.profile_id,
      label: profile.label,
      geography: profile.geography,
      verified_at: profile.verified_at,
      provenance_count: profile.provenance.length
    } : null,
    nws_area: explicitArea || profile?.sources?.nws_area || null,
    nwps_gauges: gauges,
    usgs_water_locations: waterLocations
  };
}
