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

    const ptr=await fetch(runtime.url+'/go/roman/links.json');
    assert.equal(ptr.status,200);
    assert.equal(ptr.headers.get('cache-control'),'no-store');
    const routes=await ptr.json();
    assert.equal(routes.subject,'voteroman.com');
    assert.equal(routes.original_domain_auto_redirect_active,false);
    assert.equal(routes.primary_evercraft_entry,'https://fabric.systemiacommandcenters.com/go/roman');
    assert.equal(routes.existing_donation_website,'https://donate.voteroman.com/');
    assert.equal(routes.deployed_on_original_domain,false);
    const ptrHead=await fetch(runtime.url+'/go/roman/links.json',{method:'HEAD'});
    assert.equal(ptrHead.status,200);
    assert.equal(await ptrHead.text(),'');
    const ptrPost=await fetch(runtime.url+'/go/roman/links.json',{method:'POST'});
    assert.equal(ptrPost.status,405);
    const entry = await fetch(runtime.url + '/go/roman?ref=private-value', { redirect:'manual' });
    assert.equal(entry.status,302);
    assert.equal(entry.headers.get('location'),'/campaigns/roman/');
    assert.equal(entry.headers.get('x-evercraft-continuity-route'),'local_ready');
    assert.equal(entry.headers.get('cache-control'),'no-store');
    assert.doesNotMatch(entry.headers.get('location'),/private-value/);
    const shortHead=await fetch(runtime.url+'/go/roman/',{method:'HEAD',redirect:'manual'});
    assert.equal(shortHead.status,302);
    assert.equal(shortHead.headers.get('location'),'/campaigns/roman/');
    assert.equal(await shortHead.text(),'');
    const blockedPost=await fetch(runtime.url+'/go/roman',{method:'POST',redirect:'manual'});
    assert.equal(blockedPost.status,405);
    const h=await fetch(runtime.url+'/health').then(r=>r.json());
    assert.equal(h.roman_owned_funnel_path,'/go/roman');
    assert.equal(h.roman_owned_funnel_dns_interception,false);

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
