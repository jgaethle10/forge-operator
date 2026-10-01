const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const clamp01 = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
};

async function fetchJson(url, {
  fetchImpl = globalThis.fetch,
  timeout_ms = 12000,
  headers = {}
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation unavailable');
  const response = await fetchImpl(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Evercraft-Systemia-Radar/1.0',
      ...headers
    },
    signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(timeout_ms) : undefined
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.json();
}

function usgsAnomaly({ count, largestMagnitude }) {
  const countScore = clamp01((count - 6) / 30, 0);
  const magnitudeScore = clamp01((largestMagnitude - 4.5) / 3.5, 0);
  return Number((0.45 * countScore + 0.55 * magnitudeScore).toFixed(3));
}

export async function collectUsgsEarthquakes({
  fetchImpl = globalThis.fetch,
  now = new Date().toISOString(),
  url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson'
} = {}) {
  const payload = await fetchJson(url, { fetchImpl });
  const features = Array.isArray(payload?.features) ? payload.features : [];
  const rows = features
    .map((feature) => ({
      id: clean(feature?.id),
      magnitude: Number(feature?.properties?.mag),
      place: clean(feature?.properties?.place),
      time: Number(feature?.properties?.time),
      status: clean(feature?.properties?.status),
      tsunami: Number(feature?.properties?.tsunami || 0),
      url: clean(feature?.properties?.url)
    }))
    .filter((row) => Number.isFinite(row.magnitude))
    .sort((a, b) => b.magnitude - a.magnitude);

  const largest = rows[0] || null;
  const generated = Number(payload?.metadata?.generated);
  const observedAt = Number.isFinite(generated)
    ? new Date(generated).toISOString()
    : new Date(now).toISOString();

  return {
    collector: 'usgs-earthquakes',
    source_url: url,
    observations: [{
      source_system: 'systemia-radar',
      source_family: 'usgs-earthquake-hazards',
      observed_at: observedAt,
      region_key: 'global',
      domains: ['geophysics', 'earth_hazards'],
      kind: 'seismic_feed_state',
      evidence_state: 'observed',
      reliability: 0.98,
      anomaly_score: usgsAnomaly({
        count: rows.length,
        largestMagnitude: largest?.magnitude || 0
      }),
      summary: largest
        ? `USGS M4.5+ past-day feed contains ${rows.length} events; largest is M${largest.magnitude.toFixed(1)} ${largest.place}.`
        : 'USGS M4.5+ past-day feed contains no current events.',
      provenance_refs: [url],
      correlation_keys: ['usgs:m4.5-plus:past-day'],
      facts: {
        subject_key: 'usgs:m4.5-plus:past-day',
        subject: 'USGS M4.5+ earthquakes, past day',
        count: rows.length,
        largest_magnitude: largest?.magnitude ?? null,
        largest_place: largest?.place ?? null,
        durable_record: false
      },
      measurements: rows.slice(0, 20).map((row) => ({
        event_id: row.id,
        magnitude: row.magnitude,
        place: row.place,
        observed_at: Number.isFinite(row.time) ? new Date(row.time).toISOString() : null,
        status: row.status,
        tsunami_flag: row.tsunami,
        source_url: row.url
      })),
      metadata: {
        collector: 'usgs-earthquakes',
        feed_count: Number(payload?.metadata?.count ?? rows.length)
      }
    }]
  };
}

function parseSwpcMessage(message) {
  const text = clean(message);
  const fields = {};
  for (const line of String(message || '').split(/\r?\n/)) {
    const match = line.match(/^([^:]{2,50}):\s*(.+)$/);
    if (!match) continue;
    fields[clean(match[1]).toLowerCase().replace(/[^a-z0-9]+/g, '_')] = clean(match[2]);
  }
  return { text, fields };
}

function swpcAnomaly(productId, text) {
  const haystack = `${productId} ${text}`.toLowerCase();
  if (/g5|extreme|severe/.test(haystack)) return 1;
  if (/g4|g3|strong/.test(haystack)) return 0.85;
  if (/g2|moderate/.test(haystack)) return 0.72;
  if (/g1|minor|exceeded|alert/.test(haystack)) return 0.58;
  if (/watch|warning/.test(haystack)) return 0.48;
  return 0.3;
}

export async function collectNoaaSpaceWeather({
  fetchImpl = globalThis.fetch,
  now = new Date().toISOString(),
  url = 'https://services.swpc.noaa.gov/products/alerts.json',
  recent_hours = 72,
  max_items = 20
} = {}) {
  const payload = await fetchJson(url, { fetchImpl });
  const rows = Array.isArray(payload) ? payload : [];
  const nowMs = new Date(now).getTime();
  const cutoff = nowMs - recent_hours * 60 * 60 * 1000;
  const observations = [];

  for (const item of rows) {
    const issue = new Date(String(item?.issue_datetime || '').replace(' ', 'T') + 'Z');
    if (!Number.isFinite(issue.getTime()) || issue.getTime() < cutoff) continue;

    const productId = clean(item?.product_id || 'unknown');
    const parsed = parseSwpcMessage(item?.message || '');
    const lifecycleState = /cancel|ended|conditions.*no longer/i.test(parsed.text)
      ? 'closed'
      : /watch|warning|predicted|expected/i.test(parsed.text)
        ? 'pending'
        : 'active';

    observations.push({
      source_system: 'systemia-radar',
      source_family: 'noaa-space-weather-prediction-center',
      observed_at: issue.toISOString(),
      region_key: 'global',
      domains: ['space_weather'],
      kind: /watch|predicted|expected/i.test(parsed.text) ? 'space_weather_forecast' : 'space_weather_alert',
      evidence_state: /observed|reached|exceeded/i.test(parsed.text) ? 'observed' : 'reported',
      reliability: 0.98,
      anomaly_score: swpcAnomaly(productId, parsed.text),
      summary: `NOAA SWPC ${productId}: ${parsed.text.slice(0, 320)}`,
      provenance_refs: [url],
      correlation_keys: [`noaa-swpc:${productId.toLowerCase()}`],
      facts: {
        subject_key: `noaa-swpc:${productId.toLowerCase()}`,
        subject: `NOAA SWPC ${productId}`,
        product_id: productId,
        lifecycle: lifecycleState,
        forecast: /watch|predicted|expected/i.test(parsed.text),
        alert_fields: parsed.fields
      },
      metadata: {
        collector: 'noaa-space-weather'
      }
    });

    if (observations.length >= max_items) break;
  }

  return {
    collector: 'noaa-space-weather',
    source_url: url,
    observations
  };
}



const NWS_ALERTS_URL = 'https://api.weather.gov/alerts/active';
const NASA_EONET_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100&days=30';

const nwsSeverity = Object.freeze({ Extreme: 1, Severe: 0.88, Moderate: 0.66, Minor: 0.42, Unknown: 0.3 });
const nwsCertainty = Object.freeze({ Observed: 1, Likely: 0.88, Possible: 0.62, Unlikely: 0.3, Unknown: 0.5 });
const nwsUrgency = Object.freeze({ Immediate: 1, Expected: 0.85, Future: 0.55, Past: 0.2, Unknown: 0.5 });

function nwsPriority(properties = {}) {
  const severity = nwsSeverity[properties.severity] ?? nwsSeverity.Unknown;
  const certainty = nwsCertainty[properties.certainty] ?? nwsCertainty.Unknown;
  const urgency = nwsUrgency[properties.urgency] ?? nwsUrgency.Unknown;
  return clamp01(0.5 * severity + 0.3 * certainty + 0.2 * urgency, 0.3);
}

export async function collectNwsActiveHazards({
  fetchImpl = globalThis.fetch,
  now = new Date().toISOString(),
  url = NWS_ALERTS_URL,
  max_items = 80
} = {}) {
  const payload = await fetchJson(url, {
    fetchImpl,
    headers: {
      accept: 'application/geo+json, application/json',
      'user-agent': 'Evercraft-Systemia-Radar/1.0 (https://github.com/jgaethle10/forge-operator)'
    }
  });
  const features = Array.isArray(payload?.features) ? payload.features : [];
  const nowMs = new Date(now).getTime();

  const rows = features.map((feature) => {
    const p = feature?.properties || {};
    const event = clean(p.event || 'Weather alert');
    const observedAt = p.sent || p.effective || p.onset || now;
    const eventId = clean(feature?.id || p.id || p['@id'] || event + ':' + observedAt);
    const expiresMs = new Date(p.expires || p.ends || '').getTime();
    const active = !Number.isFinite(expiresMs) || expiresMs >= nowMs;
    const forecast = p.certainty !== 'Observed' || /watch|warning|outlook|advisory/i.test(event);
    return {
      eventId,
      event,
      headline: clean(p.headline || p.description || ''),
      area: clean(p.areaDesc || 'United States'),
      observedAt,
      active,
      forecast,
      score: nwsPriority(p),
      severity: clean(p.severity || 'Unknown'),
      certainty: clean(p.certainty || 'Unknown'),
      urgency: clean(p.urgency || 'Unknown'),
      sourceUrl: clean(p['@id'] || feature?.id || url)
    };
  })
    .filter((row) => row.active)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(200, Number(max_items) || 80)));

  return {
    collector: 'noaa-nws-active-hazards',
    source_url: url,
    observations: rows.map((row) => ({
      source_system: 'systemia-radar',
      source_family: 'noaa-national-weather-service',
      observed_at: row.observedAt,
      region_key: row.area,
      domains: ['weather', 'disaster'],
      kind: 'nws_alert_' + row.event.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
      evidence_state: 'verified',
      reliability: 0.97,
      anomaly_score: row.score,
      summary: [row.event, row.area, row.headline].filter(Boolean).join(': ').slice(0, 520),
      provenance_refs: [row.sourceUrl || url],
      correlation_keys: ['nws-alert:' + row.eventId],
      facts: {
        subject_key: 'nws-alert:' + row.eventId,
        subject: row.event + ' in ' + row.area,
        lifecycle: 'active',
        forecast: row.forecast,
        severity: row.severity,
        certainty: row.certainty,
        urgency: row.urgency,
        durable_record: false
      },
      metadata: {
        collector: 'noaa-nws-active-hazards',
        official_alert: true
      }
    }))
  };
}

function eonetDomains(categories = []) {
  const ids = categories.map((row) => clean(row?.id || row?.title).toLowerCase());
  const domains = new Set(['environment']);
  for (const id of ids) {
    if (/storm|snow|temperature|dust|haze/.test(id)) domains.add('weather');
    if (/flood|drought/.test(id)) domains.add('water');
    if (/drought/.test(id)) domains.add('agriculture');
    if (/volcano|earthquake|landslide/.test(id)) domains.add('earth_hazards');
    if (/volcano|earthquake/.test(id)) domains.add('geophysics');
    if (/sea|ice|ocean|watercolor/.test(id)) domains.add('ocean');
    if (/ice|drought|temperature/.test(id)) domains.add('climate');
    if (/flood|storm|wildfire|volcano|earthquake|landslide/.test(id)) domains.add('disaster');
  }
  return [...domains];
}

function firstCoordinate(value) {
  if (!Array.isArray(value)) return null;
  if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
    return [Number(value[0]), Number(value[1])];
  }
  for (const child of value) {
    const found = firstCoordinate(child);
    if (found) return found;
  }
  return null;
}

function eonetRegion(event) {
  const geometry = Array.isArray(event?.geometry) ? event.geometry : [];
  const latest = geometry[geometry.length - 1] || null;
  const point = firstCoordinate(latest?.coordinates);
  if (!point) return 'global';
  const lon = Math.max(-180, Math.min(180, point[0]));
  const lat = Math.max(-90, Math.min(90, point[1]));
  const coarseLon = Math.round(lon / 5) * 5;
  const coarseLat = Math.round(lat / 5) * 5;
  return 'eonet-cell:' + coarseLat + ':' + coarseLon;
}

export async function collectNasaEonet({
  fetchImpl = globalThis.fetch,
  now = new Date().toISOString(),
  url = NASA_EONET_URL,
  max_items = 100
} = {}) {
  const payload = await fetchJson(url, { fetchImpl });
  const events = Array.isArray(payload?.events) ? payload.events : [];

  const observations = events.slice(0, Math.max(1, Math.min(200, Number(max_items) || 100))).map((event) => {
    const geometry = Array.isArray(event?.geometry) ? event.geometry : [];
    const latest = geometry[geometry.length - 1] || {};
    const eventId = clean(event?.id || event?.title || 'unknown-event');
    const categories = Array.isArray(event?.categories) ? event.categories : [];
    const categoryLabels = categories.map((row) => clean(row?.title || row?.id)).filter(Boolean);
    const sourceUrls = (Array.isArray(event?.sources) ? event.sources : [])
      .map((row) => clean(row?.url))
      .filter(Boolean);
    const observedAt = latest?.date && Number.isFinite(new Date(latest.date).getTime())
      ? new Date(latest.date).toISOString()
      : new Date(now).toISOString();

    return {
      source_system: 'systemia-radar',
      source_family: 'nasa-eonet',
      observed_at: observedAt,
      region_key: eonetRegion(event),
      domains: eonetDomains(categories),
      kind: 'nasa_eonet_open_event',
      evidence_state: 'reported',
      reliability: 0.9,
      anomaly_score: 0.5,
      summary: [clean(event?.title), categoryLabels.join(', '), clean(event?.description)].filter(Boolean).join(': ').slice(0, 520),
      provenance_refs: [...new Set([clean(event?.link), ...sourceUrls].filter(Boolean))],
      correlation_keys: ['nasa-eonet:' + eventId],
      facts: {
        subject_key: 'nasa-eonet:' + eventId,
        subject: clean(event?.title || eventId),
        lifecycle: event?.closed ? 'closed' : 'active',
        forecast: false,
        eonet_categories: categoryLabels,
        eonet_source_ids: (Array.isArray(event?.sources) ? event.sources : []).map((row) => clean(row?.id)).filter(Boolean),
        durable_record: false
      },
      metadata: {
        collector: 'nasa-eonet',
        intake_role: 'event_discovery_not_independent_corroboration'
      }
    };
  });

  return {
    collector: 'nasa-eonet',
    source_url: url,
    observations
  };
}

export const OFFICIAL_COLLECTORS = Object.freeze([
  { id: 'usgs-earthquakes', run: collectUsgsEarthquakes },
  { id: 'noaa-space-weather', run: collectNoaaSpaceWeather },
  { id: 'noaa-nws-active-hazards', run: collectNwsActiveHazards },
  { id: 'nasa-eonet', run: collectNasaEonet }
]);

export async function runOfficialCollectors({
  fetchImpl = globalThis.fetch,
  now = new Date().toISOString(),
  collectors = OFFICIAL_COLLECTORS
} = {}) {
  const observations = [];
  const receipts = [];

  for (const collector of collectors) {
    const started = new Date().toISOString();
    try {
      const result = await collector.run({ fetchImpl, now });
      observations.push(...(result.observations || []));
      receipts.push({
        schema: 'evercraft.systemia-radar.collector-receipt.v1',
        collector: collector.id,
        status: 'pass',
        source_url: result.source_url || null,
        observation_count: result.observations?.length || 0,
        started_at: started,
        finished_at: new Date().toISOString()
      });
    } catch (error) {
      receipts.push({
        schema: 'evercraft.systemia-radar.collector-receipt.v1',
        collector: collector.id,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        started_at: started,
        finished_at: new Date().toISOString()
      });
    }
  }

  return {
    schema: 'evercraft.systemia-radar.collector-run.v1',
    generated_at: new Date().toISOString(),
    observations,
    receipts
  };
}
