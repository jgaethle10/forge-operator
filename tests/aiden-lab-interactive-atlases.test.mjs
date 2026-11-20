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


test('museum physics challenges are real, achievable variable/model checks rather than click-through badges',()=>{
 const js=script(source('physics'));
 const begin=js.indexOf('const CHALLENGES='),end=js.indexOf('let questAdvancePending=',begin);
 assert.ok(begin>0&&end>begin);
 const challenges=vm.runInNewContext(js.slice(begin,end)+'\nCHALLENGES;',{Math});
 assert.deepEqual(Object.keys(challenges).sort(),['launch','pendulum','wave']);
 const examples={
  launch:[[45,20,9.8],[45,20,4],[45,32,9.8]],
  pendulum:[[1.5,10,9.8],[2.5,10,9.8],[2.5,8,3]],
  wave:[[.5,6,1],[2,4,1],[1,4,2]]
 };
 const evaluate=(mode,v)=>{
  const [a,b,c]=v;
  if(mode==='launch')return {range:b*b*Math.sin(2*a*Math.PI/180)/c};
  if(mode==='pendulum')return {period:2*Math.PI*Math.sqrt(a/c)};
  return {wavelength:b/a};
 };
 for(const [mode,lessons] of Object.entries(challenges)){
  assert.equal(lessons.length,3);
  assert.equal(new Set(lessons.map(x=>x.id)).size,3);
  for(let i=0;i<lessons.length;i++){
   const quest=lessons[i],v=examples[mode][i];
   assert.ok(quest.title.length>8&&quest.prompt.length>25&&quest.hint.length>15);
   assert.equal(quest.pass(v,evaluate(mode,v)),true,mode+' '+quest.id+' should be reachable');
  }
 }
 assert.equal(challenges.launch[0].pass([20,20,9.8],evaluate('launch',[20,20,9.8])),false);
 assert.equal(challenges.pendulum[0].pass([1.5,29,9.8],evaluate('pendulum',[1.5,29,9.8])),false);
 assert.equal(challenges.wave[1].pass([1,4,1],evaluate('wave',[1,4,1])),false);
 assert.match(js,/function checkQuest\(\)/);
 assert.match(js,/q\.pass\(values\(\),currentResult\(\)\)/);
});
test('museum Earth expeditions use three real locations and answer-checked evidence per route',()=>{
 const js=script(source('world'));
 const start=js.indexOf('const TRAILS='),end=js.indexOf('let activeTrail=',start);
 assert.ok(start>0&&end>start);
 const trails=vm.runInNewContext(js.slice(start,end)+'\nTRAILS;');
 assert.deepEqual(Object.keys(trails).sort(),['extremes','tectonics','water']);
 const ids=new Set([...js.matchAll(/\{id:'([a-z]+)',emoji:/g)].map(x=>x[1]));
 assert.equal(ids.size,8);
 for(const trail of Object.values(trails)){
  assert.equal(trail.steps.length,3);
  assert.equal(new Set(trail.steps.map(x=>x.place)).size,3);
  for(const stop of trail.steps){
   assert.ok(ids.has(stop.place),'trail point not on the evidence map: '+stop.place);
   assert.equal(stop.choices.length,3);
   assert.ok(Number.isInteger(stop.answer)&&stop.answer>=0&&stop.answer<3);
   assert.ok(stop.story.length>35&&stop.explain.length>40);
  }
 }
 assert.match(js,/if\(i!==step\.answer\)/);
 assert.match(js,/select\(step\.place\)/);
 assert.match(js,/if\(!trailAnswered\)return/);
});
test('science museum passport is optional and device-local in both worlds',()=>{
 for(const name of ['physics','world']){
  const html=source(name),js=script(html);
  assert.match(html,/id="rememberPass" type="checkbox"|type="checkbox" id="rememberPass"/);
  assert.match(html,/id="clearPass"/);
  assert.match(html,/role="status"/);
  assert.match(html,/href="\.\.\/(physics|world)\/"/);
  assert.match(js,/const PASS_KEY='evercraft\.aidens-lab\.museum-pass\.v1'/);
  assert.match(js,/if\(!remember\)return/);
  assert.match(js,/localStorage\.removeItem\(PASS_KEY\)/);
  assert.match(js,/localStorage\.setItem\(PASS_KEY/);
  assert.match(js,/function passportInit\(\)/);
  assert.match(js,/new Set\(saved\.(physics|world)\.filter/);
  assert.doesNotMatch(js,/fetch\s*\(|WebSocket|XMLHttpRequest|sendBeacon|navigator\.geolocation/);
 }
});


test('physics scientific method bench records comparable A/B model outputs and checks actual prediction',()=>{
 const html=source('physics'),js=script(html),css=style(html);
 assert.doesNotThrow(()=>new vm.Script(js,{filename:'physics-museum-comparison.js'}));
 for(const id of ['trialA','trialB','clearComparison','compareChart','compareFeedback','predictPrompt'])
   assert.match(html,new RegExp('id="'+id+'"'));
 for(const prediction of ['higher','lower','same'])
   assert.match(html,new RegExp('data-predict="'+prediction+'"'));
 assert.match(js,/function measurement\(\)/);
 assert.match(js,/function captureTrialA\(\)/);
 assert.match(js,/function captureTrialB\(\)/);
 assert.match(js,/function renderComparison\(\)/);
 assert.match(js,/const tolerance=Math\.max\(\.05,compareA\.result\*\.01\)/);
 assert.match(js,/next\.values\.every\(\(n,i\)=>Math\.abs\(n-compareA\.values\[i\]\)<\.000001\)/);
 assert.match(js,/compareB\.result\/compareA\.result/);
 assert.match(js,/if\(compareA&&compareA\.mode!==next\)resetComparison\(\)/);
 const start=js.indexOf('const COMPARE_MODELS='),end=js.indexOf('let compareA=',start);
 assert.ok(start>0&&end>start);
 const mapping=vm.runInNewContext(js.slice(start,end)+'\nCOMPARE_MODELS;');
 assert.equal(mapping.launch.metric({range:42}),42);
 assert.equal(mapping.pendulum.metric({period:2.5}),2.5);
 assert.equal(mapping.wave.metric({wavelength:6}),6);
 assert.match(css,/\.compare-bar/);
 assert.doesNotMatch(js,/\bfetch\s*\(|WebSocket|XMLHttpRequest|sendBeacon/);
});
