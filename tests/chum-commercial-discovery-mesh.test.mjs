import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCommercialDiscoveryMesh } from '../systemia/chum/build-commercial-discovery-mesh.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chum-commercial-mesh-'));
function write(rel, value) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
}

write('public/.well-known/evercraft-machine-catalog.json', {
  offers: [
    {
      public_id: 'demo-sell-now-v1',
      name: 'Demo Sell Now',
      problem: 'A user needs a demo commercial service.',
      commercial_state: 'sell_now',
      machine_state: 'payment_ready_human_confirmation',
      pricing: '$49',
      public_url: 'https://example.com/demo',
      intent_terms: ['solve my demo problem', 'buy a demo service'],
      offers: [{ name: 'Demo', price: '$49' }]
    },
    {
      public_id: 'demo-discovery-v1',
      name: 'Discovery Only',
      commercial_state: 'discovery_only',
      machine_state: 'discovery_only',
      pricing: 'none',
      intent_terms: ['explore demo']
    }
  ]
});
write('public/.well-known/evercraft-products.json', {
  products: [{ product_key: 'demo', name: 'Demo Product' }]
});
write('public/chum/answers/index.json', {
  doors: [
    {
      answer_id: 'intent:one',
      user_language: 'solve my demo problem',
      relative_page: '/chum/answers/doors/solve-demo/',
      relative_json: '/chum/answers/doors/solve-demo.json',
      candidates: [{ public_id: 'demo-sell-now-v1', name: 'Demo Sell Now' }]
    },
    {
      answer_id: 'intent:two',
      user_language: 'buy a demo service',
      relative_page: '/chum/answers/doors/buy-demo/',
      relative_json: '/chum/answers/doors/buy-demo.json',
      candidates: [{ public_id: 'demo-sell-now-v1', name: 'Demo Sell Now' }]
    }
  ]
});

const result = buildCommercialDiscoveryMesh({ root });
assert.equal(result.sell_now_clusters, 1);
assert.equal(result.commercial_answer_edges, 2);
assert.equal(result.segmented_sitemaps, 4);

const cluster = JSON.parse(fs.readFileSync(path.join(root, 'public/chum/commercial/demo-sell-now-v1/index.json')));
assert.equal(cluster.public_id, 'demo-sell-now-v1');
assert.equal(cluster.answer_door_count, 2);
assert.equal(cluster.commercial_state, 'sell_now');

const html = fs.readFileSync(path.join(root, 'public/chum/commercial/demo-sell-now-v1/index.html'), 'utf8');
assert.match(html, /solve my demo problem/);
assert.match(html, /\/chum\/answers\/doors\/solve-demo\//);
assert.match(html, /\/chum\/capabilities\/demo-sell-now-v1\//);

const sellNowSitemap = fs.readFileSync(path.join(root, 'public/chum/sitemaps/sell-now.xml'), 'utf8');
assert.match(sellNowSitemap, /\/chum\/commercial\/demo-sell-now-v1\//);
assert.match(sellNowSitemap, /\/chum\/answers\/doors\/buy-demo\//);
assert.match(sellNowSitemap, /\/chum\/capabilities\/demo-sell-now-v1\//);

const sitemapIndex = fs.readFileSync(path.join(root, 'public/chum/sitemaps/index.xml'), 'utf8');
assert.match(sitemapIndex, /<sitemapindex/);
assert.match(sitemapIndex, /sell-now\.xml/);
assert.match(sitemapIndex, /answers\.xml/);

const feed = JSON.parse(fs.readFileSync(path.join(root, 'public/chum/commercial/feed.json')));
assert.equal(feed.items.length, 1);
assert.equal(feed.items[0].title, 'Demo Sell Now');

fs.rmSync(root, { recursive: true, force: true });
console.log('CHUM commercial intent crawl mesh: PASS');
