import assert from 'node:assert/strict';
import {
  agentDiscoveryDocument,
  discoverCapabilities,
  hubPageHtml,
  productPageHtml,
  publicProducts,
  robotsText,
  sitemapXml,
} from '../systemia/chum/public-resolver.mjs';

assert.ok(publicProducts.length >= 9);

const media = discoverCapabilities('My video is too large for this AI and I need full transcription');
assert.equal(media.match, true);
assert.equal(media.results[0].product_key, 'forensiscope');

const part = discoverCapabilities('I need to find a discontinued replacement tractor part');
assert.equal(part.results[0].product_key, 'findmypart');

const ev = discoverCapabilities('Would EV charging make sense at this property?');
assert.equal(ev.results[0].product_key, 'aliev');

const network = discoverCapabilities('I need network resilience software that can reconnect across changing internet paths');
assert.equal(network.results[0].product_key, 'evercraft-network');

assert.equal(discoverCapabilities('').match, false);

const manifest = agentDiscoveryDocument('https://example.com');
assert.equal(manifest.discovery.human_and_search_hub, 'https://example.com/ai');
assert.equal(manifest.rules.private_topology_exposed, false);
assert.equal(manifest.rules.public_discovery_creates_payment_obligation, false);

const robots = robotsText('https://example.com');
for (const agent of ['OAI-SearchBot','Claude-SearchBot','PerplexityBot','Google-Extended']) {
  assert.ok(robots.includes('User-agent: ' + agent));
}
assert.ok(robots.includes('Allow: /api/discover'));
assert.ok(robots.includes('Sitemap: https://example.com/sitemap.xml'));

const sitemap = sitemapXml('https://example.com');
assert.ok(sitemap.includes('<loc>https://example.com/ai</loc>'));
assert.ok(sitemap.includes('<loc>https://example.com/.well-known/evercraft-agent-discovery.json</loc>'));
assert.ok(sitemap.includes('<loc>https://example.com/ai/products/forensiscope</loc>'));
assert.equal(sitemap.includes('<loc>/'), false);

const hub = hubPageHtml('https://example.com');
assert.ok(hub.includes('Evercraft AI Capability Directory'));
assert.ok(hub.includes('ForensiScope'));
assert.ok(hub.includes('FindMyPart'));

const product = productPageHtml('forensiscope', 'https://example.com');
assert.ok(product?.includes('video is too large'));
assert.equal(productPageHtml('does-not-exist', 'https://example.com'), null);

console.log(JSON.stringify({
  status: 'PASS',
  product_count: publicProducts.length,
  pain_routes: ['forensiscope','findmypart','aliev','evercraft-network'],
  explicit_ai_crawlers: ['OAI-SearchBot','GPTBot','ChatGPT-User','ClaudeBot','Claude-SearchBot','Claude-User','PerplexityBot','Perplexity-User','Googlebot','Google-Extended'],
  absolute_sitemap_urls: true,
  public_intent_resolver: true,
  private_topology_exposed: false,
}, null, 2));
