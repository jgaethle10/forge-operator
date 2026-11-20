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
    'app.mjs','catalog.mjs','index.html','learning-worlds.mjs','mark.svg','styles.css','universe.mjs'
  ]);
  for (const file of Object.keys(AIDEN_LAB_FILES))
    assert.equal(resolveAidenLabRequest('/aiden-lab/' + file).name, file);
  assert.equal(resolveAidenLabRequest('/aiden-lab/').name, 'index.html');
  assert.equal(resolveAidenLabRequest('/aiden-lab').redirect, '/aiden-lab/');
  for (const p of [
    '/aiden-lab/README.md', '/aiden-lab/server.ts', '/aiden-lab/secrets',
    '/aiden-lab/nested/index.html', '/aiden-lab/%2Fserver.ts',
    '/aiden-lab/index.html.js', '/aiden-lab/.env',
    '/aiden-lab/classroom/README.md', '/aiden-lab/classroom/.env',
    '/aiden-lab/watershed/.env','/aiden-lab/watershed/README.md'
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

test('the reviewed Infinite Classroom practice preview opens through owned Fabric with script hashes', async () => {
  const rt = await startFabricLocalRuntime({
    host:'127.0.0.1', port:0, catalog:[], faieSurfaceEnabled:false
  });
  try {
    const canonical=fs.readFileSync(path.join(repoRoot,'public/apps/infinite-classroom/play/index.html'),'utf8');
    const r=await fetch(rt.url+'/aiden-lab/classroom/');
    assert.equal(r.status,200);
    assert.equal(r.headers.get('x-evercraft-static-program'),'aidens-lab-v1');
    assert.equal(r.headers.get('x-evercraft-learning-world'),'classroom-practice-v1');
    assert.equal(r.headers.get('content-type'),'text/html; charset=utf-8');
    const csp=r.headers.get('content-security-policy');
    assert.match(csp,/script-src 'sha256-/);
    assert.match(csp,/style-src 'sha256-/);
    assert.doesNotMatch(csp,/unsafe-inline|unsafe-eval/);
    assert.match(csp,/connect-src 'none'/);
    const body=await r.text();
    assert.equal(body,canonical);
    assert.match(body,/Math Cave|Science Sky Lab/);
    const other=await fetch(rt.url+'/aiden-lab/classroom',{redirect:'manual'});
    assert.equal(other.status,308);
    assert.equal(other.headers.get('location'),'/aiden-lab/classroom/');
    const post=await fetch(rt.url+'/aiden-lab/classroom/',{method:'POST'});
    assert.equal(post.status,405);
    const noFiles=await fetch(rt.url+'/aiden-lab/classroom/README.md');
    assert.equal(noFiles.status,404);
  }finally{await rt.close()}
});


test('Physics, World and Watershed Atlases are first-party, read-only interactive experiences',async()=>{
  const rt=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false});
  try{
    for(const world of [
      {name:'physics',marker:'physics-model-v1',identity:'Physics Atlas',words:/PROJECTILE MOTION|pendulum/i},
      {name:'world',marker:'earth-globe-v1',identity:'Earth & World Atlas',words:/Mariana Trench|Yakima Basin/},
      {name:'watershed',marker:'watershed-water-balance-v1',identity:'Watershed Laboratory',words:/WATER BALANCE|Watershed Laboratory|SNOWPACK/}
    ]){
      const sourceHtml=fs.readFileSync(path.join(repoRoot,'public/aiden-lab',world.name,'index.html'),'utf8');
      const r=await fetch(rt.url+'/aiden-lab/'+world.name+'/');
      assert.equal(r.status,200,world.name);
      assert.equal(r.headers.get('x-evercraft-static-program'),'aidens-lab-v1');
      assert.equal(r.headers.get('x-evercraft-learning-world'),world.marker);
      assert.equal(r.headers.get('content-type'),'text/html; charset=utf-8');
      const csp=r.headers.get('content-security-policy');
      assert.match(csp,/script-src 'sha256-/);
      assert.match(csp,/style-src 'sha256-/);
      assert.match(csp,/connect-src 'none'/);
      assert.doesNotMatch(csp,/unsafe-inline|unsafe-eval|https?:/i);
      assert.equal(await r.text(),sourceHtml);
      assert.match(sourceHtml,world.words);
      assert.match(sourceHtml,new RegExp(world.identity.replace('&','&')));
      const redirect=await fetch(rt.url+'/aiden-lab/'+world.name,{redirect:'manual'});
      assert.equal(redirect.status,308);
      assert.equal(redirect.headers.get('location'),'/aiden-lab/'+world.name+'/');
      const exact=await fetch(rt.url+'/aiden-lab/'+world.name+'/index.html');
      assert.equal(exact.status,200);
      assert.equal(await exact.text(),sourceHtml);
      assert.equal((await fetch(rt.url+'/aiden-lab/'+world.name+'/README.md')).status,404);
      assert.equal((await fetch(rt.url+'/aiden-lab/'+world.name+'/.env')).status,404);
      assert.equal((await fetch(rt.url+'/aiden-lab/'+world.name+'/',{method:'POST'})).status,405);
    }
    assert.equal((await fetch(rt.url+'/health')).status,200);
  }finally{await rt.close()}
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
