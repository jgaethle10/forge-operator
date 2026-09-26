#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CRAWLERS = [
  ['openai-search', /\bOAI-SearchBot\b/i],
  ['openai-user', /\bChatGPT-User\b/i],
  ['openai-training', /\bGPTBot\b/i],
  ['anthropic-search', /\bClaude-SearchBot\b/i],
  ['anthropic-user', /\bClaude-User\b/i],
  ['anthropic-crawler', /\bClaudeBot\b/i],
  ['google-search', /\bGooglebot\b/i],
  ['google-ai', /\bGoogle-Extended\b|\bGoogle-CloudVertexBot\b|\bGoogle-Agent\b|\bGoogle-GeminiNotebook\b/i],
  ['microsoft-search', /\bbingbot\b/i],
  ['perplexity', /\bPerplexityBot\b/i],
  ['apple-ai', /\bApplebot-Extended\b/i],
  ['apple-search', /\bApplebot\b/i],
];

const DISCOVERY_PREFIXES = [
  '/chum/',
  '/forensiscope/',
  '/rivet/',
  '/.well-known/',
  '/llms',
  '/ai',
  '/openapi',
  '/schema',
  '/sitemap',
  '/robots'
];

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function iso(value = new Date()) {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
}

function safePath(value) {
  const raw = clean(value).split('?')[0].split('#')[0] || '/';
  if (!raw.startsWith('/')) return '/';
  try {
    return new URL(raw, 'https://evercraft.invalid').pathname;
  } catch {
    return '/';
  }
}

function isDiscoveryPath(pathname) {
  return pathname === '/' || DISCOVERY_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function classifyCrawlerUserAgent(userAgent) {
  const value = clean(userAgent);
  if (!value) return null;
  for (const [family, pattern] of CRAWLERS) {
    if (pattern.test(value)) return family;
  }
  return null;
}

export function createCrawlerObservation({
  pathname,
  method = 'GET',
  userAgent = '',
  statusCode = 0,
  observedAt = new Date(),
} = {}) {
  const family = classifyCrawlerUserAgent(userAgent);
  const route = safePath(pathname);
  if (!family || !isDiscoveryPath(route)) return null;
  const normalizedMethod = clean(method).toUpperCase();
  if (!['GET', 'HEAD'].includes(normalizedMethod)) return null;

  return {
    schema: 'evercraft.chum.crawler-observation.v1',
    crawler_family: family,
    path: route,
    method: normalizedMethod,
    status_code: Number(statusCode || 0),
    ok: Number(statusCode || 0) >= 200 && Number(statusCode || 0) < 400,
    observed_at: iso(observedAt),
    evidence_state: 'self_identified_user_agent',
    privacy: {
      ip_recorded: false,
      query_recorded: false,
      cookie_recorded: false,
      visitor_identity_recorded: false,
    },
  };
}

export function createCrawlerRadarStore({ maxEvents = 5000, persistPath = '' } = {}) {
  const events = [];
  const max = Math.max(100, Math.min(50000, Number(maxEvents) || 5000));
  const file = clean(persistPath);

  function append(event) {
    if (!event) return null;
    events.push(event);
    if (events.length > max) events.splice(0, events.length - max);

    if (file) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, JSON.stringify(event) + '\n');
    }
    return event;
  }

  function observe(input) {
    return append(createCrawlerObservation(input));
  }

  function snapshot({ since = null } = {}) {
    const sinceMs = since ? Date.parse(since) : Number.NEGATIVE_INFINITY;
    const selected = events.filter((row) => Date.parse(row.observed_at) >= sinceMs);
    const paths = {};
    const crawlers = {};

    for (const row of selected) {
      const pathState = paths[row.path] ||= {
        path: row.path,
        total_fetches: 0,
        successful_fetches: 0,
        crawler_families: {},
        last_observed_at: null,
      };
      pathState.total_fetches += 1;
      if (row.ok) pathState.successful_fetches += 1;
      pathState.crawler_families[row.crawler_family] =
        (pathState.crawler_families[row.crawler_family] || 0) + 1;
      if (!pathState.last_observed_at || row.observed_at > pathState.last_observed_at) {
        pathState.last_observed_at = row.observed_at;
      }

      const crawlerState = crawlers[row.crawler_family] ||= {
        crawler_family: row.crawler_family,
        total_fetches: 0,
        successful_fetches: 0,
        last_observed_at: null,
      };
      crawlerState.total_fetches += 1;
      if (row.ok) crawlerState.successful_fetches += 1;
      if (!crawlerState.last_observed_at || row.observed_at > crawlerState.last_observed_at) {
        crawlerState.last_observed_at = row.observed_at;
      }
    }

    return {
      schema: 'evercraft.chum.crawler-radar.runtime.v1',
      generated_at: new Date().toISOString(),
      evidence_state: 'self_identified_user_agent_aggregate',
      truth_boundary: 'These are requests whose user-agent identified as a crawler family. They are not proof of provider ownership, indexing, ranking, training, citation, recommendation, or conversion.',
      privacy: {
        ip_recorded: false,
        query_recorded: false,
        cookie_recorded: false,
        visitor_identity_recorded: false,
      },
      event_count: selected.length,
      paths: Object.values(paths).sort((a, b) => b.total_fetches - a.total_fetches || a.path.localeCompare(b.path)),
      crawlers: Object.values(crawlers).sort((a, b) => b.total_fetches - a.total_fetches || a.crawler_family.localeCompare(b.crawler_family)),
    };
  }

  return { observe, snapshot };
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function readNdjson(file) {
  if (!file || !fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

function providerMisses(root) {
  const dir = path.join(root, 'conformance', 'provider-observations');
  if (!fs.existsSync(dir)) return [];
  const misses = [];
  for (const name of fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort()) {
    const row = readJson(path.join(dir, name));
    if (row?.schema !== 'evercraft.provider-observation.v1') continue;
    const surfaced = Object.entries(row)
      .find(([key]) => key.startsWith('surfaced_'))?.[1];
    if (surfaced !== false) continue;
    misses.push({
      provider: clean(row.provider).toLowerCase(),
      product_key: clean(row.product_key).toLowerCase(),
      observed_at: iso(row.observed_at),
      source: clean(row.source),
      file: 'conformance/provider-observations/' + name,
    });
  }
  return misses;
}

function productKeyFromPath(pathname) {
  const parts = safePath(pathname).split('/').filter(Boolean);
  if (parts[0] === 'forensiscope') return 'forensiscope';
  if (parts[0] === 'chum' && parts[1] === 'products' && parts[2]) return parts[2];
  if (parts[0] === 'chum' && parts[1] === 'intents' && parts[2]) {
    const match = parts[2].match(/^([a-z0-9-]+?)(?:-(?:site|evidence|report|machine|audit|brief|router|overflow|service|opportunity|analysis|search|handoff|snapshot|v\d).*)?$/);
    return match?.[1] || null;
  }
  return null;
}

function latestObservationByPath(observations) {
  const map = new Map();
  for (const row of observations || []) {
    if (row?.schema !== 'evercraft.chum.crawler-observation.v1') continue;
    const pathname = safePath(row.path);
    const at = iso(row.observed_at);
    const prior = map.get(pathname);
    if (!prior || at > prior.observed_at) {
      map.set(pathname, { observed_at: at, crawler_family: clean(row.crawler_family), ok: row.ok === true });
    }
  }
  return map;
}

function runtimeRows(snapshot) {
  if (snapshot?.schema !== 'evercraft.chum.crawler-radar.runtime.v1') return [];
  return (snapshot.paths || []).flatMap((row) => row.last_observed_at ? [{
    schema: 'evercraft.chum.crawler-observation.v1',
    path: row.path,
    crawler_family: Object.keys(row.crawler_families || {})[0] || 'aggregate',
    observed_at: row.last_observed_at,
    ok: Number(row.successful_fetches || 0) > 0,
  }] : []);
}

async function fetchRuntimeSnapshot(origin, timeoutMs = 8000) {
  const raw = clean(origin);
  if (!raw) return null;
  let base;
  try {
    base = new URL(raw).origin;
  } catch {
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(base + '/api/chum/crawler-radar', {
      headers: {
        accept: 'application/json',
        'user-agent': 'Evercraft-CHUM-CrawlerRadar/1.0 (+aggregate-feedback)',
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = await response.json();
    return body?.schema === 'evercraft.chum.crawler-radar.runtime.v1' ? body : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function ageHours(value, nowMs) {
  const parsed = Date.parse(value || '');
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, (nowMs - parsed) / 3_600_000);
}

function scoreSurface({ entry, latest, misses, nowMs }) {
  let score = Math.max(0, Number(entry.priority || 0));
  const reasons = [];
  const changedMs = Date.parse(entry.last_changed || '');
  const fetchedMs = latest ? Date.parse(latest.observed_at) : Number.NaN;
  const changedAge = ageHours(entry.last_changed, nowMs);
  const productKey = productKeyFromPath(entry.path);
  const productMisses = productKey ? misses.filter((row) => row.product_key === productKey) : [];

  if (!latest) {
    score += 35;
    reasons.push('no_self_identified_crawler_fetch_observed');
  } else if (Number.isFinite(changedMs) && (!Number.isFinite(fetchedMs) || fetchedMs < changedMs)) {
    score += 40;
    reasons.push('content_changed_after_last_observed_crawler_fetch');
  } else {
    score -= 20;
    reasons.push('crawler_fetch_observed_after_latest_change');
  }

  if (changedAge !== null && changedAge <= 24) {
    score += 15;
    reasons.push('fresh_content_under_24h');
  } else if (changedAge !== null && changedAge <= 72) {
    score += 8;
    reasons.push('fresh_content_under_72h');
  }

  if (productMisses.length) {
    score += Math.min(30, productMisses.length * 10);
    reasons.push('negative_provider_pickup_receipt');
  }

  if (entry.content_sha256 !== entry.last_indexnow_sha256) {
    score += 12;
    reasons.push('indexnow_hash_pending');
  }

  const urgency = score >= 150 ? 'strike_now'
    : score >= 120 ? 'high'
      : score >= 90 ? 'medium'
        : 'observe';

  return {
    path: entry.path,
    product_key: productKey,
    score: Math.max(0, Math.round(score)),
    urgency,
    crawl_priority: Number(entry.priority || 0),
    last_changed: entry.last_changed || null,
    last_observed_crawler_fetch: latest?.observed_at || null,
    last_observed_crawler_family: latest?.crawler_family || null,
    indexnow_pending: entry.content_sha256 !== entry.last_indexnow_sha256,
    negative_provider_pickup_receipts: productMisses.map((row) => ({
      provider: row.provider,
      observed_at: row.observed_at,
      source: row.source,
      evidence_ref: row.file,
    })),
    reasons,
    recommended_actions: [
      ...(entry.content_sha256 !== entry.last_indexnow_sha256 ? ['verify_live_bytes_then_indexnow'] : []),
      ...(!latest || (Number.isFinite(changedMs) && fetchedMs < changedMs) ? ['promote_in_hot_discovery_queue'] : []),
      ...(productMisses.length ? ['run_brand_blind_provider_probe_after_publication'] : []),
      ...(score >= 120 ? ['increase_internal_crosslinks_from_relevant_public_surfaces'] : []),
    ],
  };
}

export async function buildCrawlerRadar({
  root = process.cwd(),
  now = new Date(),
  runtimeOrigin = process.env.CHUM_PUBLIC_ORIGIN || '',
  observationFile = process.env.CHUM_CRAWLER_OBSERVATION_PATH || path.join(root, 'artifacts', 'chum', 'crawler-observations.ndjson'),
  runtimeSnapshot = null,
  fetchRuntime = true,
} = {}) {
  const crawlState = readJson(path.join(root, 'public', 'chum', 'crawl-state.json'));
  if (crawlState?.schema !== 'evercraft.chum.crawl-state.v1') {
    throw new Error('public/chum/crawl-state.json is required before crawler radar can run.');
  }

  const localRows = readNdjson(observationFile);
  const liveSnapshot = runtimeSnapshot || (fetchRuntime ? await fetchRuntimeSnapshot(runtimeOrigin) : null);
  const observations = [...localRows, ...runtimeRows(liveSnapshot)];
  const latest = latestObservationByPath(observations);
  const misses = providerMisses(root);
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();

  const surfaces = Object.values(crawlState.entries || {})
    .map((entry) => scoreSurface({
      entry,
      latest: latest.get(safePath(entry.path)),
      misses,
      nowMs,
    }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  const payload = {
    schema: 'evercraft.chum.crawler-radar.v1',
    generated_at: iso(now),
    coordinator: 'CHUM',
    runtime_feedback: {
      requested: Boolean(clean(runtimeOrigin)) && fetchRuntime,
      received: Boolean(liveSnapshot),
      evidence_state: liveSnapshot ? liveSnapshot.evidence_state : 'none',
    },
    observation_count: observations.length,
    negative_provider_pickup_receipts: misses.length,
    surface_count: surfaces.length,
    strike_now_count: surfaces.filter((row) => row.urgency === 'strike_now').length,
    doctrine: {
      crawler_fetch_is_not_indexing: true,
      indexing_is_not_ranking: true,
      ranking_is_not_citation: true,
      citation_is_not_conversion: true,
      legitimate_public_signals_only: true,
      no_unsolicited_human_outreach: true,
    },
    surfaces: surfaces.slice(0, 500),
  };

  const publicDir = path.join(root, 'public', 'chum');
  const artifactDir = path.join(root, 'artifacts', 'chum');
  fs.mkdirSync(publicDir, { recursive: true });
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'crawler-radar.json'), JSON.stringify(payload, null, 2) + '\n');

  const lines = [
    'Evercraft CHUM Crawler Radar',
    'Generated: ' + payload.generated_at,
    'Observed crawler-like requests: ' + payload.observation_count,
    'Negative provider pickup receipts: ' + payload.negative_provider_pickup_receipts,
    'Strike-now surfaces: ' + payload.strike_now_count,
    '',
    ...payload.surfaces.slice(0, 100).map((row, index) =>
      `${index + 1}. [${row.urgency}] score=${row.score} ${row.path} :: ${row.reasons.join(', ')}`
    ),
    '',
    'Truth boundary: self-identified crawler requests are attention evidence only. They do not prove indexing, ranking, citation, recommendation, training use, or conversion.',
    ''
  ];
  fs.writeFileSync(path.join(publicDir, 'crawler-radar.txt'), lines.join('\n'));

  const strikeDir = path.join(publicDir, 'strike');
  fs.mkdirSync(strikeDir, { recursive: true });
  const strikeSurfaces = payload.surfaces
    .filter((row) => row.urgency === 'strike_now' || row.urgency === 'high')
    .slice(0, 100);
  const strikePayload = {
    schema: 'evercraft.chum.adaptive-strike-hub.v1',
    generated_at: payload.generated_at,
    coordinator: 'CHUM',
    purpose: 'Adaptive internal cross-link hub for public Evercraft surfaces that currently need more legitimate crawler attention.',
    truth_boundary: 'Placement here requests discovery attention only. It does not prove indexing, ranking, citation, recommendation, provider pickup, or conversion.',
    surfaces: strikeSurfaces.map((row) => ({
      path: row.path,
      score: row.score,
      urgency: row.urgency,
      reasons: row.reasons,
    })),
  };
  fs.writeFileSync(path.join(strikeDir, 'index.json'), JSON.stringify(strikePayload, null, 2) + '\n');
  fs.writeFileSync(path.join(strikeDir, 'index.html'), [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Evercraft CHUM Adaptive Strike Hub</title>',
    '<meta name="description" content="Adaptive public discovery hub for high-priority Evercraft capability surfaces.">',
    '<meta name="robots" content="index,follow,max-snippet:-1">',
    '<link rel="alternate" type="application/json" href="./index.json">',
    '</head><body><main>',
    '<h1>Evercraft CHUM Adaptive Strike Hub</h1>',
    '<p>These public surfaces currently need additional legitimate discovery attention based on freshness, observed crawler requests, and provider-pickup evidence. Inclusion is not a ranking or recommendation claim.</p>',
    '<ol>',
    ...strikeSurfaces.map((row) => `<li><a href="${row.path}">${row.path}</a> <small>score ${row.score} · ${row.urgency}</small></li>`),
    '</ol>',
    '</main></body></html>',
    ''
  ].join('\n'));

  fs.writeFileSync(path.join(artifactDir, 'crawler-radar-latest.json'), JSON.stringify(payload, null, 2) + '\n');

  return payload;
}

async function main() {
  const payload = await buildCrawlerRadar();
  console.log(JSON.stringify({
    ok: true,
    schema: payload.schema,
    surfaces: payload.surface_count,
    strike_now: payload.strike_now_count,
    runtime_feedback: payload.runtime_feedback.received,
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
