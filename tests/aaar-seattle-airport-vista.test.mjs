import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync('public/worlds/flight/index.html','utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\\s\\S]*?)<\\/script>/g)].map(x=>x[1]);
const block=term=>{
 const s=scripts.find(x=>x.includes(term));
 assert.ok(s,'Missing game script '+term);
 return s;
};
const between=(a,b)=>{
 const i=html.indexOf(a),j=html.indexOf(b,i);
 assert.ok(i>=0&&j>i,'Missing source block '+a);
 return html.slice(i,j);
};
function graphics(){
 const ctx=vm.createContext({location:{hash:'#seattle'},document:{documentElement:{classList:{toggle(){}}}}});
 ctx.window=ctx;
 vm.runInContext(block('evercraft.aaar.flight-ground-ops.v2'),ctx,{timeout:3000});
 vm.runInContext(block('const landmarkList=['),ctx,{timeout:3000});
 ctx.seattle=ctx.AAARSeattle;
 vm.runInContext(between('function forAirportVistaQuads(','function airportStructures('),ctx,{timeout:3000});
 vm.runInContext(between('function airportVistaDetails(','function addRunwaySoftware('),ctx,{timeout:3000});
 vm.runInContext(between('function drawVistaAircraft2D(','function render2D()'),ctx,{timeout:3000});
 return ctx;
}
test('every flight HTML script still parses',()=>{
 assert.ok(scripts.length>=8);
 for(const [i,s] of scripts.entries())assert.doesNotThrow(()=>new vm.Script(s),'script '+i);
});
test('both airports receive bounded, valid new pavement geometry',()=>{
 const world=graphics();
 for(const f of world.AAARGroundOps.fields){
  let count=0;
  const focus={x:f.x,z:f.z};
  world.forAirportVistaQuads((a,b,c,d,color,hex)=>{
   count++;
   for(const point of [a,b,c,d])for(const n of point)assert.ok(Number.isFinite(n));
   assert.equal(color.length,3);
   assert.match(hex,/^#[0-9a-fA-F]{6}$/);
   for(const point of [a,b,c,d]){
    assert.ok(Math.hypot(point[0]-f.x,point[2]-f.z)<4400,
       'source-renderer should cull remote geometry in mobile view');
   }
  },focus);
  assert.ok(count>180&&count<900,f.code+': bounded taxi/apron scenery count '+count);
 }
});
test('Boeing hangars and SEA terminal gates have distinct, modest scene budgets',()=>{
 const world=graphics();
 const counts=[];
 for(const f of world.AAARGroundOps.fields){
  let count=0;
  world.airportVistaDetails((x,y,z,width,height,depth,color)=>{
   count++;
   assert.ok([x,y,z,width,height,depth].every(Number.isFinite));
   assert.ok(width>0&&height>0&&depth>0);
   assert.ok(Math.hypot(x-f.x,z-f.z)<4000);
   assert.ok(color.length===3&&color.every(c=>c>=0&&c<=1));
  },{x:f.x,z:f.z});
  counts.push({code:f.code,count});
  assert.ok(count>=90&&count<=330, f.code+' detail budget');
 }
 assert.ok(counts.find(x=>x.code==='KSEA').count>counts.find(x=>x.code==='KBFI').count,
    'large Sea-Tac gate apron should be richer than Boeing hangars');
});
test('three mobile plane silhouettes render into genuine Canvas2D paths and shading',()=>{
 const world=graphics();
 for(const craft of ['trainer','glider','jet']){
  const effects={fills:0,strokes:0,gradients:0,paths:0};
  const g={addColorStop(){}};
  const canvas={
   save(){},restore(){},translate(){},scale(){},rotate(){},beginPath(){effects.paths++},
   moveTo(){},lineTo(){},closePath(){},ellipse(){},arc(){},fillRect(){effects.fills++},
   fill(){effects.fills++},stroke(){effects.strokes++},
   createLinearGradient(){effects.gradients++;return g}
  };
  assert.doesNotThrow(()=>world.drawVistaAircraft2D(canvas,390,844,{
   craft,bank:.1,pitch:.05,speed:70,flightTime:4,throttle:.8
  }),craft+' must paint even in touch-only fallback');
  assert.ok(effects.fills>=18&&effects.paths>=15,craft+' is missing dimensional aircraft faces');
  assert.ok(effects.gradients>=3,craft+' missing aircraft materials');
  assert.ok(effects.strokes>=4,craft+' missing painted contour and controls');
 }
});
test('graphics additions retain original flight state, passport, and both renderers',()=>{
 assert.match(html,/forAirportVistaQuads\(\(a,b,c,d,color\)=>w\.quad/);
 assert.match(html,/forAirportVistaQuads\(\(a,b,c,d,_rgb,color\)=>quad/);
 assert.match(html,/airportVistaDetails\(drawBox,state\)/);
 assert.match(html,/airportVistaDetails\(\(x,y,z,width,height,depth,color,roof\)=>/);
 assert.match(html,/drawVistaAircraft2D\(ctx,w,h,state\)/);
 assert.doesNotMatch(html,/ctx\.fillRect\(-100,4,24,8\)/);
 assert.match(html,/function startRunway\(/);
 assert.match(html,/function startApproach\(/);
 assert.match(html,/id="aaar-sky-passport-model"/);
 assert.match(html,/SOURCE_LOCATED_VISUAL_GAMEPLAY_AIRFIELDS/);
 assert.doesNotMatch(html,/cdn\.jsdelivr\.net|unpkg\.com|threejs\.org/);
});
