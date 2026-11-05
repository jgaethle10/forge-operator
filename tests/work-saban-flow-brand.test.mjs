import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../public/work-saban/',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const mark=read('brand/work-saban-mark.svg');
const social=read('brand/work-saban-social.svg');
const brand=read('brand/index.html');
const routes=['index.html','plan/index.html','demo/index.html','report/index.html'];

test('selected logo is a compact, unframed flowing crimson mark with finishing dot',()=>{
  assert.match(mark,/viewBox="0 0 128 128"/);
  assert.match(mark,/flow symbol/);
  assert.match(mark,/linearGradient/);
  assert.match(mark,/#A4142F/);
  assert.match(mark,/circle cx="103" cy="20" r="13"/);
  assert.match(mark,/flowing crimson ribbons/i);
  assert.doesNotMatch(mark,/M56 75H201L157 116/);
  assert.doesNotMatch(mark,/<rect\b/);
  assert.doesNotMatch(mark,/<script\b|<foreignObject\b|onload\s*=/i);
});

test('actual customer pages use refreshed flow mark and two-tone wordmark',()=>{
  for(const route of routes){
    const html=read(route);
    assert.match(html,/work-saban-mark\.svg\?v=flow3/,route);
    assert.match(html,/brand-accent/,route);
    assert.match(html,/saban<\/span>/,route);
    assert.doesNotMatch(html,/routed S logo/,route);
  }
  assert.match(brand,/flowing crimson symbol/);
  assert.match(brand,/work <span>saban<\/span><small>BY EVERCRAFT/);
  assert.match(brand,/href="\.\/work-saban-mark\.svg\?v=flow3" download/);
});

test('launch artwork carries the same identity, no stale routing mark',()=>{
  assert.match(social,/social-flow/);
  assert.match(social,/circle cx="103" cy="20" r="13"/);
  assert.match(social,/fill="#A4142F" font-size="40"[^>]*>saban<\/text>/);
  assert.doesNotMatch(social,/M56 75H201L157 116/);
});