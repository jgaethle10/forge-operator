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

test('both previews keep human-readable model boundaries and explicit source links',()=>{
  for(const name of ['physics','world']){
    const html=source(name);
    assert.match(html,/href="\.\.\/"/);
    assert.match(html,/rel="noopener noreferrer"/);
    assert.match(html,/owned/i);
    assert.ok(!html.includes('api/private'));
  }
});
