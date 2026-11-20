import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync('public/worlds/flight/index.html','utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
const script=needle=>{
 const code=scripts.find(x=>x.includes(needle));
 assert.ok(code,'Missing '+needle);
 return code;
};
function create(){
 const ctx=vm.createContext({
  location:{hash:'#seattle'},
  document:{documentElement:{classList:{toggle(){}}}}
 });
 ctx.window=ctx;
 vm.runInContext(script('evercraft.aaar.flight-ground-ops.v2'),ctx,{timeout:3000});
 vm.runInContext(script('const landmarkList=['),ctx,{timeout:3000});
 vm.runInContext(script('function startRunway('),ctx,{timeout:3000});
 return {ops:ctx.AAARGroundOps,core:ctx.AAARFlight,geo:ctx.AAARSeattle};
}
function stepUntil(core,s,expected,max=4000,input=()=>({})){
 for(let i=0;i<max&&s.condition!==expected;i++)core.step(s,input(i,s),.05);
 return s;
}
test('all browser inline scripts parse, avoiding invisible blank-game syntax failures',()=>{
 assert.ok(scripts.length>=8);
 for(const [i,code] of scripts.entries())
  assert.doesNotThrow(()=>new vm.Script(code),'script '+i);
});
test('both airports use source-located runway endpoints, not the old fictional strip',()=>{
 const {ops,core}=create();
 assert.equal(ops.world,'SOURCE_LOCATED_VISUAL_GAMEPLAY_AIRFIELDS');
 assert.equal(ops.fields.length,2);
 const bfi=ops.fields.find(f=>f.code==='KBFI'),sea=ops.fields.find(f=>f.code==='KSEA');
 assert.ok(bfi&&sea);
 assert.ok(Math.abs(bfi.length-3050)<5,'BFI runway length corresponds to published 10007 ft');
 assert.ok(Math.abs(sea.length-3627)<10,'SEA runway length corresponds to published 11901 ft');
 assert.ok(Math.abs(bfi.yaw*180/Math.PI-150)<2);
 assert.ok(Math.abs(Math.abs(sea.yaw*180/Math.PI)-180)<2);
 assert.ok(Math.hypot(bfi.x-sea.x,bfi.z-sea.z)>8000);
 for(const f of ops.fields){
  const p=ops.point(f,0,0),g=ops.local(f,p.x,p.z);
  assert.ok(Math.abs(g.u)<1e-6&&Math.abs(g.v)<1e-6);
  ops.select(f.code);
  assert.ok(Math.abs(core.groundHeight(p.x,p.z)-f.level)<1e-6,'flattened field must match its game elevation');
  assert.ok(ops.inside(p.x,p.z));
  assert.equal(ops.at(p.x,p.z).code,f.code);
 }
 assert.throws(()=>ops.select('GAME'),/unknown_airport/);
 assert.throws(()=>ops.select('KPAE'),/unknown_airport/);
});
for(const airport of ['KBFI','KSEA']){
 for(const craft of ['trainer','glider','jet']){
  test(airport+' '+craft+': grounded takeoff, safe touchdown, brake, and another takeoff',()=>{
   const {ops,core}=create();
   let s=core.startRunway(craft,airport);
   assert.equal(s.condition,'ON_GROUND');
   assert.equal(s.airport,airport);
   assert.equal(s.speed,0);
   stepUntil(core,s,'FLYING',1000,i=>({throttle:1,pitch:i>95?1:0}));
   assert.equal(s.condition,'FLYING',JSON.stringify(s.events));
   assert.ok(s.events.some(e=>e.kind==='takeoff'||e.kind==='simulated_glider_tow_release'));
   s=core.startApproach(craft,airport);
   stepUntil(core,s,'ON_GROUND',3500,()=>({pitch:0,bank:0,rudder:0,throttle:0}));
   assert.equal(s.condition,'ON_GROUND',JSON.stringify(s.events));
   assert.equal(s.airport,airport);
   assert.equal(ops.at(s.x,s.z).code,airport);
   assert.ok(s.events.some(e=>e.kind==='landing'&&e.airport===airport));
   for(let i=0;i<1000&&s.speed>.05;i++)core.step(s,{brake:true,throttle:-1},.05);
   assert.equal(s.condition,'ON_GROUND');
   assert.equal(s.speed,0);
   stepUntil(core,s,'FLYING',1000,i=>({throttle:1,pitch:i>95?1:0}));
   assert.equal(s.condition,'FLYING','re-departure should not require a reset');
  });
 }
}
test('landing at the other airport transfers active field for taxi and re-departure',()=>{
 const {ops,core}=create(),s=core.startApproach('trainer','KBFI');
 const dest=ops.select('KSEA'),p=ops.approach();
 ops.select('KBFI');
 Object.assign(s,p,{airport:'KBFI',pitch:-.095,path:-.055,bank:0});
 stepUntil(core,s,'ON_GROUND',3500,()=>({pitch:0}));
 assert.equal(s.condition,'ON_GROUND');
 assert.equal(s.airport,'KSEA');
 assert.equal(ops.field.code,'KSEA');
 assert.ok(s.events.some(e=>e.kind==='landing'&&e.airport==='KSEA'));
});
test('a failed landing away from both source runways does not earn landing credit',()=>{
 const {core}=create(),s=core.startApproach('trainer','KBFI');
 s.x=10000;s.z=-12000;s.y=core.groundHeight(s.x,s.z)-15;s.path=-.07;
 core.step(s,{pitch:0},.05);
 assert.equal(s.condition,'GROUND_CONTACT');
 assert.ok(!s.events.some(e=>e.kind==='landing'));
});
test('airport selector, live interairport navigation and mobile controls are present',()=>{
 for(const id of ['beginRunway','beginApproach','runwayReset','approachReset','mobileBrake','airportSelect','airportSide'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/const dest=ops\.fields\.find\(f=>f\.code!==origin\.code\)/);
 assert.match(html,/FLY TO /);
 assert.match(html,/brake:has\('b'\)\|\|t\('brake'\)/);
 assert.match(html,/function flightSchool\(kind\)/);
 assert.match(html,/function runwayVisuals\(/);
 assert.match(html,/function forRunwayQuads\(emit\)/);
 assert.match(html,/function addRunwaySoftware\(/);
 assert.match(html,/function addRunwayWebGL\(/);
 assert.match(html,/addRunwaySoftware\(quad,project,ctx,w,h\)/);
 assert.match(html,/addRunwayWebGL\(w\)/);
 assert.match(html,/South Seattle terrain corridor/);
 assert.match(html,/id="aaar-sky-passport-model"/);
 assert.doesNotMatch(html,/cdn\.jsdelivr\.net|unpkg\.com|threejs\.org/);
});
