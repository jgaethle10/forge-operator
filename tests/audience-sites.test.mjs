import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../public/audience-sites/',import.meta.url);
const slugs=['partscout','valuescout','playbook-lab','site-rescue','creative-studio','publisher-lab','relay-notes'];
const read=path=>fs.readFileSync(new URL(path,root),'utf8');

test('seven independently useful original microproperties are present',()=>{
 const m=JSON.parse(read('properties.json'));
 assert.equal(m.sites.length,7);
 assert.equal(new Set(m.sites.map(x=>x.slug)).size,7);
 assert.equal(m.evercraft_network_product_unmodified,true);
 assert.equal(m.revenue_verified,false);
 assert.equal(m.paid_partners_verified,false);
 for(const slug of slugs){
  const html=read(slug+'/index.html');
  assert.match(html,/<h1>/);
  assert.match(html,/id="(run|pass)"/);
  assert.match(html,/<script>/);
  assert.match(html,/aria-live="polite"/);
  assert.ok(html.includes('https://jgaethle10.github.io/forge-operator/audience-sites/'+slug+'/'));
  assert.ok(!/evercraft|mailto:|fabric\\.systemiacommandcenters/i.test(html));
  assert.match(html,/content="noindex,follow"/);
  assert.ok(!/base44\.app/i.test(html));
  assert.ok(!/rivet|aliev/i.test(html));
  const code=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(code&&code.length>100,'missing useful clientside logic: '+slug);
  assert.doesNotThrow(()=>new vm.Script(code,{filename:slug+'.js'}),'invalid script: '+slug);
  assert.doesNotMatch(code,/\bfetch\s*\(|sendBeacon|XMLHttpRequest|localStorage|sessionStorage|document\.cookie/);
 }
});

test('audience sites remain distinct from the existing Evercraft Network product',()=>{
 const dir=read('index.html');
 assert.match(dir,/content="noindex,nofollow"/);
 assert.doesNotMatch(dir,/evercraft|mailto:|\/mesh\/|\/live\//i);
 assert.ok(slugs.every(s=>dir.includes('href="./'+s+'/')));
 assert.ok(!dir.includes('<a href="./network/'));
 assert.match(dir,/temporary technical index/i);
});

test('adult lane remains unpublished pending legal and payment compliance',()=>{
 const m=JSON.parse(read('properties.json'));
 assert.equal(m.adult_distribution.not_published,true);
 assert.equal(m.adult_distribution.separately_branded,false);
 assert.ok(m.adult_distribution.preflight_required.includes('age_verification_jurisdictional'));
});

test('sitemap only contains seven current microproperties plus directory',()=>{
 const xml=read('sitemap.xml');
 const locations=[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
 assert.equal(locations.length,8);
 assert.ok(locations.every(s=>s.startsWith('https://jgaethle10.github.io/forge-operator/audience-sites/')));
});

test('no active ad, affiliate or payment receipts are fabricated',()=>{
 const index=read('index.html');
 assert.match(index,/No fabricated visitor counts/i);
 assert.match(index,/No paid product recommendation/i);
 assert.match(index,/noindex,nofollow/i);
});
