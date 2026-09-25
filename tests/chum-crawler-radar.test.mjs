import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildCrawlerRadar,
  classifyCrawlerUserAgent,
  createCrawlerObservation,
  createCrawlerRadarStore,
} from '../systemia/chum/crawler-radar.mjs';

assert.equal(classifyCrawlerUserAgent('Mozilla/5.0 compatible; GPTBot/1.2'), 'openai-training');
assert.equal(classifyCrawlerUserAgent('ClaudeBot/1.0'), 'anthropic-crawler');
assert.equal(classifyCrawlerUserAgent('ordinary browser'), null);

const privacy = createCrawlerObservation({
  pathname: '/forensiscope/?secret=nope',
  method: 'GET',
  userAgent: 'OAI-SearchBot/1.0',
  statusCode: 200,
  observedAt: '2026-09-25T20:00:00Z',
});
assert.equal(privacy.path, '/forensiscope/');
assert.equal(privacy.crawler_family, 'openai-search');
assert.equal(privacy.privacy.ip_recorded, false);
assert.equal(Object.hasOwn(privacy, 'ip'), false);

const store = createCrawlerRadarStore({ maxEvents: 100 });
store.observe({
  pathname: '/forensiscope/',
  method: 'GET',
  userAgent: 'OAI-SearchBot/1.0',
  statusCode: 200,
  observedAt: '2026-09-25T19:50:00Z',
});
store.observe({
  pathname: '/chum/products/aliev/',
  method: 'GET',
  userAgent: 'Googlebot/2.1',
  statusCode: 200,
  observedAt: '2026-09-25T20:01:00Z',
});
store.observe({
  pathname: '/private/admin',
  method: 'GET',
  userAgent: 'GPTBot/1.0',
  statusCode: 200,
  observedAt: '2026-09-25T20:02:00Z',
});
const snapshot = store.snapshot();
assert.equal(snapshot.event_count, 2);
assert.equal(snapshot.privacy.visitor_identity_recorded, false);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chum-radar-'));
fs.mkdirSync(path.join(root, 'public', 'chum'), { recursive: true });
fs.mkdirSync(path.join(root, 'conformance', 'provider-observations'), { recursive: true });
fs.writeFileSync(path.join(root, 'public', 'chum', 'crawl-state.json'), JSON.stringify({
  schema: 'evercraft.chum.crawl-state.v1',
  entries: {
    '/forensiscope/': {
      path: '/forensiscope/',
      content_sha256: 'new-forensiscope',
      last_indexnow_sha256: 'old-forensiscope',
      last_changed: '2026-09-25T19:55:00Z',
      priority: 94
    },
    '/chum/products/aliev/': {
      path: '/chum/products/aliev/',
      content_sha256: 'same-aliev',
      last_indexnow_sha256: 'same-aliev',
      last_changed: '2026-09-25T18:00:00Z',
      priority: 94
    }
  }
}, null, 2) + '\n');

fs.writeFileSync(path.join(root, 'conformance', 'provider-observations', 'forensiscope-miss.json'), JSON.stringify({
  schema: 'evercraft.provider-observation.v1',
  observed_at: '2026-09-25T19:30:00Z',
  provider: 'chatgpt',
  product_key: 'forensiscope',
  source: 'proof_fixture',
  surfaced_forensiscope: false
}, null, 2) + '\n');

const radar = await buildCrawlerRadar({
  root,
  now: new Date('2026-09-25T20:05:00Z'),
  runtimeSnapshot: snapshot,
  fetchRuntime: false
});

assert.equal(radar.schema, 'evercraft.chum.crawler-radar.v1');
assert.equal(radar.surface_count, 2);
const fsRow = radar.surfaces.find((row) => row.path === '/forensiscope/');
const alievRow = radar.surfaces.find((row) => row.path === '/chum/products/aliev/');
assert.ok(fsRow.score > alievRow.score);
assert.equal(fsRow.urgency, 'strike_now');
assert.ok(fsRow.reasons.includes('content_changed_after_last_observed_crawler_fetch'));
assert.ok(fsRow.reasons.includes('negative_provider_pickup_receipt'));
assert.ok(fs.existsSync(path.join(root, 'public', 'chum', 'crawler-radar.json')));
assert.ok(fs.existsSync(path.join(root, 'public', 'chum', 'strike', 'index.html')));
assert.ok(fs.existsSync(path.join(root, 'public', 'chum', 'strike', 'index.json')));

const strikeHtml = fs.readFileSync(path.join(root, 'public', 'chum', 'strike', 'index.html'), 'utf8');
assert.match(strikeHtml, /\/forensiscope\//);

console.log(JSON.stringify({
  ok: true,
  runtime_events: snapshot.event_count,
  radar_surfaces: radar.surface_count,
  strike_now: radar.strike_now_count,
  forensiscope_score: fsRow.score,
  aliev_score: alievRow.score,
}));
