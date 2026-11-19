#!/usr/bin/env node
// Read-only source-to-live FAIE studio parity. Never triggers release, checkout, or user operations.
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const origin = (process.env.EVERCRAFT_OPERATOR_EDGE_ORIGIN || 'https://fabric.systemiacommandcenters.com').replace(/\/+$/, '');
const target = new URL(origin);
if (target.protocol !== 'https:' || target.hostname !== 'fabric.systemiacommandcenters.com') {
  throw new Error('faie_studio_parity_requires_canonical_owned_https_origin');
}
const source = fs.readFileSync(new URL('../public/faie/index.html', import.meta.url));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sourceHash = sha(source);
const marker = 'FAIE EXPERIENCE REVAMP 2026-11-19';
const result = {
  schema: 'evercraft.faie.studio-live-parity.v1',
  observed_at: new Date().toISOString(),
  origin,
  source_sha256: sourceHash,
  pages: [],
  healthy: false,
  no_external_write: true
};

async function load(route) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(origin + route, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'cache-control': 'no-cache', 'user-agent': 'Evercraft-FAIE-Studio-Parity/1.0' }
    });
    if (!response.url.startsWith(origin + '/')) throw new Error('unexpected_redirect_origin');
    if (!response.ok) throw new Error('http_' + response.status);
    return { response, body: Buffer.from(await response.arrayBuffer()) };
  } finally {
    clearTimeout(timer);
  }
}

try {
  for (const route of ['/faie/', '/faie/agnormal/']) {
    const { response, body } = await load(route);
    const contentType = response.headers.get('content-type') || '';
    const text = body.toString('utf8');
    const entry = {
      route,
      status: response.status,
      content_type: contentType,
      live_sha256: sha(body),
      exact_source_match: sha(body) === sourceHash,
      studio_marker_present: text.includes(marker),
      metric_ids_present: text.includes('id="metricSignals"') && text.includes('id="metricChecked"'),
      investigation_form_present: text.includes('id="form"'),
      activity_hud_present: text.includes('id="activityHud"')
    };
    entry.verified = entry.exact_source_match && entry.studio_marker_present &&
      entry.metric_ids_present && entry.investigation_form_present &&
      entry.activity_hud_present && /^text\/html/i.test(contentType);
    result.pages.push(entry);
  }
  const { body } = await load('/api/faie/health');
  const health = JSON.parse(body.toString('utf8'));
  result.api = {
    ok: health.ok === true,
    fabric_native: health.fabric_native === true,
    evidence_count: health.signal_count ?? null,
    preview_persists_queries: health.public_preview_persists_queries,
    base44_transport_enabled: health.base44_transport_enabled
  };
  result.healthy = result.pages.every((page) => page.verified) &&
    result.api.ok && result.api.fabric_native &&
    result.api.preview_persists_queries === false &&
    result.api.base44_transport_enabled === false;
  result.state = result.healthy ? 'SOURCE_TO_LIVE_MATCH' : 'DEPLOYMENT_PARITY_HOLD';
} catch (error) {
  result.state = 'DEPLOYMENT_PARITY_HOLD';
  result.error = error instanceof Error ? error.message : String(error);
}
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
if (!result.healthy) process.exitCode = 1;
