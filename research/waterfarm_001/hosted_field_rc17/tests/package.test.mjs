import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const text=p=>readFileSync(resolve(root,p),'utf8');
const files=['index.html','app/app.js','app/core.mjs','app/journal.mjs','app/storage.mjs','app/readiness.mjs','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png','apple-touch-icon.png','sw.js'];
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
test('offline service worker is exact-scope and never swaps an open client automatically',()=>{
 const sw=text('sw.js');
 for(const f of files.filter(x=>x!=='sw.js'))assert.ok(sw.includes(`'${f}'`)||f==='index.html'&&sw.includes("'index.html'"),f);
 assert.match(sw,/self.registration.scope/);assert.match(sw,/!APPROVED.has\(url.href\)/);
 assert.doesNotMatch(sw,/ignoreSearch:\s*true/);
 assert.doesNotMatch(sw,/skipWaiting\s*\(/);assert.doesNotMatch(sw,/self\.clients\.claim\s*\(/);
});
test('different origin localStorage cannot silently be presented as RC16 IndexedDB',()=>{
  const s=text('app/app.js');assert.ok(!s.includes('localStorage.setItem'));
  assert.ok(!s.includes('localStorage.getItem'));
  assert.match(text('README.md'),/does not migrate automatically/);
});
test('no remote endpoint or CDN dependency',()=>{
  for(const f of files.filter(x=>!x.endsWith('.svg')))assert.doesNotMatch(text(f),/https?:\/\/[a-z0-9][a-z0-9.-]+\//i,f);
});
