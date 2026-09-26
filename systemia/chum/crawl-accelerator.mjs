import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const INDEXNOW_KEY = '8aef5f814d0b9c2896c1bc753c65c9bc';
const INDEXNOW_KEY_FILE = `${INDEXNOW_KEY}.txt`;

function sha256Bytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readJsonIfExists(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;'
  }[ch]));
}

function normalizeOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (!['https:', 'http:'].includes(parsed.protocol)) return null;
    parsed.pathname = '/';
    parsed.search = '';
    parsed.hash = '';
    return parsed.origin;
  } catch {
    return null;
  }
}

function resolveVerifiedOrigin(root, explicitOrigin) {
  const explicit = normalizeOrigin(explicitOrigin);
  if (explicit) return { origin: explicit, source: 'environment' };

  const receiptPath = path.join(root, 'public', '.well-known', 'evercraft-runtime-origin.json');
  const receipt = readJsonIfExists(receiptPath, null);
  const receiptOrigin = normalizeOrigin(receipt?.origin);
  if (
    receipt?.schema === 'evercraft.runtime-origin.v1' &&
    receipt?.runtime === 'forge-operator' &&
    receipt?.verified === true &&
    receiptOrigin
  ) {
    return {
      origin: receiptOrigin,
      source: 'verified_runtime_origin_receipt',
      receipt_hash: receipt.deployment_receipt_hash || null,
      verified_at: receipt.verified_at || null
    };
  }

  return { origin: null, source: 'not_configured' };
}

export function selectHotDiscoveryEntries(entries, limit = 200) {
  const rows = Object.values(entries || {});
  const sortHot = (a, b) => {
    const byPriority = Number(b.priority || 0) - Number(a.priority || 0);
    if (byPriority) return byPriority;
    const byTime = String(b.last_changed || '').localeCompare(String(a.last_changed || ''));
    return byTime || String(a.path || '').localeCompare(String(b.path || ''));
  };
  const coldStartFrontage = rows
    .filter((entry) => {
      const p = String(entry.path || '');
      return p.includes('/chum/commercial/') ||
        p.includes('/chum/sitemaps/') ||
        p.includes('/chum/sell-now') ||
        p.includes('/chum/revenue') ||
        p.includes('/.well-known/evercraft-machine-catalog') ||
        p.includes('/.well-known/evercraft-pain-index');
    })
    .sort(sortHot)
    .slice(0, Math.min(80, Math.max(1, Number(limit) || 200)));

  const selected = new Map(coldStartFrontage.map((entry) => [entry.path, entry]));
  for (const entry of rows.slice().sort(sortHot)) {
    if (selected.size >= limit) break;
    if (!selected.has(entry.path)) selected.set(entry.path, entry);
  }
  return [...selected.values()].slice(0, limit);
}

function writeHotDiscoveryHub({ publicRoot, state, origin }) {
  const dir = path.join(publicRoot, 'chum', 'hot');
  fs.mkdirSync(dir, { recursive: true });

  const hot = selectHotDiscoveryEntries(state.entries, 200);

  const json = {
    schema: 'evercraft.chum.hot-discovery.v1',
    provider: 'Evercraft LLC',
    coordinator: 'CHUM',
    updated_at: state.updated_at,
    purpose: 'High-priority public discovery surfaces for crawler fan-out. The queue reserves limited cold-start frontage for current commercial and sitemap surfaces, then fills remaining slots by observed priority. This is a crawl-order hint, not a ranking or recommendation claim.',
    surfaces: hot.map((entry) => ({
      path: entry.path,
      url: origin ? origin + entry.path : entry.path,
      priority: entry.priority,
      last_changed: entry.last_changed
    }))
  };
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(json, null, 2) + '\n');

  const rows = hot.map((entry) =>
    `<li data-priority="${Number(entry.priority || 0)}"><a href="${escapeXml(entry.path)}">${escapeXml(entry.path)}</a> <small>priority ${Number(entry.priority || 0)} · changed ${escapeXml(entry.last_changed)}</small></li>`
  );
  const html = [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Evercraft CHUM Hot Discovery Queue</title>',
    '<meta name="description" content="High-priority, recently changed public Evercraft discovery surfaces for crawler fan-out.">',
    '<meta name="robots" content="index,follow,max-snippet:-1">',
    '<link rel="alternate" type="application/json" href="./index.json">',
    '</head><body><main>',
    '<h1>Evercraft CHUM Hot Discovery Queue</h1>',
    '<p>Public discovery surfaces ordered for crawl fan-out. This page requests attention only and does not claim indexing, ranking, citation, recommendation, or conversion.</p>',
    '<ol>',
    ...rows,
    '</ol>',
    '</main></body></html>',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'index.html'), html);
}

function sitemapPaths(xml) {
  return [...String(xml || '').matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => match[1].trim())
    .filter(Boolean)
    .map((value) => {
      try {
        return new URL(value, 'https://evercraft.invalid').pathname;
      } catch {
        return value;
      }
    });
}

function publicFileForUrl(publicRoot, urlPath) {
  let pathname;
  try {
    pathname = new URL(urlPath, 'https://evercraft.invalid').pathname;
  } catch {
    pathname = String(urlPath || '');
  }
  if (!pathname.startsWith('/')) return null;
  const decoded = decodeURIComponent(pathname);
  if (decoded.includes('..')) return null;

  const relative = decoded.replace(/^\/+/, '');
  const candidates = [];
  if (!relative) candidates.push(path.join(publicRoot, 'index.html'));
  else if (decoded.endsWith('/')) candidates.push(path.join(publicRoot, relative, 'index.html'));
  else {
    candidates.push(path.join(publicRoot, relative));
    candidates.push(path.join(publicRoot, relative + '.html'));
  }

  for (const candidate of candidates) {
    if (!candidate.startsWith(path.resolve(publicRoot))) continue;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

export function crawlPriority(urlPath) {
  const value = String(urlPath || '');
  if (value.includes('/chum/commercial/')) return 112;
  if (value.includes('/chum/sitemaps/')) return 108;
  if (value.includes('/chum/answers/doors/')) return 100;
  if (value.includes('/chum/intents/')) return 98;
  if (value.includes('/chum/capabilities/')) return 96;
  if (value.includes('/chum/products/')) return 94;
  if (value.includes('/chum/sell-now')) return 92;
  if (value.includes('/chum/revenue')) return 90;
  if (value.includes('/.well-known/evercraft-pain-index')) return 90;
  if (value.includes('/.well-known/evercraft-products')) return 88;
  if (value.includes('/llms')) return 86;
  if (value.includes('/.well-known/')) return 84;
  if (value.includes('/chum/')) return 80;
  return 60;
}

function stableEntry(entry) {
  return {
    path: entry.path,
    content_sha256: entry.content_sha256,
    last_changed: entry.last_changed,
    priority: entry.priority,
    ...(entry.last_indexnow_sha256 ? { last_indexnow_sha256: entry.last_indexnow_sha256 } : {}),
    ...(entry.last_indexnow_at ? { last_indexnow_at: entry.last_indexnow_at } : {})
  };
}

function writeFreshnessFeed({ publicRoot, state, changedEntries, origin }) {
  const freshnessJsonPath = path.join(publicRoot, 'chum', 'freshness.json');
  const freshnessXmlPath = path.join(publicRoot, 'chum', 'freshness.xml');
  fs.mkdirSync(path.dirname(freshnessJsonPath), { recursive: true });

  const recent = Object.values(state.entries)
    .sort((a, b) => {
      const byTime = String(b.last_changed).localeCompare(String(a.last_changed));
      if (byTime) return byTime;
      const byPriority = Number(b.priority || 0) - Number(a.priority || 0);
      return byPriority || String(a.path).localeCompare(String(b.path));
    })
    .slice(0, 250);

  const json = {
    schema: 'evercraft.chum.crawl-pressure.v1',
    provider: 'Evercraft LLC',
    coordinator: 'CHUM',
    updated_at: state.updated_at,
    purpose: 'Content-hash-backed freshness signals for public Evercraft discovery surfaces. A freshness signal requests attention; it does not prove indexing, ranking, recommendation, citation or provider pickup.',
    indexnow: {
      supported: true,
      key_path: '/' + INDEXNOW_KEY_FILE,
      submission_policy: 'Only content whose live bytes match the current release is eligible for IndexNow broadcast.'
    },
    latest_change_batch: changedEntries.map((entry) => ({
      path: entry.path,
      last_changed: entry.last_changed,
      priority: entry.priority
    })),
    recent_surfaces: recent.map((entry) => ({
      path: entry.path,
      url: origin ? origin + entry.path : entry.path,
      last_changed: entry.last_changed,
      priority: entry.priority
    }))
  };
  fs.writeFileSync(freshnessJsonPath, JSON.stringify(json, null, 2) + '\n');

  const updated = state.updated_at || new Date(0).toISOString();
  const entries = recent.slice(0, 100).map((entry) => {
    const href = origin ? origin + entry.path : entry.path;
    return [
      '<entry>',
      `<id>urn:evercraft:chum:${sha256Bytes(entry.path).slice(0, 24)}</id>`,
      `<title>${escapeXml(entry.path)}</title>`,
      `<updated>${escapeXml(entry.last_changed)}</updated>`,
      `<link href="${escapeXml(href)}"/>`,
      `<category term="priority-${Number(entry.priority || 0)}"/>`,
      '</entry>'
    ].join('');
  });

  const selfHref = origin ? origin + '/chum/freshness.xml' : '/chum/freshness.xml';
  const feed = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    '<id>urn:evercraft:chum:crawl-pressure</id>',
    '<title>Evercraft CHUM Freshness Feed</title>',
    `<updated>${escapeXml(updated)}</updated>`,
    `<link rel="self" href="${escapeXml(selfHref)}"/>`,
    '<subtitle>Content-hash-backed public discovery changes. Freshness is not proof of provider pickup.</subtitle>',
    ...entries,
    '</feed>',
    ''
  ].join('\n');
  fs.writeFileSync(freshnessXmlPath, feed);
}

function rewriteSitemap({ sitemapPath, paths, entries }) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...paths.map((urlPath) => {
      const entry = entries[urlPath];
      return entry?.last_changed
        ? `  <url><loc>${escapeXml(urlPath)}</loc><lastmod>${escapeXml(entry.last_changed)}</lastmod></url>`
        : `  <url><loc>${escapeXml(urlPath)}</loc></url>`;
    }),
    '</urlset>',
    ''
  ];
  fs.writeFileSync(sitemapPath, lines.join('\n'));
}

async function remoteMatches({ origin, entry, publicRoot, timeoutMs = 10000 }) {
  const file = publicFileForUrl(publicRoot, entry.path);
  if (!file) return { ok: false, reason: 'no_local_file' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(origin + entry.path, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        accept: 'text/html,application/json,text/plain,application/xml;q=0.9,*/*;q=0.4',
        'user-agent': 'Evercraft-CHUM-CrawlPressure/1.0 (+release-byte-verification)'
      },
      signal: controller.signal
    });
    if (!response.ok) return { ok: false, reason: 'http_' + response.status, status: response.status };

    // These two routes are intentionally rendered at request time, so a healthy 2xx
    // is the release gate instead of byte identity.
    if (entry.path === '/sitemap.xml' || entry.path === '/robots.txt') {
      return { ok: true, reason: 'dynamic_route_healthy', status: response.status };
    }

    const body = Buffer.from(await response.arrayBuffer());
    const remoteHash = sha256Bytes(body);
    return {
      ok: remoteHash === entry.content_sha256,
      reason: remoteHash === entry.content_sha256 ? 'live_bytes_match' : 'live_bytes_stale',
      status: response.status,
      remote_sha256: remoteHash
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error), status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

async function broadcastIndexNow({ origin, state, publicRoot, maxUrls = 1000 }) {
  if (!origin) {
    const pending = Object.values(state.entries)
      .filter((entry) => entry.content_sha256 !== entry.last_indexnow_sha256).length;
    return { status: 'skipped_no_verified_origin', submitted: 0, pending, stale: [] };
  }

  const keyLocation = origin + '/' + INDEXNOW_KEY_FILE;
  let keyOk = false;
  let keyStatus = 0;
  try {
    const keyResponse = await fetch(keyLocation, {
      headers: { 'user-agent': 'Evercraft-CHUM-CrawlPressure/1.0 (+indexnow-key-check)' }
    });
    keyStatus = keyResponse.status;
    keyOk = keyResponse.ok && (await keyResponse.text()).trim() === INDEXNOW_KEY;
  } catch {}

  if (!keyOk) {
    const pending = Object.values(state.entries)
      .filter((entry) => entry.content_sha256 !== entry.last_indexnow_sha256).length;
    return { status: 'held_key_not_live', key_status: keyStatus, submitted: 0, pending, stale: [] };
  }

  const pending = Object.values(state.entries)
    .filter((entry) => entry.content_sha256 !== entry.last_indexnow_sha256)
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || String(a.path).localeCompare(String(b.path)))
    .slice(0, Math.max(1, Math.min(10000, Number(maxUrls) || 1000)));

  const verified = [];
  const stale = [];
  const concurrency = 12;
  for (let i = 0; i < pending.length; i += concurrency) {
    const batch = pending.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(async (entry) => ({
      entry,
      check: await remoteMatches({ origin, entry, publicRoot })
    })));
    for (const result of results) {
      if (result.check.ok) verified.push(result.entry);
      else stale.push({ path: result.entry.path, ...result.check });
    }
  }

  if (!verified.length) {
    return {
      status: pending.length ? 'held_release_not_live' : 'nothing_pending',
      submitted: 0,
      pending: pending.length,
      stale
    };
  }

  const urlList = verified.map((entry) => origin + entry.path);
  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: new URL(origin).host,
      key: INDEXNOW_KEY,
      keyLocation,
      urlList
    })
  });
  const responseText = await response.text();
  if (!response.ok) {
    return {
      status: 'indexnow_failed',
      http_status: response.status,
      error: responseText.slice(0, 1000),
      submitted: 0,
      pending: pending.length,
      stale
    };
  }

  const at = new Date().toISOString();
  for (const entry of verified) {
    state.entries[entry.path].last_indexnow_sha256 = entry.content_sha256;
    state.entries[entry.path].last_indexnow_at = at;
  }

  return {
    status: 'accepted',
    http_status: response.status,
    submitted: verified.length,
    pending: Math.max(0, pending.length - verified.length),
    urls: urlList,
    stale
  };
}

export async function buildCrawlPressure({
  root = process.cwd(),
  now = new Date().toISOString(),
  origin = process.env.CHUM_PUBLIC_ORIGIN || '',
  broadcast = false,
  maxBroadcastUrls = Number(process.env.CHUM_CRAWL_MAX_URLS || 1000)
} = {}) {
  const publicRoot = path.join(root, 'public');
  const sitemapPath = path.join(publicRoot, 'sitemap.xml');
  const statePath = path.join(publicRoot, 'chum', 'crawl-state.json');
  const artifactDir = path.join(root, 'artifacts', 'chum');

  if (!fs.existsSync(sitemapPath)) throw new Error('public/sitemap.xml is required before crawl pressure can run.');

  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(publicRoot, INDEXNOW_KEY_FILE), INDEXNOW_KEY + '\n');

  const previous = readJsonIfExists(statePath, {
    schema: 'evercraft.chum.crawl-state.v1',
    updated_at: null,
    entries: {}
  });
  const radar = readJsonIfExists(path.join(publicRoot, 'chum', 'crawler-radar.json'), null);
  const radarBoost = new Map(
    radar?.schema === 'evercraft.chum.crawler-radar.v1'
      ? (radar.surfaces || []).map((row) => [
          String(row.path || ''),
          row.urgency === 'strike_now' ? 60 : row.urgency === 'high' ? 35 : row.urgency === 'medium' ? 15 : 0
        ])
      : []
  );
  const rawSitemap = fs.readFileSync(sitemapPath, 'utf8');
  const paths = [...new Set(sitemapPaths(rawSitemap))];
  const entries = {};
  const changedEntries = [];

  for (const urlPath of paths) {
    if (urlPath === '/chum/crawl-state.json' || urlPath === '/chum/freshness.json' || urlPath === '/chum/freshness.xml') continue;
    const file = publicFileForUrl(publicRoot, urlPath);
    if (!file) continue;
    const hash = sha256Bytes(fs.readFileSync(file));
    const old = previous.entries?.[urlPath] || null;
    const changed = !old || old.content_sha256 !== hash;
    const entry = {
      path: urlPath,
      content_sha256: hash,
      last_changed: changed ? now : old.last_changed,
      priority: Math.min(200, crawlPriority(urlPath) + Number(radarBoost.get(urlPath) || 0)),
      ...(old?.last_indexnow_sha256 ? { last_indexnow_sha256: old.last_indexnow_sha256 } : {}),
      ...(old?.last_indexnow_at ? { last_indexnow_at: old.last_indexnow_at } : {})
    };
    entries[urlPath] = stableEntry(entry);
    if (changed) changedEntries.push(entry);
  }

  const originResolution = resolveVerifiedOrigin(root, origin);
  const normalizedOrigin = originResolution.origin;
  const state = {
    schema: 'evercraft.chum.crawl-state.v1',
    provider: 'Evercraft LLC',
    coordinator: 'CHUM',
    updated_at: changedEntries.length ? now : (previous.updated_at || now),
    url_count: Object.keys(entries).length,
    doctrine: {
      crawl_can_be_requested_not_forced: true,
      content_hash_controls_freshness: true,
      unchanged_pages_do_not_get_fake_lastmod_updates: true,
      indexnow_requires_live_release_byte_match: true,
      provider_pickup_not_inferred: true,
      crawler_radar_feedback_can_raise_priority: true
    },
    entries
  };

  rewriteSitemap({ sitemapPath, paths, entries });

  writeFreshnessFeed({
    publicRoot,
    state,
    changedEntries: changedEntries
      .slice()
      .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || a.path.localeCompare(b.path)),
    origin: normalizedOrigin
  });
  writeHotDiscoveryHub({
    publicRoot,
    state,
    origin: normalizedOrigin
  });

  const broadcastResult = broadcast
    ? await broadcastIndexNow({
        origin: normalizedOrigin,
        state,
        publicRoot,
        maxUrls: maxBroadcastUrls
      })
    : {
        status: 'not_requested',
        submitted: 0,
        pending: Object.values(state.entries)
          .filter((entry) => entry.content_sha256 !== entry.last_indexnow_sha256).length,
        stale: []
      };

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');

  const receipt = {
    schema: 'evercraft.chum.crawl-pressure.receipt.v1',
    generated_at: now,
    origin: normalizedOrigin,
    origin_source: originResolution.source,
    origin_receipt_hash: originResolution.receipt_hash || null,
    indexed_surfaces: state.url_count,
    changed_surfaces: changedEntries.length,
    broadcast: broadcastResult,
    outputs: {
      state: 'public/chum/crawl-state.json',
      freshness_json: 'public/chum/freshness.json',
      freshness_atom: 'public/chum/freshness.xml',
      hot_discovery_html: 'public/chum/hot/index.html',
      hot_discovery_json: 'public/chum/hot/index.json',
      sitemap: 'public/sitemap.xml',
      indexnow_key: 'public/' + INDEXNOW_KEY_FILE
    },
    truth_boundary: 'This engine can accelerate legitimate discovery signals and request recrawls. It cannot compel a third-party crawler to fetch, index, rank, cite, recommend or convert a page.'
  };

  fs.writeFileSync(path.join(artifactDir, 'crawl-pressure-latest.json'), JSON.stringify(receipt, null, 2) + '\n');
  fs.writeFileSync(path.join(artifactDir, 'crawl-pressure-latest.md'), [
    '# CHUM Crawl Pressure Receipt',
    '',
    'Generated: ' + receipt.generated_at,
    'Verified origin: ' + (receipt.origin || 'not configured'),
    'Origin source: ' + receipt.origin_source,
    'Tracked public surfaces: ' + receipt.indexed_surfaces,
    'Content changes detected: ' + receipt.changed_surfaces,
    'IndexNow state: ' + receipt.broadcast.status,
    'IndexNow submitted: ' + Number(receipt.broadcast.submitted || 0),
    'Still pending: ' + Number(receipt.broadcast.pending || 0),
    'Live-release mismatches held: ' + Number(receipt.broadcast.stale?.length || 0),
    '',
    '> Crawl pressure requests attention; it never claims provider pickup, indexing, ranking, recommendation, citation or conversion.',
    ''
  ].join('\n'));

  return receipt;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  const result = await buildCrawlPressure({
    broadcast: process.argv.includes('--broadcast'),
    origin: process.env.CHUM_PUBLIC_ORIGIN || ''
  });
  console.log(JSON.stringify({
    changed: result.changed_surfaces,
    tracked: result.indexed_surfaces,
    broadcast: result.broadcast.status,
    submitted: result.broadcast.submitted,
    pending: result.broadcast.pending
  }));
  if (result.broadcast.status === 'indexnow_failed') process.exitCode = 1;
}
