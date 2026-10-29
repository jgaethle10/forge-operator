// EverMaps environmental evidence pilot: Mount Hood Coalman Glacier meltwater pond.
// Read-only official USGS feed. A public notice is not an emergency warning.
// The 2026-10-23 report is retained as a historical baseline, never asserted as live conditions.
export const HOOD_POND_SOURCE = Object.freeze({
  endpoint: 'https://volcanoes.usgs.gov/vsc/api/hansApi/newest',
  page: 'https://volcanoes.usgs.gov/hans-public/volcano/cas',
  initial_notice: 'https://volcanoes.usgs.gov/hans-public/notice/DOI-USGS-CVO-2026-10-23T14%3A05%3A07%2B00%3A00',
  maxBytes: 2000000,
  cacheMs: 60 * 60 * 1000
});

export const HOOD_POND_BASELINE = Object.freeze({
  source_date: '2026-10-23',
  observation_date: '2026-10-06',
  event: 'Coalman Glacier seasonal meltwater pond',
  region: 'Mount Hood, Oregon, United States',
  geometry_precision: 'mountain_area_only_not_pond_coordinate',
  estimated_volume_cubic_meters: 50000,
  volume_is_measured: false,
  provisional_ph: 4,
  berm: 'Devils Kitchen appeared stable in the October 23 USGS assessment',
  potential_flow_path: 'White River toward the Highway 35 bridge',
  modeled_inundation_area_available: false,
  population_impact_assessed_at_baseline: 'not expected based on then-current volume estimate',
  source_url: HOOD_POND_SOURCE.initial_notice,
  current_conditions_from_baseline: false
});

function stripHtml(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function officialNoticeUrl(value) {
  const url = new URL(String(value || HOOD_POND_SOURCE.page));
  if (url.protocol !== 'https:' || url.hostname !== 'volcanoes.usgs.gov') {
    throw new Error('HOOD_POND_UNTRUSTED_NOTICE_URL');
  }
  return url.toString();
}

export function normalizeHoodPondNotice(payload, checkedAt = new Date().toISOString()) {
  if (!Array.isArray(payload)) throw new Error('HOOD_POND_INVALID_FEED');
  const cascades = payload.filter(n => n?.obs === 'cvo' && Array.isArray(n.noticeSections))
    .sort((a, b) => String(b.sentUtc || '').localeCompare(String(a.sentUtc || '')));
  if (!cascades.length) throw new Error('HOOD_POND_NO_CVO_NOTICE');

  const latest = cascades[0];
  const section = latest.noticeSections.find(s => s?.vName === 'Cascade Range') ||
    latest.noticeSections.find(s => /Mount Hood/i.test(String(s?.vName || '')));
  if (!section) throw new Error('HOOD_POND_NO_CASCADE_SECTION');

  const text = stripHtml(section.summary || section.sectionHtml || '');
  const mentionsPond = /Coalman Glacier/i.test(text) && /(?:meltwater|melt pond|pond)/i.test(text);
  const alertLevel = String(section.alertLevel || latest.obsAlertLevel || '').toUpperCase();
  const colorCode = String(section.colorCode || latest.obsColorCode || '').toUpperCase();
  if (!['NORMAL', 'ADVISORY', 'WATCH', 'WARNING'].includes(alertLevel) ||
      !['GREEN', 'YELLOW', 'ORANGE', 'RED'].includes(colorCode)) {
    throw new Error('HOOD_POND_VOLCANO_STATUS_UNVERIFIED');
  }

  return {
    schema: 'evercraft.evermaps.environmental-event-evidence.v1',
    event_id: 'usgs-hood-coalman-pond-2026',
    checked_at_utc: new Date(checkedAt).toISOString(),
    event_type: 'glacial_meltwater_pond_potential_debris_flow',
    status: 'OFFICIAL_REPORTING_ONLY_NOT_A_LIVE_HAZARD_DETERMINATION',
    source: 'USGS Cascades Volcano Observatory HANS',
    source_url: officialNoticeUrl(latest.noticeUrl),
    current_notice: {
      notice_id: String(latest.noticeId || '').slice(0, 180),
      published_date_utc: /^\d{4}-\d{2}-\d{2}$/.test(String(latest.sentUtc || '')) ? latest.sentUtc : null,
      official_volcano_alert_level: alertLevel,
      official_aviation_color_code: colorCode,
      pond_discussed: mentionsPond,
      pond_reporting_state: mentionsPond ? 'MENTIONED_IN_LATEST_CVO_NOTICE' : 'NOT_MENTIONED_NOT_RESOLVED',
      excerpt: mentionsPond ? text.slice(0, 1200) : null
    },
    historical_baseline: HOOD_POND_BASELINE,
    guarantees: {
      volcano_alert_is_pond_safety_status: false,
      absence_of_pond_mention_is_resolution: false,
      historical_volume_is_current_measurement: false,
      provides_evacuations_or_access_clearance: false,
      computed_debris_flow_inundation: false,
      location_is_exact_pond_coordinate: false
    }
  };
}

export async function fetchHoodPondEvidence({
  fetchImpl = globalThis.fetch, timeoutMs = 12000, checkedAt = new Date().toISOString()
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation required');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(HOOD_POND_SOURCE.endpoint, {
      signal: controller.signal, redirect: 'error',
      headers: { Accept: 'application/json' }
    });
    if (!response?.ok) throw new Error('HOOD_POND_UPSTREAM_HTTP_' + String(response?.status ?? 'unknown'));
    const size = Number(response.headers?.get('content-length') || 0);
    if (size > HOOD_POND_SOURCE.maxBytes) throw new Error('HOOD_POND_FEED_TOO_LARGE');
    const body = await response.text();
    if (body.length > HOOD_POND_SOURCE.maxBytes) throw new Error('HOOD_POND_FEED_TOO_LARGE');
    let json;
    try { json = JSON.parse(body); } catch { throw new Error('HOOD_POND_INVALID_JSON'); }
    return normalizeHoodPondNotice(json, checkedAt);
  } finally {
    clearTimeout(timer);
  }
}

export function createOwnedHoodPondService({
  fetchImpl = globalThis.fetch, clock = Date.now, cacheMs = HOOD_POND_SOURCE.cacheMs
} = {}) {
  let cache = null, pending = null, lastFailure = null;
  async function read() {
    const now = clock();
    if (cache && now - cache.time < cacheMs) return cache.payload;
    if (pending) return pending;
    pending = (async () => {
      try {
        const payload = await fetchHoodPondEvidence({
          fetchImpl, checkedAt: new Date(now).toISOString()
        });
        cache = { time: now, payload };
        lastFailure = null;
        return payload;
      } catch (error) {
        cache = null;
        lastFailure = String(error?.message || error).slice(0, 140);
        throw error;
      } finally { pending = null; }
    })();
    return pending;
  }
  return {
    read,
    health: () => ({
      schema: 'evercraft.evermaps.environmental-event-source-health.v1',
      source: 'USGS CVO HANS',
      state: cache && clock() - cache.time < cacheMs ? 'fresh' : lastFailure ? 'unavailable' : 'not_loaded',
      last_failure: lastFailure,
      shipping_state: 'NOT_AUTHORIZED_BY_SOURCE_ADAPTER'
    })
  };
}
