import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startChumPublicOrigin } from '../systemia/chum/public-origin-runtime.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chum-public-origin-'));
const publicRoot = path.join(root, 'public');
fs.mkdirSync(path.join(publicRoot, 'chum', 'hot'), { recursive: true });
fs.mkdirSync(path.join(publicRoot, '.well-known'), { recursive: true });
fs.writeFileSync(path.join(root, 'secret.txt'), 'PRIVATE-NOT-PUBLIC\n');
fs.writeFileSync(path.join(publicRoot, 'chum', 'index.html'), '<h1>CHUM</h1>\n');
fs.writeFileSync(path.join(publicRoot, 'chum', 'hot', 'index.html'), '<h1>HOT</h1>\n');
fs.writeFileSync(path.join(publicRoot, 'robots.txt'), 'User-agent: *\nAllow: /\nSitemap: https://old.invalid/sitemap.xml\n');
fs.writeFileSync(path.join(publicRoot, 'sitemap.xml'), [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  '  <url><loc>/chum/</loc></url>',
  '  <url><loc>/chum/hot/</loc></url>',
  '</urlset>',
  ''
].join('\n'));
fs.writeFileSync(path.join(publicRoot, '8aef5f814d0b9c2896c1bc753c65c9bc.txt'), '8aef5f814d0b9c2896c1bc753c65c9bc\n');
fs.writeFileSync(path.join(publicRoot, 'chum', 'crawl-state.json'), JSON.stringify({
  schema: 'evercraft.chum.crawl-state.v1',
  url_count: 2,
  entries: {}
}) + '\n');

const runtime = await startChumPublicOrigin({ publicRoot, host: '127.0.0.1', port: 0 });

try {
  const health = await fetch(runtime.url + '/api/health').then((r) => r.json());
  assert.equal(health.ok, true);
  assert.equal(health.service, 'chum-public-origin');
  assert.equal(health.runtime, 'Evercraft Compute');
  assert.equal(health.tracked_public_surfaces, 2);
  assert.equal(health.deployment_receipt_bound, false);

  runtime.setDeploymentReceipt('receipt-proof-123');
  const bound = await fetch(runtime.url + '/api/health').then((r) => r.json());
  assert.equal(bound.deployment_receipt_bound, true);
  assert.equal(bound.deployment_receipt_ref, 'receipt-proof-123');

  const rootResponse = await fetch(runtime.url + '/', { redirect: 'manual' });
  assert.equal(rootResponse.status, 308);
  assert.equal(rootResponse.headers.get('location'), '/chum/');

  const chum = await fetch(runtime.url + '/chum/');
  assert.equal(chum.status, 200);
  assert.match(await chum.text(), /CHUM/);
  assert.match(chum.headers.get('link') || '', /sitemap\.xml/);

  const sitemap = await fetch(runtime.url + '/sitemap.xml').then((r) => r.text());
  assert.equal(sitemap.includes(runtime.url + '/chum/'), true);
  assert.equal(sitemap.includes('old.invalid'), false);

  const robots = await fetch(runtime.url + '/robots.txt').then((r) => r.text());
  assert.equal(robots.includes('Sitemap: ' + runtime.url + '/sitemap.xml'), true);
  assert.equal(robots.includes('old.invalid'), false);

  const key = await fetch(runtime.url + '/8aef5f814d0b9c2896c1bc753c65c9bc.txt').then((r) => r.text());
  assert.equal(key.trim(), '8aef5f814d0b9c2896c1bc753c65c9bc');

  const traversal = await fetch(runtime.url + '/%2e%2e/secret.txt');
  assert.equal(traversal.status, 404);
  assert.doesNotMatch(await traversal.text(), /PRIVATE-NOT-PUBLIC/);

  const writeAttempt = await fetch(runtime.url + '/chum/', { method: 'POST' });
  assert.equal(writeAttempt.status, 405);

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.chum-public-origin.runtime-proof.v1',
    read_only: true,
    path_escape_blocked: true,
    dynamic_sitemap: true,
    dynamic_robots: true,
    deployment_receipt_binding: true
  }));
} finally {
  await runtime.close();
  fs.rmSync(root, { recursive: true, force: true });
}
