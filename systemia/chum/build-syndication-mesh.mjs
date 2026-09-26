import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const RAW_BASE = 'https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public';

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function xml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function html(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function isoFromDate(value, fallback) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw + 'T00:00:00.000Z';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function descriptionFor(product, discovery) {
  const intents = array(discovery?.intents || product?.triggers).map(String).filter(Boolean);
  const className = String(discovery?.class || '').replaceAll('_', ' ').trim();
  const lead = className
    ? String(product.name || product.product_key) + ' is an Evercraft ' + className + ' capability.'
    : String(product.name || product.product_key) + ' is an Evercraft public capability.';
  return intents.length ? lead + ' Common needs: ' + intents.slice(0, 4).join('; ') + '.' : lead;
}

function productRecord(root, product, updatedAt) {
  const key = String(product.product_key || '').trim();
  const discoveryFile = path.join(root, 'public', 'chum', 'products', key, 'ai-discovery.json');
  const discovery = readJson(discoveryFile, null);
  const canonicalUrl = String(discovery?.canonical_url || product.canonical_url || '').trim();
  const intents = array(discovery?.intents || product.triggers).map(String).filter(Boolean);
  const mirrorPath = '/chum/products/' + encodeURIComponent(key) + '/';
  const llmsPath = mirrorPath + 'llms.txt';
  const discoveryPath = mirrorPath + 'ai-discovery.json';
  const payload = discovery || product;
  const contentHash = sha256(JSON.stringify(payload));
  return {
    product_key: key,
    name: String(discovery?.name || product.name || key),
    canonical_url: canonicalUrl,
    mirror_path: mirrorPath,
    llms_path: llmsPath,
    discovery_path: discoveryPath,
    registry_name: String(discovery?.registry_name || product.registry_name || ''),
    mcp: String(discovery?.mcp || product.mcp || ''),
    class: String(discovery?.class || ''),
    intents,
    authority: String(discovery?.authority || ''),
    human_confirmation_required: Boolean(discovery?.human_confirmation_required),
    commercial_status: String(discovery?.commercial?.status || product.commercial_state || ''),
    description: descriptionFor(product, discovery),
    content_sha256: contentHash,
    updated_at: updatedAt
  };
}

function updateSitemap(file, paths) {
  if (!fs.existsSync(file)) return;
  let source = fs.readFileSync(file, 'utf8');
  const missing = paths.filter((urlPath) => !source.includes('<loc>' + urlPath + '</loc>'));
  if (!missing.length) return;
  const rows = missing.map((urlPath) => '  <url><loc>' + xml(urlPath) + '</loc></url>').join('\n');
  source = source.replace(/<\/urlset>\s*$/i, rows + '\n</urlset>\n');
  fs.writeFileSync(file, source);
}

function appendSyndicationToLlms(file) {
  if (!fs.existsSync(file)) return;
  const start = '<!-- EVERCRAFT_SYNDICATION_START -->';
  const end = '<!-- EVERCRAFT_SYNDICATION_END -->';
  let source = fs.readFileSync(file, 'utf8');
  const block = [
    start,
    '## Evercraft syndication and discovery feeds',
    '',
    '- RSS product feed: /feed.xml',
    '- JSON Feed: /feed.json',
    '- OpenSearch description: /opensearch.xml',
    '- Syndication manifest: /.well-known/evercraft-syndication.json',
    '- Crawlable syndication hub: /chum/syndication/',
    '',
    'These surfaces expose the same truthful product catalog in additional standard formats. Publication is not proof of third-party indexing, recommendation, citation, or social-network posting.',
    end
  ].join('\n');

  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end);
  if (startIndex >= 0 && endIndex >= startIndex) {
    source = source.slice(0, startIndex) + source.slice(endIndex + end.length);
  }
  source = source.trimEnd();
  fs.writeFileSync(file, source + '\n\n' + block + '\n');
}

function augmentDiscovery(file) {
  const discovery = readJson(file, null);
  if (!discovery || typeof discovery !== 'object') return;
  discovery.start_here = {
    ...(discovery.start_here || {}),
    syndication: '/.well-known/evercraft-syndication.json',
    rss: '/feed.xml',
    json_feed: '/feed.json',
    commercial_intent_rss: '/chum/commercial/feed.xml',
    commercial_intent_json: '/chum/commercial/feed.json',
    segmented_sitemap_index: '/chum/sitemaps/index.xml',
    opensearch: '/opensearch.xml',
    syndication_hub: '/chum/syndication/'
  };
  discovery.syndication = {
    schema: 'evercraft.syndication.v1',
    policy: 'One truthful canonical product record is fanned out into standard discovery formats. Material changes may be queued for authorized social publishing, with dedupe by content hash.',
    rss: '/feed.xml',
    json_feed: '/feed.json',
    commercial_intent_rss: '/chum/commercial/feed.xml',
    commercial_intent_json: '/chum/commercial/feed.json',
    segmented_sitemap_index: '/chum/sitemaps/index.xml',
    hub: '/chum/syndication/',
    manifest: '/.well-known/evercraft-syndication.json'
  };
  writeJson(file, discovery);
}

export function buildSyndicationMesh({
  root = process.cwd(),
  now = new Date().toISOString()
} = {}) {
  const catalogFile = path.join(root, 'registry', 'catalog.json');
  const catalog = readJson(catalogFile, null);
  if (!catalog || !Array.isArray(catalog.products)) {
    throw new Error('registry/catalog.json with a products array is required.');
  }

  const publicRoot = path.join(root, 'public');
  const syndicationRoot = path.join(publicRoot, 'chum', 'syndication');
  const updatedAt = isoFromDate(catalog.updated_at, now);
  const productSources = new Map(
    catalog.products
      .filter((product) => String(product?.product_key || '').trim())
      .map((product) => [String(product.product_key).trim(), product])
  );
  const mirrorRoot = path.join(publicRoot, 'chum', 'products');
  if (fs.existsSync(mirrorRoot)) {
    for (const entry of fs.readdirSync(mirrorRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const key = entry.name;
      if (productSources.has(key)) continue;
      const discovery = readJson(path.join(mirrorRoot, key, 'ai-discovery.json'), null);
      if (!discovery || typeof discovery !== 'object') continue;
      productSources.set(key, {
        product_key: key,
        name: discovery.name || key,
        canonical_url: discovery.canonical_url || '',
        registry_name: discovery.registry_name || '',
        mcp: discovery.mcp || '',
        triggers: array(discovery.intents)
      });
    }
  }

  const products = [...productSources.values()]
    .map((product) => productRecord(root, product, updatedAt))
    .filter((product) => product.product_key)
    .sort((a, b) => a.name.localeCompare(b.name));

  const previousStateFile = path.join(syndicationRoot, 'state.json');
  const previous = readJson(previousStateFile, null);
  const previousHashes = previous?.product_hashes || {};
  const bootstrap = !previous || previous.schema !== 'evercraft.syndication-state.v1';
  const baselineExpansion = bootstrap || previous?.complete_mirror !== true;
  const changedProducts = baselineExpansion
    ? []
    : products.filter((product) => previousHashes[product.product_key] !== product.content_sha256);

  fs.mkdirSync(syndicationRoot, { recursive: true });

  const rss = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '<channel>',
    '<title>Evercraft Product Discovery Feed</title>',
    '<link>https://github.com/jgaethle10/forge-operator</link>',
    '<description>Public Evercraft products and machine-readable discovery doors.</description>',
    '<lastBuildDate>' + xml(new Date(updatedAt).toUTCString()) + '</lastBuildDate>',
    ...products.map((product) => [
      '<item>',
      '<title>' + xml(product.name) + '</title>',
      '<link>' + xml(product.canonical_url || ('https://github.com/jgaethle10/forge-operator/tree/main/public' + product.mirror_path)) + '</link>',
      '<guid isPermaLink="false">urn:evercraft:product:' + xml(product.product_key) + ':' + product.content_sha256.slice(0, 16) + '</guid>',
      '<description>' + xml(product.description) + '</description>',
      '<pubDate>' + xml(new Date(product.updated_at).toUTCString()) + '</pubDate>',
      '</item>'
    ].join('')),
    '</channel>',
    '</rss>',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(publicRoot, 'feed.xml'), rss);

  const jsonFeed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'Evercraft Product Discovery Feed',
    home_page_url: 'https://github.com/jgaethle10/forge-operator',
    feed_url: RAW_BASE + '/feed.json',
    description: 'Public Evercraft products and machine-readable discovery doors.',
    items: products.map((product) => ({
      id: 'urn:evercraft:product:' + product.product_key + ':' + product.content_sha256.slice(0, 16),
      url: product.canonical_url || ('https://github.com/jgaethle10/forge-operator/tree/main/public' + product.mirror_path),
      external_url: RAW_BASE + product.discovery_path,
      title: product.name,
      summary: product.description,
      date_modified: product.updated_at,
      tags: [...new Set([product.class, ...product.intents.slice(0, 8)].filter(Boolean))]
    }))
  };
  writeJson(path.join(publicRoot, 'feed.json'), jsonFeed);

  const openSearch = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">',
    '<ShortName>Evercraft</ShortName>',
    '<Description>Discover Evercraft products by natural-language problem.</Description>',
    '<InputEncoding>UTF-8</InputEncoding>',
    '<Url type="application/json" template="/api/discover?q={searchTerms}"/>',
    '</OpenSearchDescription>',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(publicRoot, 'opensearch.xml'), openSearch);

  const manifest = {
    schema: 'evercraft.syndication.v1',
    provider: 'Evercraft LLC',
    coordinator: 'CHUM',
    updated_at: updatedAt,
    purpose: 'Fan one truthful public product graph into standard crawler, search, LLM, agent, feed and authorized publishing surfaces without duplicate doorway spam.',
    canonical_sources: {
      registry: '/.well-known/evercraft-products.json',
      machine_catalog: '/.well-known/evercraft-machine-catalog.json',
      pain_index: '/.well-known/evercraft-pain-index.json',
      schema_graph: '/schema.jsonld'
    },
    feeds: {
      rss: '/feed.xml',
      json_feed: '/feed.json',
      commercial_intent_rss: '/chum/commercial/feed.xml',
      commercial_intent_json: '/chum/commercial/feed.json',
      freshness_atom: '/chum/freshness.xml',
      sitemap: '/sitemap.xml',
      segmented_sitemap_index: '/chum/sitemaps/index.xml',
      opensearch: '/opensearch.xml'
    },
    raw_github_mirrors: {
      rss: RAW_BASE + '/feed.xml',
      json_feed: RAW_BASE + '/feed.json',
      manifest: RAW_BASE + '/.well-known/evercraft-syndication.json'
    },
    machine_protocols: {
      mcp_directory: '/.well-known/evercraft-agent-interfaces.json',
      a2a_agent_card: '/.well-known/agent-card.json',
      a2a_alias: '/.well-known/agent.json',
      a2a_state: 'release_candidate_pending_live_canary'
    },
    social_publication: {
      state: 'destination_gated',
      rule: 'Only authorized brand destinations may auto-publish. Dedupe by product content hash and publish material changes, not repeated copies.',
      current_change_queue: '/chum/syndication/social-queue.json'
    },
    product_count: products.length,
    products: products.map((product) => ({
      product_key: product.product_key,
      name: product.name,
      canonical_url: product.canonical_url,
      mirror: product.mirror_path,
      llms: product.llms_path,
      discovery: product.discovery_path,
      registry_name: product.registry_name || null,
      mcp: product.mcp || null,
      content_sha256: product.content_sha256
    })),
    truth_boundary: 'These surfaces increase legitimate opportunities for discovery. They cannot force a crawler, search engine, LLM, agent or social network to fetch, index, rank, cite, recommend or publish Evercraft.'
  };
  writeJson(path.join(publicRoot, '.well-known', 'evercraft-syndication.json'), manifest);

  const previousQueue = readJson(path.join(syndicationRoot, 'social-queue.json'), null);
  const newQueueItems = changedProducts.map((product) => ({
    dedupe_key: product.product_key + ':' + product.content_sha256,
    product_key: product.product_key,
    name: product.name,
    canonical_url: product.canonical_url,
    discovery_path: product.discovery_path,
    text: product.name + ': ' + product.description,
    content_sha256: product.content_sha256,
    requires_authorized_destination: true
  }));
  const queueByKey = new Map();
  for (const item of array(previousQueue?.items)) {
    if (item?.dedupe_key) queueByKey.set(item.dedupe_key, item);
  }
  for (const item of newQueueItems) queueByKey.set(item.dedupe_key, item);
  const socialQueue = {
    schema: 'evercraft.syndication-social-queue.v1',
    generated_at: baselineExpansion || newQueueItems.length
      ? now
      : (previousQueue?.generated_at || previous?.updated_at || now),
    bootstrap: baselineExpansion,
    policy: baselineExpansion
      ? 'Baseline inventory recorded without blasting every existing product. Future material product changes enter this queue once per content hash.'
      : 'Material product changes enter once per content hash. Publishing still requires an authorized destination adapter.',
    items: [...queueByKey.values()].sort((a, b) => String(a.product_key).localeCompare(String(b.product_key)))
  };
  writeJson(path.join(syndicationRoot, 'social-queue.json'), socialQueue);

  const indexJson = {
    schema: 'evercraft.syndication-index.v1',
    provider: 'Evercraft LLC',
    updated_at: updatedAt,
    feeds: manifest.feeds,
    products
  };
  writeJson(path.join(syndicationRoot, 'index.json'), indexJson);

  const productRows = products.map((product) => [
    '<li>',
    '<strong>' + html(product.name) + '</strong>',
    product.canonical_url ? ' · <a href="' + html(product.canonical_url) + '">canonical product</a>' : '',
    ' · <a href="' + html(product.mirror_path) + '">discovery mirror</a>',
    ' · <a href="' + html(product.llms_path) + '">LLM text</a>',
    '</li>'
  ].join(''));

  const hub = [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Evercraft Syndication Mesh</title>',
    '<meta name="description" content="Standard feeds and machine-readable public discovery surfaces for Evercraft products.">',
    '<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">',
    '<link rel="alternate" type="application/rss+xml" href="/feed.xml" title="Evercraft Product Discovery RSS">',
    '<link rel="alternate" type="application/feed+json" href="/feed.json" title="Evercraft Product Discovery JSON Feed">',
    '<link rel="alternate" type="application/rss+xml" href="/chum/commercial/feed.xml" title="Evercraft Commercial Intent RSS">',
    '<link rel="alternate" type="application/feed+json" href="/chum/commercial/feed.json" title="Evercraft Commercial Intent JSON Feed">',
    '<link rel="search" type="application/opensearchdescription+xml" href="/opensearch.xml" title="Evercraft Search">',
    '<link rel="alternate" type="application/json" href="./index.json">',
    '</head><body><main>',
    '<h1>Evercraft Syndication Mesh</h1>',
    '<p>One truthful product catalog, fanned out into standard formats so crawlers, search engines, LLMs and agents have more legitimate doors into the same canonical information.</p>',
    '<p><a href="/feed.xml">Product RSS</a> · <a href="/feed.json">Product JSON Feed</a> · <a href="/chum/commercial/feed.xml">Commercial intent RSS</a> · <a href="/chum/commercial/feed.json">Commercial intent JSON Feed</a> · <a href="/sitemap.xml">Sitemap</a> · <a href="/chum/sitemaps/index.xml">Segmented sitemap index</a> · <a href="/.well-known/evercraft-syndication.json">Machine manifest</a></p>',
    '<h2>Products</h2>',
    '<ul>',
    ...productRows,
    '</ul>',
    '<p>Publication is not proof of indexing, ranking, citation, recommendation or third-party social posting.</p>',
    '</main></body></html>',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(syndicationRoot, 'index.html'), hub);

  const state = {
    schema: 'evercraft.syndication-state.v1',
    updated_at: baselineExpansion || changedProducts.length ? now : (previous?.updated_at || now),
    complete_mirror: true,
    product_hashes: Object.fromEntries(products.map((product) => [product.product_key, product.content_sha256]))
  };
  writeJson(previousStateFile, state);

  updateSitemap(path.join(publicRoot, 'sitemap.xml'), [
    '/feed.xml',
    '/feed.json',
    '/opensearch.xml',
    '/chum/commercial/',
    '/chum/commercial/feed.xml',
    '/chum/commercial/feed.json',
    '/chum/sitemaps/index.xml',
    '/chum/sitemaps/sell-now.xml',
    '/chum/sitemaps/answers.xml',
    '/chum/sitemaps/products.xml',
    '/chum/sitemaps/machine.xml',
    '/.well-known/evercraft-syndication.json',
    '/chum/syndication/',
    '/chum/syndication/index.json'
  ]);

  augmentDiscovery(path.join(publicRoot, '.well-known', 'evercraft-discovery.json'));
  augmentDiscovery(path.join(publicRoot, 'ai-discovery.json'));
  appendSyndicationToLlms(path.join(publicRoot, 'llms.txt'));
  appendSyndicationToLlms(path.join(root, 'llms.txt'));

  return {
    schema: 'evercraft.syndication-build-receipt.v1',
    generated_at: now,
    product_count: products.length,
    bootstrap: baselineExpansion,
    queued_social_changes: changedProducts.length,
    outputs: [
      'public/feed.xml',
      'public/feed.json',
      'public/opensearch.xml',
      'public/.well-known/evercraft-syndication.json',
      'public/chum/syndication/index.html',
      'public/chum/syndication/index.json',
      'public/chum/syndication/social-queue.json',
      'public/chum/syndication/state.json'
    ]
  };
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (direct) {
  console.log(JSON.stringify(buildSyndicationMesh(), null, 2));
}
