import test from 'node:test';
import assert from 'node:assert/strict';
import { startFabricLocalRuntime } from '../systemia/mcp/fabric-local-runtime.mjs';

test('Evercraft Fabric serves the independent read-only Roman emergency page, including safe HEAD', async () => {
  const runtime = await startFabricLocalRuntime({
    host: '127.0.0.1',
    port: 0,
    catalog: []
  });
  try {
    const page = await fetch(runtime.url + '/campaigns/roman/');
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('x-evercraft-campaign-source'), 'owned-fabric-static');
    assert.match(page.headers.get('content-type') || '', /text\/html/);
    assert.match(page.headers.get('x-robots-tag') || '', /noindex/);
    const body = await page.text();
    assert.match(body, /Roman Kilinkaridis/);
    assert.match(body, /https:\/\/donate\.voteroman\.com\//);
    assert.doesNotMatch(body, /\[APP UNAVAILABLE\]/);

    const alias = await fetch(runtime.url + '/campaigns/roman');
    assert.equal(alias.status, 200);
    assert.equal(await alias.text(), body);

    const head = await fetch(runtime.url + '/campaigns/roman/', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal(Number(head.headers.get('content-length')), Buffer.byteLength(body));

    const health = await fetch(runtime.url + '/health').then(r => r.json());
    assert.equal(health.roman_emergency_mirror_ready, true);
    assert.equal(health.roman_domain_dns_cutover_verified, false);
    assert.equal(health.roman_emergency_mirror_owner_review_required, true);

    const checkout = await fetch(runtime.url + '/campaigns/roman/checkout');
    assert.equal(checkout.status, 404);
    const mutating = await fetch(runtime.url + '/campaigns/roman/', { method: 'POST' });
    assert.notEqual(mutating.status, 200);
  } finally {
    await runtime.close();
  }
});
