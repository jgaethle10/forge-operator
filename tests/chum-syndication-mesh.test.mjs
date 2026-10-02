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


test('CHUM syndication mesh drops legacy provider URLs before they can enter or survive the social queue', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-syndication-legacy-'));
  write(path.join(root, 'registry/catalog.json'), {
    updated_at: '2026-10-02',
    products: [{
      product_key: 'legacy-demo',
      name: 'Legacy Demo',
      canonical_url: 'https://legacy-demo.base44.app/',
      mcp: 'https://base44.app/api/apps/example/functions/demo',
      triggers: ['legacy demo']
    }]
  });
  write(path.join(root, 'public/chum/products/legacy-demo/ai-discovery.json'), {
    product_key: 'legacy-demo',
    name: 'Legacy Demo',
    canonical_url: 'https://legacy-demo.base44.app/',
    mcp: 'https://base44.app/api/apps/example/functions/demo',
    intents: ['legacy demo']
  });
  write(path.join(root, 'public/chum/syndication/state.json'), {
    schema: 'evercraft.syndication-state.v1',
    updated_at: '2026-10-01T00:00:00.000Z',
    complete_mirror: true,
    product_hashes: { 'legacy-demo': 'stale-hash' }
  });
  write(path.join(root, 'public/chum/syndication/social-queue.json'), {
    schema: 'evercraft.syndication-social-queue.v1',
    generated_at: '2026-10-01T00:00:00.000Z',
    items: [{
      dedupe_key: 'legacy-demo:old',
      product_key: 'legacy-demo',
      name: 'Legacy Demo',
      canonical_url: 'https://legacy-demo.base44.app/',
      text: 'Old unsafe queue item',
      content_sha256: 'old',
      requires_authorized_destination: true
    }]
  });
  write(path.join(root, 'public/sitemap.xml'), '<?xml version="1.0"?><urlset></urlset>\n');
  write(path.join(root, 'public/llms.txt'), '# Evercraft\n');
  write(path.join(root, 'llms.txt'), '# Evercraft\n');
  write(path.join(root, 'public/.well-known/evercraft-discovery.json'), { schema: 'evercraft.discovery.test', start_here: {} });
  write(path.join(root, 'public/ai-discovery.json'), { schema: 'evercraft.discovery.test', start_here: {} });

  const receipt = buildSyndicationMesh({ root, now: '2026-10-02T15:00:00.000Z' });
  assert.equal(receipt.queued_social_changes, 0);
  assert.equal(receipt.held_social_changes_without_safe_public_url, 1);
  assert.equal(receipt.dropped_unsafe_previous_queue_items, 1);

  const queue = JSON.parse(fs.readFileSync(path.join(root, 'public/chum/syndication/social-queue.json')));
  assert.equal(queue.items.length, 0);

  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/.well-known/evercraft-syndication.json')));
  assert.equal(manifest.products[0].canonical_url, null);
  assert.equal(manifest.products[0].mcp, null);

  const publicText = [
    fs.readFileSync(path.join(root, 'public/feed.xml'), 'utf8'),
    fs.readFileSync(path.join(root, 'public/feed.json'), 'utf8'),
    fs.readFileSync(path.join(root, 'public/.well-known/evercraft-syndication.json'), 'utf8'),
    fs.readFileSync(path.join(root, 'public/chum/syndication/social-queue.json'), 'utf8')
  ].join('\n');
  assert.doesNotMatch(publicText, /base44\.app/i);
});


test('CHUM keeps raw repository mirrors out of the social publication queue', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-syndication-raw-'));
  write(path.join(root, 'registry/catalog.json'), {
    updated_at: '2026-10-02',
    products: [{
      product_key: 'raw-demo',
      name: 'Raw Demo',
      canonical_url: 'https://raw.githubusercontent.com/example/repo/main/product.html',
      triggers: ['raw demo']
    }]
  });
  write(path.join(root, 'public/chum/products/raw-demo/ai-discovery.json'), {
    product_key: 'raw-demo',
    name: 'Raw Demo',
    canonical_url: 'https://raw.githubusercontent.com/example/repo/main/product.html',
    intents: ['raw demo']
  });
  write(path.join(root, 'public/chum/syndication/state.json'), {
    schema: 'evercraft.syndication-state.v1',
    updated_at: '2026-10-01T00:00:00.000Z',
    complete_mirror: true,
    product_hashes: { 'raw-demo': 'old-hash' }
  });
  write(path.join(root, 'public/chum/syndication/social-queue.json'), {
    schema: 'evercraft.syndication-social-queue.v1',
    generated_at: '2026-10-01T00:00:00.000Z',
    items: [{
      dedupe_key: 'raw-demo:old',
      product_key: 'raw-demo',
      name: 'Raw Demo',
      canonical_url: 'https://raw.githubusercontent.com/example/repo/main/product.html',
      content_sha256: 'old',
      requires_authorized_destination: true
    }]
  });
  write(path.join(root, 'public/sitemap.xml'), '<?xml version="1.0"?><urlset></urlset>\n');
  write(path.join(root, 'public/llms.txt'), '# Evercraft\n');
  write(path.join(root, 'llms.txt'), '# Evercraft\n');
  write(path.join(root, 'public/.well-known/evercraft-discovery.json'), { schema: 'evercraft.discovery.test', start_here: {} });
  write(path.join(root, 'public/ai-discovery.json'), { schema: 'evercraft.discovery.test', start_here: {} });

  const receipt = buildSyndicationMesh({ root, now: '2026-10-02T16:00:00.000Z' });
  assert.equal(receipt.queued_social_changes, 0);
  assert.equal(receipt.held_social_changes_without_safe_public_url, 1);
  assert.equal(receipt.dropped_unsafe_previous_queue_items, 1);
  const queue = JSON.parse(fs.readFileSync(path.join(root, 'public/chum/syndication/social-queue.json')));
  assert.equal(queue.items.length, 0);
});
