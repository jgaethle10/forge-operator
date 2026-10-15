import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'review-artifacts', 'offers-v48');
const m = JSON.parse(readFileSync(join(root,'source-manifest.json'),'utf8'));
const names = ['index','ibm','findmypart','legacy','isaias'];
test('exact review source and no commerce authority',()=>{
 assert.equal(m.status,'review_only_not_published');
 assert.equal(m.real_checkout,false); assert.equal(m.real_customer_intake,false);
 for(const name of names){
  const b=readFileSync(join(root,`${name}.html`));
  assert.equal(createHash('sha256').update(b).digest('hex'),m.source_files[`${name}.html`].sha256,name);
  assert.equal(statSync(join(root,`${name}.html`)).size,m.source_files[`${name}.html`].bytes);
 }
});
test('local preview navigation and offline assets',()=>{
 for(const name of names){
  const html=readFileSync(join(root,`${name}.html`),'utf8');
  assert.match(html,/<html\s+lang="en"/i);
  for(const match of html.matchAll(/href="([^"]+\.html)"/g)){
   assert.ok(names.some(n=>match[1]===`${n}.html`),`${name}: bad nav ${match[1]}`);
  }
  assert.doesNotMatch(html,/<script[^>]+src=["']https?:/i);
  assert.doesNotMatch(html,/<link[^>]+href=["']https?:[^"']+\.css/i);
 }
});
test('commercial forms do not send without approved endpoint',()=>{
 for(const name of ['ibm','findmypart','legacy']){
  const html=readFileSync(join(root,`${name}.html`),'utf8');
  assert.match(html,/data-intake-endpoint=""/);
  assert.match(html,/not sent to Evercraft|not submitted|does not submit/i);
  assert.match(html,/illustrative|example|not an evaluated/i);
 }
});
test('storm brief does not claim a verified damage map',()=>{
 const html=readFileSync(join(root,'isaias.html'),'utf8');
 assert.match(html,/not a continuous best track/i);
 assert.match(html,/review-only|not a verified emergency operations product/i);
});

test('no broken font import remnants or remote stylesheets',()=>{
 for(const name of names){
  const html=readFileSync(join(root,name+'.html'),'utf8');
  const css=html.match(/<style>([\s\S]*?)<\/style>/i)?.[1];
  assert.ok(css,name+': missing inline stylesheet');
  assert.match(css,/^\s*:root\s*\{/i,name+': invalid stylesheet prelude');
  assert.doesNotMatch(css,/@import\s/i,name+': external/unsupported stylesheet import');
  assert.doesNotMatch(css,/&family=Manrope|display=swap'\)/i,name+': leftover font URL fragment');
  assert.doesNotMatch(html,/<link[^>]+rel=["']stylesheet["'][^>]+href=["']https?:/i);
 }
});
test('commercial scene choices declare accessible, distinct control states',()=>{
 for(const name of ['ibm','findmypart','legacy']){
  const html=readFileSync(join(root,name+'.html'),'utf8');
  for(const i of [0,1,2]){
   assert.match(html,new RegExp('data-stage-select="'+i+'"[^>]*aria-pressed="(?:true|false)"'),name+': stage '+i+' missing ARIA state');
  }
  assert.match(html,/prefers-reduced-motion/,name+': reduced-motion control missing');
 }
});
