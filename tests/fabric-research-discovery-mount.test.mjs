import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startFabricLocalRuntime } from '../systemia/mcp/fabric-local-runtime.mjs';

test('owned Fabric serves only public CHUM and guarded research routes without touching MCP', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fabric-research-discovery-'));
  const pub = path.join(root, 'public');
  fs.mkdirSync(path.join(pub, 'chum', 'sitemaps'), { recursive: true });
  fs.mkdirSync(path.join(pub, 'research', 'pet-food'), { recursive: true });
  fs.writeFileSync(path.join(root, 'not-public.txt'), 'PRIVATE NEVER SERVE');
  fs.writeFileSync(path.join(pub, 'chum', 'index.html'), '<h1>CHUM public</h1>');
  fs.writeFileSync(path.join(pub, 'research', 'index.html'), '<meta name="robots" content="noindex,follow"><h1>Research Atlas</h1>');
  fs.writeFileSync(path.join(pub, 'research', 'pet-food', 'index.html'), '<h1>Evidence preview</h1>');
  fs.writeFileSync(path.join(pub, 'research', 'discovery.json'), '{"publication_state":"review_pending"}');
  fs.writeFileSync(path.join(pub, 'robots.txt'), 'User-agent: *\nAllow: /\nSitemap: https://old.invalid/sitemap.xml\n');
  fs.writeFileSync(path.join(pub, 'sitemap.xml'), '<urlset><url><loc>/chum/</loc></url></urlset>');
  fs.writeFileSync(path.join(pub, 'chum', 'sitemaps', 'index.xml'), '<sitemapindex><sitemap><loc>/chum/sitemaps/answers.xml</loc></sitemap></sitemapindex>');
  fs.writeFileSync(path.join(pub, 'chum', 'sitemaps', 'answers.xml'), '<urlset><url><loc>/chum/answers/</loc></url></urlset>');

  const runtime = await startFabricLocalRuntime({
    host: '127.0.0.1',
    port: 0,
    catalog: [],
    discoveryPublicRoot: pub,
    faieSurfaceEnabled: false,
  });
  try {
    const health = await fetch(runtime.url + '/health');
    assert.equal(health.status, 200);
    assert.equal((await health.json()).service, 'evercraft-fabric-local');

    const mch = await fetch(runtime.url + '/mcp');
    assert.equal(mch.status, 200, 'MCP route must be preserved');

    const chum = await fetch(runtime.url + '/chum/');
    assert.equal(chum.status, 200);
    assert.match(await chum.text(), /CHUM public/);
    assert.equal(chum.headers.get('x-robots-tag'), 'index, follow');

    for (const route of ['/sitemap.xml', '/chum/sitemaps/index.xml', '/chum/sitemaps/answers.xml']) {
      const res = await fetch(runtime.url + route);
      assert.equal(res.status, 200, route);
      const xml = await res.text();
      assert.match(xml, /https:\/\/fabric\.systemiacommandcenters\.com\/chum\//);
      assert.doesNotMatch(xml, /<loc>\//, 'all sitemap loc must be absolute');
      const head = await fetch(runtime.url + route, { method: 'HEAD' });
      assert.equal(head.status, 200);
      assert.equal(await head.text(), '');
      assert.equal(Number(head.headers.get('content-length')), Buffer.byteLength(xml));
    }

    const robots = await fetch(runtime.url + '/robots.txt');
    assert.equal(robots.status, 200);
    assert.ok((await robots.text()).includes('Sitemap: https://fabric.systemiacommandcenters.com/sitemap.xml'));

    const research = await fetch(runtime.url + '/research/');
    assert.equal(research.status, 200);
    assert.equal(research.headers.get('x-robots-tag'), 'noindex, follow');
    const article = await fetch(runtime.url + '/research/pet-food/');
    assert.equal(article.status, 200);
    assert.equal(article.headers.get('x-robots-tag'), 'noindex, follow');
    const machine = await fetch(runtime.url + '/research/discovery.json');
    assert.equal(machine.status, 200);
    assert.equal(machine.headers.get('x-robots-tag'), 'noindex, follow');

    const denied = await fetch(runtime.url + '/research/', { method: 'POST' });
    assert.equal(denied.status, 405);
    assert.equal(denied.headers.get('allow'), 'GET, HEAD');

    for (const target of [
      '/research/%2e%2e%2fnot-public.txt',
      '/chum/%2e%2e%2fnot-public.txt',
      '/not-public.txt',
      '/research/unknown.json',
    ]) {
      const res = await fetch(runtime.url + target);
      assert.notEqual(res.status, 200, 'private or missing must not serve: ' + target);
      assert.doesNotMatch(await res.text(), /PRIVATE NEVER SERVE/);
    }
    console.log('FABRIC STATIC DISCOVERY REAL-RUNTIME MOUNT PASS');
  } finally {
    await runtime.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
