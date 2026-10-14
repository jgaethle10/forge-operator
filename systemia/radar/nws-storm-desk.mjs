import crypto from 'node:crypto';

export const NWS_STORM_ALERTS_URL = 'https://api.weather.gov/alerts/active';
export const STORM_EVENT_PATTERN = /^(?:Severe Thunderstorm (?:Warning|Watch)|Tornado (?:Warning|Watch)|Flash Flood (?:Warning|Watch)|Flood (?:Warning|Watch)|Coastal Flood (?:Warning|Watch)|High Wind Warning|Hurricane (?:Warning|Watch)|Tropical Storm (?:Warning|Watch)|Storm Surge (?:Warning|Watch)|Extreme Wind Warning)$/i;
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const validTime = (v) => { const t=Date.parse(String(v || '')); return Number.isFinite(t) ? t : null; };
const hash = (v) => crypto.createHash('sha256').update(v).digest('hex').slice(0, 24);
const severity = (event) => {
  if (/Tornado Warning|Extreme Wind Warning|Flash Flood Warning|Storm Surge Warning/i.test(event)) return 1;
  if (/Severe Thunderstorm Warning|Hurricane Warning/i.test(event)) return .94;
  if (/Flood Warning|Tropical Storm Warning|High Wind Warning|Coastal Flood Warning/i.test(event)) return .86;
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
  const id = ref + '|' + new Date(issued).toISOString() + '|' + clean(p.messageType) + '|' + (expires ?? '');
  const key = 'nws:storm:' + hash(ref);
  const isWatch = /Watch/i.test(event);
  return {
    observation_id: 'nws-storm:' + hash(id),
    source_system: 'systemia-radar',
    source_family: 'noaa-nws-alerts',
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
  return [...new Map(alerts.map((row) => [row.observation_id, row])).values()]
    .sort((a, b) => b.anomaly_score - a.anomaly_score || b.observed_at.localeCompare(a.observed_at) || a.observation_id.localeCompare(b.observation_id))
    .slice(0, Math.max(1, Math.min(50, Number(options.max_items) || 25)));
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
  return { collector: 'nws-storm-desk', source_url: url, observations: parseStormAlerts(await response.json(), { now, max_items }) };
}
