import crypto from 'node:crypto';

const NWS_BASE = 'https://api.weather.gov';
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex').slice(0, 24);
const iso = (value) => {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
};

export function parseStormReportOffices(raw = '') {
  return [...new Set(String(raw).toUpperCase().split(',')
    .map((x) => x.trim()).filter((x) => /^[A-Z]{3}$/.test(x)))].slice(0, 4);
}

// NWS Local Storm Reports are preliminary compilations of received reports.
// This record verifies the NWS product was issued, NOT each report's accuracy.
export function parseNwsLocalStormReport(product, {
  office,
  now = new Date().toISOString(),
  max_age_hours = 48
} = {}) {
  if (!/^[A-Z]{3}$/.test(String(office || ''))) return null;
  const issuedAt = iso(product?.issuanceTime);
  const nowIso = iso(now);
  const body = clean(product?.productText);
  if (!issuedAt || !nowIso || !body) return null;
  const delta = Date.parse(nowIso) - Date.parse(issuedAt);
  if (delta < -5 * 60 * 1000 || delta > max_age_hours * 60 * 60 * 1000) return null;
  const id = clean(product?.id);
  // Keep the original official product citation if the ID is available.
  const url = id && /^[a-zA-Z0-9-]{8,80}$/.test(id)
    ? NWS_BASE + '/products/' + encodeURIComponent(id)
    : NWS_BASE + '/products/types/LSR/locations/' + office + '/latest';
  const key = 'nws:lsr:' + office + ':' + hash(id || issuedAt + body);
  return {
    observation_id: 'nws-lsr:' + hash(office + '|' + issuedAt + '|' + id + '|' + body),
    source_system: 'systemia-radar',
    source_family: 'noaa-nws',
    observed_at: issuedAt,
    region_key: 'NWS forecast office ' + office,
    domains: ['weather', 'emergency_report'],
    kind: 'storm_report',
    evidence_state: 'reported',
    reliability: 0.92,
    anomaly_score: 0.8,
    summary: 'NWS ' + office + ' issued a preliminary Local Storm Report on ' + issuedAt + '. Any reported impacts remain preliminary and require event-by-event verification.',
    provenance_refs: [url],
    correlation_keys: [key],
    facts: {
      subject_key: key,
      subject: 'Preliminary NWS Local Storm Report ' + office,
      product_type: 'LSR',
      preliminary: true,
      durable_record: true,
      impact_confirmed: false,
      forecast: false,
      issued_at: issuedAt,
      source_text_excerpt: body.slice(0, 600)
    },
    metadata: { collector: 'nws-local-storm-reports', publication_authority: false }
  };
}

export async function collectNwsLocalStormReports({
  fetchImpl = globalThis.fetch,
  now = new Date().toISOString(),
  offices = [],
  max_age_hours = 48
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch required');
  const selected = parseStormReportOffices(Array.isArray(offices) ? offices.join(',') : offices);
  if (!selected.length) throw new TypeError('at least one valid NWS forecast office required');
  const observations = [];
  const errors = [];
  for (const office of selected) {
    const url = NWS_BASE + '/products/types/LSR/locations/' + office + '/latest';
    try {
      const response = await fetchImpl(url, {
        headers: {
          accept: 'application/ld+json',
          'user-agent': 'Evercraft-Systemia-Radar/1.0 (+https://github.com/jgaethle10/forge-operator)'
        },
        signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(12000) : undefined
      });
      if (!response?.ok) throw new Error('HTTP ' + String(response?.status ?? 'unknown'));
      const payload = await response.json();
      const observation = parseNwsLocalStormReport(payload, { office, now, max_age_hours });
      if (observation) observations.push(observation);
    } catch (error) {
      errors.push(office + ': ' + String(error?.message || error).slice(0, 120));
    }
  }
  // Do not silently turn incomplete coverage into an all-clear.
  if (errors.length) throw new Error('NWS preliminary report source error: ' + errors.join('; '));
  return {
    collector: 'nws-local-storm-reports',
    source_url: NWS_BASE + '/products/types/LSR/locations',
    observations
  };
}
