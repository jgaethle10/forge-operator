import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const text=p=>readFileSync(resolve(root,p),'utf8');
const files=['index.html','app/app.js','app/core.mjs','app/journal.mjs','app/storage.mjs','manifest.webmanifest','icon.svg','sw.js'];
test('all first-party asset files present',()=>files.forEach(f=>assert.ok(existsSync(resolve(root,f)),f)));
test('manifest installs under current path, not a 3rd-party domain',()=>{
  const m=JSON.parse(text('manifest.webmanifest'));assert.equal(m.scope,'./');assert.equal(m.start_url,'./');assert.equal(m.display,'standalone');
  for(const icon of m.icons)assert.ok(existsSync(resolve(root,icon.src)));
});
test('hosted origin CSP blocks third-party scripts and network sync',()=>{
  const html=text('index.html');
  assert.match(html,/connect-src 'none'/);assert.match(html,/worker-src 'self'/);
  assert.match(html,/script-src 'self'/);assert.doesNotMatch(html,/script-src 'unsafe-inline'/);
  assert.match(html,/src="\.\/app\/app\.js"/);
});
test('offline service worker precache lists every runtime asset',()=>{
  const s=text('sw.js');for(const f of files.filter(f=>f!=='sw.js'))assert.ok(s.includes(`'./${f}'` )||f==='icon.svg'&&s.includes("'./icon.svg'"),f);
  assert.ok(s.includes("uri.origin!==self.location.origin"));assert.ok(s.includes("req.method!=='GET'"));
  assert.ok(!s.includes('postMessage('));
});
test('different origin localStorage cannot silently be presented as RC15 IndexedDB',()=>{
  const s=text('app/app.js');assert.ok(!s.includes('localStorage.setItem'));
  assert.ok(!s.includes('localStorage.getItem'));
  assert.match(text('README.md'),/does not migrate automatically/);
});
test('no remote endpoint or CDN dependency',()=>{
  for(const f of files.filter(x=>!x.endsWith('.svg')))assert.doesNotMatch(text(f),/https?:\/\/[a-z0-9][a-z0-9.-]+\//i,f);
});
