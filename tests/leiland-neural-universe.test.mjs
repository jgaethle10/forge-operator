import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {REGIONS,buildNeuralAtlas,adaptiveNodeBudget,projectAtlasNode,buildCinematicArteries,sampleCinematicArtery} from '../public/leiland/neural-universe.mjs';

const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','public','leiland');
const read=name=>fs.readFileSync(path.join(sourceRoot,name),'utf8');

test('deterministic immersive atlas includes each of the five original Evercraft architecture regions',()=>{
 const a=buildNeuralAtlas(),b=buildNeuralAtlas();
 assert.equal(a.nodes.length,850);
 assert.ok(a.links.length>600);
 assert.equal(a.stars.length,145);
 assert.deepEqual(a,b,'same program and seed must never invent changing mission data');
 assert.deepEqual([...new Set(a.nodes.map(n=>n.region))].sort(),[...REGIONS].sort());
 for(const n of a.nodes){
  assert.ok(Number.isFinite(n.x)&&Number.isFinite(n.y)&&Number.isFinite(n.z));
  assert.ok(Math.abs(n.x)<1.6&&Math.abs(n.y)<1.6&&Math.abs(n.z)<1.6);
 }
 assert.ok(a.links.every(l=>Number.isSafeInteger(l.a)&&Number.isSafeInteger(l.b)&&l.a>=0&&l.b>=0&&l.a<a.nodes.length&&l.b<a.nodes.length));
 assert.ok(a.links.some(l=>l.region==='bridge'),'cross-region architecture bridges should be present');
 assert.notDeepEqual(buildNeuralAtlas({seed:12345,count:850}).nodes.slice(0,10),a.nodes.slice(0,10));
});
test('phone, desktop and reduced motion rendering use bounded node budgets',()=>{
 assert.equal(adaptiveNodeBudget(360),275);
 assert.equal(adaptiveNodeBudget(640),430);
 assert.equal(adaptiveNodeBudget(1200),850);
 assert.equal(adaptiveNodeBudget(360,true),225);
 assert.equal(adaptiveNodeBudget(1200,true),460);
 assert.throws(()=>buildNeuralAtlas({count:10000}),/atlas_node_count_invalid/);
});
test('perspective math preserves finite, bounded projections at portrait and landscape sizes',()=>{
 const atlas=buildNeuralAtlas();
 for(const [width,height] of [[360,720],[390,500],[1366,800]]){
  for(const n of atlas.nodes.slice(0,200)){
   const p=projectAtlasNode(n,{width,height,yaw:.22,pitch:-.1,zoom:width<700?.91:1.03});
   assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.scale));
   assert.ok(p.scale>=.71&&p.scale<=1.45);
   assert.ok(p.x>=-width&&p.x<=width*2);
   assert.ok(p.y>=-height&&p.y<=height*2);
  }
 }
});
test('immersive stage keeps visual truth visible and all five region controls operable',()=>{
 const html=read('index.html'),brain=read('brain.js'),visual=read('neural-universe.mjs');
 for(const region of REGIONS){
  assert.ok(html.includes('data-region="'+region+'"'),'Region button missing '+region);
  assert.ok(brain.includes('REGIONS.includes(region)'),'Region selection must remain allowlisted');
 }
 assert.ok(html.includes('CONCEPTUAL ANIMATION · NOT MODEL ACTIVATIONS'));
 assert.ok(html.includes('id="current-region"'));
 assert.ok(html.includes('aria-pressed="false"'));
 assert.ok(html.includes('aria-label="Explore the five neural architecture regions"'));
 assert.ok(brain.includes("createNeuralUniverse("));
 assert.ok(brain.includes("universe?.acknowledgeCycle();"));
 assert.ok(brain.includes("universe?.setPublicEventCount(sourceFresh?sourceEvents.length:0);"));
 assert.ok(visual.includes('The Neural Universe'));
 assert.ok(visual.includes('not real model activations')||visual.includes('NOT real model activations'));
 assert.ok(!visual.includes('fetch('),'Visual module must never access private or public network data');
 assert.ok(!visual.includes('localStorage'),'No telemetry about visitors');
 assert.ok(!visual.includes('innerHTML'),'No untrusted content rendering');
});
test('reduced motion and broadcast still prioritize the full-screen observatory',()=>{
 const css=read('style.css'),visual=read('neural-universe.mjs');
 assert.ok(css.includes('body.broadcast .brain-stage'));
 assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'));
 assert.ok(css.includes('.region-pin'));
 assert.ok(css.includes('.stage-hud'));
 assert.ok(visual.includes('reduce.matches'));
 assert.ok(visual.includes('IntersectionObserver'));
 assert.ok(visual.includes('visibilitychange'));
 assert.ok(visual.includes('adaptiveNodeBudget'));
});


test('cinematic arteries preserve deterministic sculpted architecture with no fabricated activity',()=>{
 const a=buildCinematicArteries(),b=buildCinematicArteries();
 assert.deepEqual(a,b,'scenic motion should be independent of private services and wall-clock events');
 assert.equal(a.length,9);
 assert.ok(Object.isFrozen(a));
 for(const artery of a){
  assert.ok(REGIONS.includes(artery.from)&&REGIONS.includes(artery.to));
  for(const t of [0,.14,.33,.5,.71,1]){
   const p=sampleCinematicArtery(artery,t);
   assert.ok([p.x,p.y,p.z].every(Number.isFinite));
   assert.ok(Math.abs(p.x)<1.5&&Math.abs(p.y)<1.5&&Math.abs(p.z)<1.5);
  }
  const first=sampleCinematicArtery(artery,0),last=sampleCinematicArtery(artery,1);
  assert.deepEqual([first.x,first.y,first.z],artery.p0);
  assert.deepEqual([last.x,last.y,last.z],artery.p3);
  assert.deepEqual(sampleCinematicArtery(artery,-100),first);
  assert.deepEqual(sampleCinematicArtery(artery,Infinity),first);
  assert.deepEqual(sampleCinematicArtery(artery,100),last);
 }
 assert.notDeepEqual(buildCinematicArteries(987654),a);
});

test('mobile cinematic effects remain explicitly synthetic, bounded and accessible',()=>{
 const visual=read('neural-universe.mjs'),css=read('style.css');
 assert.ok(visual.includes('const steps=small?22:34'),'cap artery tessellation on phones');
 assert.ok(visual.includes('const count=chosen?2:1'),'cap illuminated travelers per artery');
 assert.ok(visual.includes('if(!still){'),'no moving packets in reduced-motion');
 assert.ok(visual.includes('ARTERY_PAIRS'));
 assert.ok(visual.includes('setPublicEventCount(n)'),'public event marks stay separate');
 assert.ok(visual.includes('acknowledgeCycle()'),'only verified pulse triggers a specific ripple');
 assert.ok(!visual.includes('fetch('),'scenic visualizer never reads a remote source itself');
 assert.ok(!visual.includes('AudioContext')&&!visual.includes('WebGLRenderingContext'));
 assert.ok(css.includes('LEILAND CINEMATIC / V2'));
 assert.ok(css.includes('leiland-core-breathe'));
 assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'));
 assert.ok(css.includes('.intro p{display:none}'),'put the immersive artwork above the fold on iPhone');
});


test('watchable tour remains conceptual, touch-selectable and quiet for accessibility',()=>{
 const html=read('index.html'),brain=read('brain.js');
 assert.ok(html.includes('SCENIC ARCHITECTURE TOUR · TAP TO EXPLORE'));
 assert.ok(html.includes('id="system-detail" aria-live="off"'));
 assert.ok(brain.includes("const scenicSequence=Object.freeze("));
 assert.ok(brain.includes("manualHoldUntil=Date.now()+90000"));
 assert.ok(brain.includes("document.hidden||reduce.matches||Date.now()<manualHoldUntil"));
 assert.ok(brain.includes("},18000)"));
 assert.ok(brain.includes("$('system-detail').setAttribute('aria-live',manual?'polite':'off')"));
 assert.ok(brain.includes("chooseRegion(button.dataset.system||button.dataset.region,true)"));
 assert.ok(!brain.includes('requestAnimationFrame(advanceScenicTour)'));
});


test('portrait lens fills a tall phone with architecture rather than a central thumbnail',()=>{
 const opts={width:390,height:740,yaw:0,pitch:0,zoom:.91,offsetX:0,offsetY:0};
 const top=projectAtlasNode({x:0,y:-.56,z:0},opts);
 const bottom=projectAtlasNode({x:0,y:.55,z:0},opts);
 assert.ok(bottom.y-top.y>310,'regions should span a generous vertical distance in 9:16');
 assert.ok(top.y>0&&bottom.y<opts.height);
 const desktop=projectAtlasNode({x:0,y:.55,z:0},{
  width:1365,height:900,yaw:0,pitch:0,zoom:1.03,offsetX:0,offsetY:0
 });
 assert.ok(Number.isFinite(desktop.y),'landscape projection stays valid');
 const visual=read('neural-universe.mjs');
 assert.ok(visual.includes('radiusY=height>width*1.3'));
 assert.ok(visual.includes('threadCount=small?2:3'),'phone helix count must remain bounded');
 assert.ok(visual.includes('steps=small?23:34'),'phone curve tessellation must remain bounded');
 assert.ok(visual.includes('NOT neural firing'),'braid motion must be clearly described as scenic');
});
