import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCrawlPressure, crawlPriority } from '../systemia/chum/crawl-accelerator.mjs';

assert.equal(crawlPriority('/chum/commercial/rivet-site-underwriting-v1/'), 112);
assert.equal(crawlPriority('/chum/sitemaps/sell-now.xml'), 108);
assert.equal(crawlPriority('/chum/answers/doors/example/'), 100);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-crawl-pressure-'));
const publicRoot = path.join(root, 'public');
fs.mkdirSync(path.join(publicRoot, 'chum', 'answers', 'doors', 'ev-site'), { recursive: true });
fs.mkdirSync(path.join(publicRoot, '.well-known'), { recursive: true });

fs.writeFileSync(path.join(publicRoot, 'chum', 'answers', 'doors', 'ev-site', 'index.html'), '<h1>EV site</h1>\n');
fs.writeFileSync(path.join(publicRoot, '.well-known', 'evercraft-products.json'), '{"products":[]}\n');
fs.writeFileSync(path.join(publicRoot, 'sitemap.xml'), [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  '  <url><loc>/chum/answers/doors/ev-site/</loc></url>',
  '  <url><loc>/.well-known/evercraft-products.json</loc></url>',
  '</urlset>',
  ''
].join('\n'));

const first = await buildCrawlPressure({
  root,
  now: '2026-09-25T06:30:00.000Z',
  origin: '',
  broadcast: false
});
assert.equal(first.changed_surfaces, 2);
assert.equal(first.indexed_surfaces, 2);
assert.equal(first.origin_source, 'not_configured');

const state1 = JSON.parse(fs.readFileSync(path.join(publicRoot, 'chum', 'crawl-state.json'), 'utf8'));
assert.equal(state1.entries['/chum/answers/doors/ev-site/'].priority, 100);
assert.equal(state1.entries['/chum/answers/doors/ev-site/'].last_changed, '2026-09-25T06:30:00.000Z');

const sitemap1 = fs.readFileSync(path.join(publicRoot, 'sitemap.xml'), 'utf8');
assert.match(sitemap1, /<lastmod>2026-09-25T06:30:00.000Z<\/lastmod>/);

const second = await buildCrawlPressure({
  root,
  now: '2026-09-25T06:45:00.000Z',
  origin: '',
  broadcast: false
});
assert.equal(second.changed_surfaces, 0);

const state2 = JSON.parse(fs.readFileSync(path.join(publicRoot, 'chum', 'crawl-state.json'), 'utf8'));
assert.equal(state2.entries['/chum/answers/doors/ev-site/'].last_changed, '2026-09-25T06:30:00.000Z');

fs.writeFileSync(path.join(publicRoot, 'chum', 'answers', 'doors', 'ev-site', 'index.html'), '<h1>EV opportunity updated</h1>\n');
const third = await buildCrawlPressure({
  root,
  now: '2026-09-25T07:00:00.000Z',
  origin: '',
  broadcast: false
});
assert.equal(third.changed_surfaces, 1);

const state3 = JSON.parse(fs.readFileSync(path.join(publicRoot, 'chum', 'crawl-state.json'), 'utf8'));
assert.equal(state3.entries['/chum/answers/doors/ev-site/'].last_changed, '2026-09-25T07:00:00.000Z');
assert.equal(state3.entries['/.well-known/evercraft-products.json'].last_changed, '2026-09-25T06:30:00.000Z');

const freshness = JSON.parse(fs.readFileSync(path.join(publicRoot, 'chum', 'freshness.json'), 'utf8'));
assert.equal(freshness.latest_change_batch.length, 1);
assert.equal(freshness.latest_change_batch[0].path, '/chum/answers/doors/ev-site/');

const feed = fs.readFileSync(path.join(publicRoot, 'chum', 'freshness.xml'), 'utf8');
assert.match(feed, /Evercraft CHUM Freshness Feed/);
assert.match(feed, /\/chum\/answers\/doors\/ev-site\//);

const hotHtml = fs.readFileSync(path.join(publicRoot, 'chum', 'hot', 'index.html'), 'utf8');
const hotJson = JSON.parse(fs.readFileSync(path.join(publicRoot, 'chum', 'hot', 'index.json'), 'utf8'));
assert.match(hotHtml, /Hot Discovery Queue/);
assert.equal(hotJson.surfaces[0].path, '/chum/answers/doors/ev-site/');
assert.equal(hotJson.surfaces[0].priority, 100);

fs.writeFileSync(path.join(publicRoot, '.well-known', 'evercraft-runtime-origin.json'), JSON.stringify({
  schema: 'evercraft.runtime-origin.v1',
  runtime: 'forge-operator',
  verified: true,
  origin: 'https://forge.evercraft.example/path-that-must-be-stripped',
  deployment_receipt_hash: 'receipt-demo',
  verified_at: '2026-09-25T07:05:00.000Z'
}, null, 2) + '\n');

const fourth = await buildCrawlPressure({
  root,
  now: '2026-09-25T07:10:00.000Z',
  origin: '',
  broadcast: false
});
assert.equal(fourth.origin, 'https://forge.evercraft.example');
assert.equal(fourth.origin_source, 'verified_runtime_origin_receipt');
assert.equal(fourth.origin_receipt_hash, 'receipt-demo');

const freshnessWithOrigin = JSON.parse(fs.readFileSync(path.join(publicRoot, 'chum', 'freshness.json'), 'utf8'));
assert.match(freshnessWithOrigin.recent_surfaces[0].url, /^https:\/\/forge\.evercraft\.example\//);

console.log(JSON.stringify({
  ok: true,
  changed_first: first.changed_surfaces,
  changed_second: second.changed_surfaces,
  changed_third: third.changed_surfaces,
  verified_origin_source: fourth.origin_source
}));
