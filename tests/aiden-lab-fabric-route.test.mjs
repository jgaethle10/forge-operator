import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAidenLabRequest, AIDEN_LAB_FILES } from '../systemia/mcp/aiden-lab-public-route.mjs';
import { startFabricLocalRuntime } from '../systemia/mcp/fabric-local-runtime.mjs';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const source = (name) => fs.readFileSync(path.join(repoRoot, 'public/aiden-lab', name), 'utf8');

test('strictly allowlists five exact science assets', () => {
  assert.deepEqual(Object.keys(AIDEN_LAB_FILES).sort(), [
    'app.mjs','catalog.mjs','index.html','mark.svg','styles.css'
  ]);
  for (const file of Object.keys(AIDEN_LAB_FILES))
    assert.equal(resolveAidenLabRequest('/aiden-lab/' + file).name, file);
  assert.equal(resolveAidenLabRequest('/aiden-lab/').name, 'index.html');
  assert.equal(resolveAidenLabRequest('/aiden-lab').redirect, '/aiden-lab/');
  for (const p of [
    '/aiden-lab/README.md', '/aiden-lab/server.ts', '/aiden-lab/secrets',
    '/aiden-lab/nested/index.html', '/aiden-lab/%2Fserver.ts',
    '/aiden-lab/index.html.js', '/aiden-lab/.env'
  ]) {
    const r = resolveAidenLabRequest(p);
    assert.equal(r.handled, true, p);
    assert.equal(r.status, 404, p);
  }
  assert.equal(resolveAidenLabRequest('/mcp').handled, false);
  assert.equal(resolveAidenLabRequest('/health').handled, false);
});

test('real Fabric runtime serves the exact reviewed files with secure content types', async () => {
  const rt = await startFabricLocalRuntime({
    host:'127.0.0.1', port:0, catalog:[], faieSurfaceEnabled:false
  });
  try {
    for (const [name, type] of Object.entries(AIDEN_LAB_FILES)) {
      const r = await fetch(rt.url + '/aiden-lab/' + name);
      assert.equal(r.status, 200, name);
      assert.equal(r.headers.get('content-type'), type, name);
      assert.equal(r.headers.get('x-evercraft-static-program'), 'aidens-lab-v1');
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
      assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
      assert.match(r.headers.get('content-security-policy'), /style-src 'self'/);
      assert.equal(await r.text(), source(name), name + ' must match canonical source bytes');
    }
    const home = await fetch(rt.url + '/aiden-lab/');
    assert.equal(home.status, 200);
    assert.equal(await home.text(), source('index.html'));
    const naked = await fetch(rt.url + '/aiden-lab', {redirect:'manual'});
    assert.equal(naked.status, 308);
    assert.equal(naked.headers.get('location'), '/aiden-lab/');
    const head = await fetch(rt.url + '/aiden-lab/catalog.mjs', {method:'HEAD'});
    assert.equal(head.status, 200);
    assert.equal((await head.text()).length, 0);
    assert.equal(Number(head.headers.get('content-length')), Buffer.byteLength(source('catalog.mjs')));
    const denied = await fetch(rt.url + '/aiden-lab/README.md');
    assert.equal(denied.status, 404);
    assert.doesNotMatch(await denied.text(), /GitHub is durable source/);
    const method = await fetch(rt.url + '/aiden-lab/app.mjs', {method:'POST'});
    assert.equal(method.status, 405);
    const health = await fetch(rt.url + '/health');
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);
  } finally {
    await rt.close();
  }
});

test('URL traversal cannot read repository private or unrelated files', async () => {
  const rt = await startFabricLocalRuntime({
    host:'127.0.0.1', port:0, catalog:[], faieSurfaceEnabled:false
  });
  try {
    for (const encoded of ['%2e%2e%2f%2e%2e%2fserver.ts', '%2Fetc%2Fpasswd', '%2e%2e%2fREADME.md']) {
      const response = await fetch(rt.url + '/aiden-lab/' + encoded, {redirect:'manual'});
      assert.notEqual(response.status, 200, encoded);
      const body = await response.text();
      assert.doesNotMatch(body, /import express|EVERCRAFT.*SECRET|GitHub is durable source/);
    }
  } finally { await rt.close(); }
});
