import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {REGIONS,buildNeuralAtlas,adaptiveNodeBudget,projectAtlasNode} from '../public/leiland/neural-universe.mjs';

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
