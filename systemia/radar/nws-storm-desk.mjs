import crypto from 'node:crypto';

export const NWS_STORM_ALERTS_URL = 'https://api.weather.gov/alerts/active';
export const STORM_EVENT_PATTERN = /^(?:Severe Thunderstorm (?:Warning|Watch)|Tornado (?:Warning|Watch)|Flash Flood (?:Warning|Watch)|Flood (?:Warning|Watch)|Coastal Flood (?:Warning|Watch)|High Wind Warning|Hurricane (?:Warning|Watch)|Tropical Storm (?:Warning|Watch)|Storm Surge (?:Warning|Watch)|Extreme Wind Warning|Blizzard (?:Warning|Watch)|Winter Storm (?:Warning|Watch)|Ice Storm Warning|Snow Squall Warning|Lake Effect Snow Warning|Winter Weather Advisory|Flood Advisory|Coastal Flood Advisory|High Wind Watch)$/i;
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const validTime = (v) => { const t=Date.parse(String(v || '')); return Number.isFinite(t) ? t : null; };
const hash = (v) => crypto.createHash('sha256').update(v).digest('hex').slice(0, 24);
const severity = (event) => {
  if (/Tornado Warning|Extreme Wind Warning|Flash Flood Warning|Storm Surge Warning|Snow Squall Warning/i.test(event)) return 1;
  if (/Severe Thunderstorm Warning|Hurricane Warning|Blizzard Warning|Ice Storm Warning/i.test(event)) return .94;
  if (/Flood Warning|Tropical Storm Warning|High Wind Warning|Coastal Flood Warning|Winter Storm Warning|Lake Effect Snow Warning/i.test(event)) return .86;
  if (/Watch/i.test(event)) return .72;
  return .65;
};

// Official warning verifies issuance, NOT observed damage, winds or flood depth.
export function parseStormAlert(feature, { now = new Date().toISOString() } = {}) {
  const p = feature?.properties || {};
  const event = clean(p.event);
  const status = clean(p.status);
  const issued = validTime(p.sent || p.effective);
  const expires = validTime(p.expires || p.ends);
  const nowMs = validTime(now);
  if (!STORM_EVENT_PATTERN.test(event) || !issued || nowMs === null) return null;
  if (status && status !== 'Actual') return null;
  if (/^(?:Cancel|Error|Test|Update Cancellation)$/i.test(clean(p.messageType))) return null;
  if (issued > nowMs + 5 * 60 * 1000) return null;
  if (expires !== null && expires <= nowMs) return null;
  // Radar marks weather evidence stale at six hours; do not relabel old issuance as fresh.
  if (nowMs - issued > 6 * 60 * 60 * 1000) return null;
  const ref = clean(p['@id'] || feature?.id || p.id);
  if (!/^https:\/\/api\.weather\.gov\/alerts\/[a-z0-9:/?=&._%-]+$/i.test(ref)) return null;
  const region = clean(p.areaDesc || 'Unspecified NWS alert region').slice(0, 160);
  const states = [...new Set((Array.isArray(p.geocode?.UGC) ? p.geocode.UGC : [])
    .map((code) => String(code).slice(0, 2).toUpperCase())
    .filter((code) => /^[A-Z]{2}$/.test(code)))].slice(0, 10);
  const id = ref + '|' + new Date(issued).toISOString() + '|' + clean(p.messageType) + '|' + (expires ?? '');
  const key = 'nws:storm:' + hash(ref);
  const isWatch = /Watch/i.test(event);
  return {
    observation_id: 'nws-storm:' + hash(id),
    source_system: 'systemia-radar',
    source_family: 'noaa-nws',
    observed_at: new Date(issued).toISOString(),
    region_key: region,
    domains: ['weather', 'emergency_report'],
    kind: isWatch ? 'storm_watch' : 'storm_warning',
    evidence_state: 'verified',
    reliability: .99,
    anomaly_score: severity(event),
    summary: 'NWS ' + event + ' issued for ' + region + '. Official alert issuance; forecast hazard, not confirmed damage.',
    provenance_refs: [ref],
    correlation_keys: [key],
    facts: {
      subject_key: key,
      subject: 'NWS ' + event + ' in ' + region,
      lifecycle: 'active',
      forecast: true,
      impact_confirmed: false,
      event,
      states,
      official_alert_id: ref,
      issued_at: new Date(issued).toISOString(),
      expires_at: expires !== null ? new Date(expires).toISOString() : null,
      alert_urgency: clean(p.urgency),
      alert_certainty: clean(p.certainty),
      alert_severity: clean(p.severity)
    },
    metadata: { collector: 'nws-storm-desk', publication_authority: false }
  };
}

export function parseStormAlerts(payload, options = {}) {
  const rows = Array.isArray(payload?.features) ? payload.features : [];
  const alerts = rows.map((r) => parseStormAlert(r, options)).filter(Boolean);
  const ordered = [...new Map(alerts.map((row) => [row.observation_id, row])).values()]
    .sort((a, b) => b.anomaly_score - a.anomaly_score || b.observed_at.localeCompare(a.observed_at) || a.observation_id.localeCompare(b.observation_id));
  // Editorial selection is geographically diverse. One active tornado outbreak
  // should not silently erase all other states from the national desk's cap.
  const limit = Math.max(1, Math.min(50, Number(options.max_items) || 25));
  const pools = new Map();
  for (const row of ordered) {
    const state = row.facts.states[0] || 'unknown';
    if (!pools.has(state)) pools.set(state, []);
    pools.get(state).push(row);
  }
  const selected = [];
  while (selected.length < limit) {
    let added = false;
    for (const pool of pools.values()) {
      if (selected.length >= limit) break;
      const next = pool.shift();
      if (!next) continue;
      selected.push(next);
      added = true;
    }
    if (!added) break;
  }
  return selected;
}

export async function collectNwsStormAlerts({
  fetchImpl = globalThis.fetch,
  now = new Date().toISOString(),
  url = NWS_STORM_ALERTS_URL,
  max_items = 25
} = {}) {
  if (url !== NWS_STORM_ALERTS_URL) throw new Error('NWS source URL must use the official active alerts endpoint');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch required');
  const response = await fetchImpl(url, {
    headers: { accept: 'application/geo+json', 'user-agent': 'Evercraft-Systemia-Radar/1.0 (+https://github.com/jgaethle10/forge-operator)' },
    signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(12000) : undefined
  });
  if (!response?.ok) throw new Error('NWS alerts HTTP ' + String(response?.status ?? 'unknown'));
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.features)) throw new TypeError('NWS alerts response missing GeoJSON features');
  return { collector: 'nws-storm-desk', source_url: url, observations: parseStormAlerts(payload, { now, max_items }) };
}
