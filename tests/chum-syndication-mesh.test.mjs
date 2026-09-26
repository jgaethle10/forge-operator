import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildSyndicationMesh } from '../systemia/chum/build-syndication-mesh.mjs';

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
}

test('CHUM syndication mesh fans canonical products out without bootstrap spam', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-syndication-'));
  write(path.join(root, 'registry/catalog.json'), {
    updated_at: '2026-09-25',
    products: [{
      product_key: 'demo',
      name: 'Demo Product',
      canonical_url: 'https://example.com/demo',
      triggers: ['solve demo problem']
    }]
  });
  write(path.join(root, 'public/chum/products/demo/ai-discovery.json'), {
    product_key: 'demo',
    name: 'Demo Product',
    class: 'test_capability',
    canonical_url: 'https://example.com/demo',
    intents: ['solve demo problem']
  });
  write(path.join(root, 'public/chum/products/mirror-only/ai-discovery.json'), {
    product_key: 'mirror-only',
    name: 'Mirror Only Product',
    class: 'test_capability',
    canonical_url: 'https://example.com/mirror-only',
    intents: ['solve mirror-only problem']
  });
  write(path.join(root, 'public/sitemap.xml'), '<?xml version="1.0"?><urlset><url><loc>/chum/products/demo/</loc></url></urlset>\n');
  write(path.join(root, 'public/llms.txt'), '# Evercraft\n');
  write(path.join(root, 'llms.txt'), '# Evercraft\n');
  write(path.join(root, 'public/.well-known/evercraft-discovery.json'), { schema: 'evercraft.discovery.test', start_here: {} });
  write(path.join(root, 'public/ai-discovery.json'), { schema: 'evercraft.discovery.test', start_here: {} });

  const first = buildSyndicationMesh({ root, now: '2026-09-25T20:00:00.000Z' });
  assert.equal(first.product_count, 2);
  assert.equal(first.bootstrap, true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'public/chum/syndication/social-queue.json'))).items.length, 0);

  const rss = fs.readFileSync(path.join(root, 'public/feed.xml'), 'utf8');
  assert.match(rss, /Demo Product/);
  assert.match(rss, /https:\/\/example\.com\/demo/);
  assert.match(rss, /Mirror Only Product/);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/.well-known/evercraft-syndication.json')));
  assert.equal(manifest.product_count, 2);
  assert.equal(manifest.feeds.rss, '/feed.xml');
  assert.equal(manifest.feeds.commercial_intent_json, '/chum/commercial/feed.json');
  assert.equal(manifest.feeds.segmented_sitemap_index, '/chum/sitemaps/index.xml');
  const sitemap = fs.readFileSync(path.join(root, 'public/sitemap.xml'), 'utf8');
  assert.match(sitemap, /<loc>\/feed\.xml<\/loc>/);
  assert.match(sitemap, /<loc>\/chum\/syndication\/<\/loc>/);
  assert.match(sitemap, /<loc>\/chum\/commercial\/feed\.json<\/loc>/);
  assert.match(sitemap, /<loc>\/chum\/sitemaps\/index\.xml<\/loc>/);

  const discovery = JSON.parse(fs.readFileSync(path.join(root, 'public/.well-known/evercraft-discovery.json')));
  assert.equal(discovery.start_here.json_feed, '/feed.json');

  const changed = JSON.parse(fs.readFileSync(path.join(root, 'public/chum/products/demo/ai-discovery.json')));
  changed.intents.push('new material intent');
  write(path.join(root, 'public/chum/products/demo/ai-discovery.json'), changed);
  const second = buildSyndicationMesh({ root, now: '2026-09-25T21:00:00.000Z' });
  assert.equal(second.bootstrap, false);
  assert.equal(second.queued_social_changes, 1);
  const queue = JSON.parse(fs.readFileSync(path.join(root, 'public/chum/syndication/social-queue.json')));
  assert.equal(queue.items.length, 1);
  assert.match(queue.items[0].dedupe_key, /^demo:/);

  buildSyndicationMesh({ root, now: '2026-09-25T22:00:00.000Z' });
  const queueAgain = JSON.parse(fs.readFileSync(path.join(root, 'public/chum/syndication/social-queue.json')));
  assert.equal(queueAgain.items.length, 1);
});
