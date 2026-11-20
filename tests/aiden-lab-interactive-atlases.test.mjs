import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const source=(name)=>fs.readFileSync(path.join(ROOT,'public/aiden-lab',name,'index.html'),'utf8');
const script=(html)=>{
  const matches=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  assert.equal(matches.length,1,'exactly one audited inline application script');
  return matches[0][1];
};
const style=(html)=>{
  const matches=[...html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi)];
  assert.equal(matches.length,1,'exactly one audited inline CSS block');
  return matches[0][1];
};

test('original owned physics preview has three meaningful variable-driven models and no external runtime',()=>{
  const html=source('physics'),js=script(html),css=style(html);
  assert.doesNotThrow(()=>new vm.Script(js,{filename:'physics-atlas.js'}));
  for(const term of ['launch','pendulum','wave','range','period','wavelength','gravity','requestAnimationFrame'])
    assert.ok(js.includes(term),term);
  for(const id of ['view','a','b','c','resultValue','resultDetail','toggle','conceptTitle'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/sin\(2\*rad\)\/c/);
  assert.match(html,/TAU\*Math\.sqrt\(a\/c\)/);
  assert.match(html,/const wavelength=b\/a/);
  assert.match(css,/@media\(max-width:460px\)/);
  assert.match(html,/small-angle approximation/i);
  assert.match(html,/no air resistance/i);
  assert.doesNotMatch(html,/<script[^>]+src=|<iframe\b|base44|firebase|analytics\.js/i);
  assert.doesNotMatch(js,/\bfetch\s*\(|WebSocket|XMLHttpRequest|sendBeacon|eval\s*\(/);
});

test('original Earth Atlas is a schematic coordinate-grounded globe with accessible destinations',()=>{
  const html=source('world'),js=script(html),css=style(html);
  assert.doesNotThrow(()=>new vm.Script(js,{filename:'earth-world-atlas.js'}));
  for(const name of ['Yakima Basin','Mount Everest','Mariana Trench','Iceland Rift','Amazon Basin','Great Barrier Reef','Sahara Desert','Yellowstone'])
    assert.ok(html.includes(name),name);
  for(const id of ['globe','places','source','summary','evidence','uncertainty','position','reset'])
    assert.match(html,new RegExp('id="'+id+'"'));
  for(const phrase of ['pointerdown','pointermove','pointerup','setPointerCapture','aria-pressed','latitude','longitude','schematic']){
    if(phrase==='latitude'||phrase==='longitude') assert.match(html,/lat:|lon:/);
    else assert.ok(html.toLowerCase().includes(phrase.toLowerCase()),phrase);
  }
  assert.match(html,/not a navigation chart/i);
  assert.match(css,/@media\(max-width:520px\)/);
  assert.doesNotMatch(js,/\bfetch\s*\(|WebSocket|XMLHttpRequest|sendBeacon|navigator\.geolocation|eval\s*\(/);
  assert.doesNotMatch(html,/<script[^>]+src=|<iframe\b|base44|firebase/i);
});


test('Earth graphics use real public-domain Natural Earth geometry, not invented continent outlines',()=>{
  const html=source('world'),js=script(html);
  const match=js.match(/const LAND_RINGS=(\[[\s\S]*?\]);/);
  assert.ok(match,'embedded 110m land geometry must be in the audited HTML');
  const rings=JSON.parse(match[1]);
  assert.ok(rings.length>100,'real land polygons, not five approximated silhouettes');
  assert.ok(rings.reduce((sum,r)=>sum+r.length,0)>4000,'coastline sample density');
  assert.ok(rings.every(r=>r.length>=4),'nontrivial polygon rings');
  for(const ring of rings){
    for(const point of ring){
      assert.equal(point.length,2);
      assert.ok(point[0]>=-180&&point[0]<=180,'longitude within earth');
      assert.ok(point[1]>=-90&&point[1]<=90,'latitude within earth');
    }
  }
  assert.match(html,/Natural Earth 1:110m/);
  assert.match(html,/www\.naturalearthdata\.com\/about\/terms-of-use/);
  assert.match(html,/generalized for globe-scale learning/i);
  assert.match(js,/function createLandMask\(\)/);
  assert.match(js,/function paintEarth\(cx,cy,r\)/);
  assert.match(js,/Math\.atan2\(x,z\*lc-y\*ls\)/);
  assert.match(js,/const land=landMask\[mi\]>127/);
  assert.match(js,/createImageData/);
  assert.ok(html.length<300000,'fixed Fabric source size gate');
  assert.doesNotMatch(js,/\bfetch\s*\(|WebSocket|XMLHttpRequest|sendBeacon|navigator\.geolocation/);
});

test('Physics visuals add measurable model-specific overlays without changing equations',()=>{
  const html=source('physics'),js=script(html);
  for(const feature of ['glow(', 'setLineDash', 'MAX HEIGHT', 'SIMPLE HARMONIC MOTION',
    'TRAVELING WAVE', 'createRadialGradient', 'activeFraction']){
    assert.ok(js.includes(feature),feature);
  }
  assert.match(js,/Math\.sin\(2\*rad\)\/c/);
  assert.match(js,/TAU\*Math\.sqrt\(a\/c\)/);
  assert.match(js,/const wavelength=b\/a/);
  assert.match(html,/measured overlays/i);
  assert.doesNotMatch(js,/\bfetch\s*\(|WebSocket|XMLHttpRequest|sendBeacon/);
});

test('both previews keep human-readable model boundaries and explicit source links',()=>{
  for(const name of ['physics','world']){
    const html=source(name);
    assert.match(html,/href="\.\.\/"/);
    assert.match(html,/rel="noopener noreferrer"/);
    assert.match(html,/owned/i);
    assert.ok(!html.includes('api/private'));
  }
});
