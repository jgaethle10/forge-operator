#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new URL(raw);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('crawl observatory URL must use HTTP or HTTPS');
  return parsed.toString();
}

function resolveObservatoryUrl() {
  const explicit = normalizeUrl(process.env.CHUM_CRAWL_OBSERVATORY_URL || '');
  if (explicit) return explicit;
  const origin = normalizeUrl(process.env.CHUM_PUBLIC_ORIGIN || '');
  if (!origin) return null;
  return new URL('/api/chum/crawl-observatory', origin).toString();
}

const artifactDir = path.resolve(process.cwd(), 'artifacts', 'chum');
const snapshotPath = path.join(artifactDir, 'crawl-observation-live.json');
const receiptPath = path.join(artifactDir, 'crawl-sonar-pull-latest.json');
fs.mkdirSync(artifactDir, { recursive: true });

const url = resolveObservatoryUrl();
const token = String(process.env.CHUM_CRAWL_OBSERVATORY_TOKEN || '').trim();

if (!url || !token) {
  if (fs.existsSync(snapshotPath)) fs.rmSync(snapshotPath, { force: true });
  const receipt = {
    schema: 'evercraft.chum.crawl-sonar-pull-receipt.v1',
    at: new Date().toISOString(),
    status: 'skipped_not_configured',
    url_configured: Boolean(url),
    token_configured: Boolean(token),
  };
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
  process.exit(0);
}

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 15000);
let response;
try {
  response = await fetch(url, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      'user-agent': 'Evercraft-CHUM-Sonar/1.0 (+crawl-observation-pull)',
    },
    signal: controller.signal,
  });
} finally {
  clearTimeout(timer);
}

if (!response.ok) {
  const body = await response.text();
  throw new Error(`crawl observatory returned HTTP ${response.status}: ${body.slice(0, 300)}`);
}

const payload = await response.json();
if (payload?.ok !== true || payload?.state?.schema !== 'evercraft.chum.crawl-observation-state.v1') {
  throw new Error('crawl observatory returned an invalid observation snapshot');
}

fs.writeFileSync(snapshotPath, JSON.stringify(payload.state, null, 2) + '\n');

const receipt = {
  schema: 'evercraft.chum.crawl-sonar-pull-receipt.v1',
  at: new Date().toISOString(),
  status: 'observed',
  source_url: url,
  evidence_state: payload.evidence_state || payload.state.evidence_state || 'user_agent_claim_unverified',
  claimed_crawler_family_count: Number(payload.claimed_crawler_family_count || 0),
  observed_path_count: Number(payload.observed_path_count || 0),
  total_claimed_crawler_hits: Number(payload.total_claimed_crawler_hits || 0),
  output: 'artifacts/chum/crawl-observation-live.json',
  truth_boundary: 'This snapshot records crawler-shaped HTTP User-Agent claims. It does not prove indexing, ranking, citation, recommendation, retention, or provider identity.',
};

fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
