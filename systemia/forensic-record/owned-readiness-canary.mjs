#!/usr/bin/env node
/**
 * Files Companion owned-only public readiness canary.
 *
 * This probe NEVER targets the legacy platform automatically.
 * Default: loopback only. To probe public HTTPS, first independently
 * verify Evercraft owns the active route, then supply an immutable
 * Evercraft deployment/edge receipt via EVERCRAFT_OWNED_ROUTE_RECEIPT.
 *
 * Usage:
 *   node systemia/forensic-record/owned-readiness-canary.mjs http://127.0.0.1:8765
 *   EVERCRAFT_OWNED_ROUTE_RECEIPT="<receipt ref>" node ... https://filescompanion.com
 *
 * Emits machine-readable JSON. Does not write, deploy, cut over, or publish.
 */
import { URL } from 'node:url';

const supplied = process.argv[2];
if (!supplied) {
  console.error('Usage: node owned-readiness-canary.mjs <owned-runtime-url>');
  process.exit(2);
}
let base;
try {
  base = new URL(supplied);
} catch {
  console.error('invalid_url');
  process.exit(2);
}
const local = ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname);
const receipt = (process.env.EVERCRAFT_OWNED_ROUTE_RECEIPT || '').trim();
if (base.protocol !== (local ? 'http:' : 'https:') && base.protocol !== 'https:') {
  console.error('unsupported_url_protocol');
  process.exit(2);
}
if (!local && receipt.length < 16) {
  console.error('HOLD: public probing requires an independently verified Evercraft-owned route receipt; no Base44/legacy egress allowed.');
  process.exit(2);
}
if (base.username || base.password || base.search || base.hash) {
  console.error('url_credentials_or_fragments_not_allowed');
  process.exit(2);
}
const origin = base.origin;
const findings = [];
async function request(name, route, options = {}) {
  try {
    const response = await fetch(new URL(route, origin), {
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      ...options,
    });
    const body = await response.text();
    const type = response.headers.get('content-type') || '';
    let json = null;
    if (type.includes('application/json')) {
      try { json = JSON.parse(body); } catch {}
    }
    return {name, status: response.status, status_ok: response.ok, type, body, json};
  } catch (error) {
    return {name, status: null, status_ok: false, type: '', body: '', json: null,
      error: String(error && error.message || error)};
  }
}
function evidence(name, passed, detail, required = true) {
  findings.push({check: name, passed: Boolean(passed), required, detail});
}
const health = await request('health', '/health');
evidence('owned_health', health.status_ok && health.json?.read_only === true &&
  health.json?.base44_runtime_required === false &&
  health.json?.protected_domains_exposed === false &&
  health.json?.write_routes_exposed === false, health.error || health.status);
const api = await request('api', '/api');
const routes = api.json?.routes;
evidence('public_api', api.status_ok && Array.isArray(routes) &&
  routes.includes('POST /v1/search') &&
  routes.includes('GET /v1/findings/:number') &&
  api.json?.mode === 'read_only', api.error || routes || api.status);
const stats = await request('stats', '/v1/stats');
evidence('verified_corpus', stats.status_ok && stats.json?.seed_complete === true &&
  Number(stats.json?.finding_rows) > 0, stats.error || {
    http_status: stats.status,
    finding_rows: stats.json?.finding_rows ?? null,
    seed_complete: stats.json?.seed_complete ?? null,
  });
const page = await request('homepage', '/');
evidence('public_page', page.status_ok && page.body.includes('The Forensic Record') &&
  page.body.includes('content-gate'), page.error || page.status);
const css = await request('stylesheet', '/styles.css');
const js = await request('javascript', '/app.js');
evidence('frontend_assets', css.status_ok && js.status_ok &&
  css.type.includes('text/css') && js.type.includes('javascript'), {
  css: css.status, javascript: js.status,
});
const search = await request('search', '/v1/search', {
  method: 'POST',
  headers: {'content-type': 'application/json'},
  body: JSON.stringify({text: 'Epstein', limit: 5}),
});
const rows = search.json?.results;
evidence('search_contract', search.status_ok && Array.isArray(rows),
  search.error || {http_status: search.status, results: Array.isArray(rows) ? rows.length : null});
const candidate = Array.isArray(rows) ? rows.find(row =>
  Number.isInteger(Number(row.finding_number)) && Number(row.finding_number) > 0) : null;
if (candidate) {
  const number = Number(candidate.finding_number);
  const detail = await request('detail', '/v1/findings/' + number);
  evidence('finding_lookup', detail.status_ok && Array.isArray(detail.json?.results),
    detail.error || {http_status: detail.status, finding_number: number});
} else {
  evidence('finding_lookup', false, 'No finding returned for an exact lookup', false);
}
const citationCount = Array.isArray(rows)
  ? rows.filter(row => {
      try {
        return Boolean(row.page_reference) && ['http:', 'https:'].includes(
          new URL(row.source_url).protocol);
      } catch { return false; }
    }).length : 0;
evidence('citation_candidates', citationCount > 0,
  {candidate_count: citationCount, original_source_verified: false}, false);
const requiredPass = findings.every(f => !f.required || f.passed);
const result = {
  schema: 'evercraft.forensic-record.owned-readiness-canary.v1',
  checked_at: new Date().toISOString(),
  base: origin,
  owned_route_receipt: local ? 'loopback' : receipt,
  probe_result: requiredPass ? 'runtime_canary_pass' : 'hold',
  publish_ready: false,
  note: 'This canary cannot validate original source documents, victim privacy, deployment provenance, mobile usability, or canonical cutover. A passing result is NOT launch authorization.',
  checks: findings,
};
console.log(JSON.stringify(result, null, 2));
if (!requiredPass) process.exitCode = 1;
