import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const manifest=JSON.parse(readFileSync(new URL('../docs/branding/legacy-product-faces-20261117.json',import.meta.url),'utf8'));
test('all recovered families have distinct, reviewable identity data',()=>{
 assert.ok(manifest.products.length>=30);
 assert.equal(new Set(manifest.products.map(x=>x.id)).size,manifest.products.length);
 assert.ok(manifest.products.every(x=>x.identity.background && x.identity.accent && x.tagline));
 assert.ok(manifest.products.every(x=>x.provider_free_required));
 assert.equal(manifest.policy.existing_names_preserved_unless_founder_approved,true);
 assert.equal(manifest.products.find(x=>x.id==='rivet').name_status,'retire_public');
});
test('three independent previews disclose concept status and contain product-specific design',()=>{
 for(const id of ['infinite-classroom','evercraft-circles','systemia-remote-ops']){
  const html=readFileSync(new URL('../public/brand-lab/'+id+'/index.html',import.meta.url),'utf8');
  assert.match(html,/Brand direction only/);
  assert.match(html,/not a released product/);
  assert.match(html,/noindex,nofollow/);
  assert.match(html,/Evercraft LLC/);
  assert.doesNotMatch(html,/base44\\.app|base44\\.com|<script[^>]*src=/i);
 }
 assert.match(readFileSync(new URL('../public/brand-lab/systemia-remote-ops/index.html',import.meta.url),'utf8'),/payroll, loans, crews/);
 assert.match(readFileSync(new URL('../public/brand-lab/infinite-classroom/index.html',import.meta.url),'utf8'),/Science Sky Lab/);
});
