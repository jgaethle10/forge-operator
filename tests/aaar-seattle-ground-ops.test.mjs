import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync('public/worlds/flight/index.html','utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const section=term=>{const code=scripts.find(s=>s.includes(term));assert.ok(code,'Missing script '+term);return code;};
function sim(hash='#seattle'){
 const context=vm.createContext({location:{hash},document:{documentElement:{classList:{toggle(){}}}}});
 context.window=context;
 vm.runInContext(section('evercraft.aaar.flight-ground-ops.v1'),context,{timeout:5000});
 vm.runInContext(section('const landmarkList=['),context,{timeout:5000});
 vm.runInContext(section('function startRunway('),context,{timeout:5000});
 return {core:context.AAARFlight,ops:context.AAARGroundOps,world:context.AAARSeattle};
}
const go=(core,state,controller,limit=2500)=>{
 for(let i=0;i<limit;i++){core.step(state,controller(i,state),.05);if(state.condition!=='FLYING'&&state.condition!=='ON_GROUND')return state;}
 return state;
};
test('all browser inline scripts parse (no invisible game-breaking SyntaxError)',()=>{
 assert.ok(scripts.length>=8);
 for(const [i,code] of scripts.entries())assert.doesNotThrow(()=>new vm.Script(code), 'inline script '+i);
});
test('Seattle field is explicitly synthetic, bounded, level, and outside GIS downtown footprints',()=>{
 const {core,ops,world}=sim();
 assert.equal(ops.world,'FICTIONAL_GAMEPLAY_AIRFIELD');
 assert.equal(ops.field.level,54);
 assert.equal(core.groundHeight(ops.field.x,ops.field.startZ),54);
 assert.equal(ops.inside(ops.field.x,ops.field.startZ),true);
 assert.equal(ops.inside(ops.field.x+200,ops.field.startZ),false);
 assert.ok(world.buildings.every(b=>Math.abs(b.x-ops.field.x)>ops.field.width/2+b.w/2));
});
for(const craft of ['trainer','glider','jet']){
 test(craft+': start stationary, taxi, rotate into actual flight without an external restart',()=>{
  const {core}=sim(),s=core.startRunway(craft);
  assert.equal(s.condition,'ON_GROUND');assert.equal(s.speed,0);
  for(let i=0;i<700;i++){
   core.step(s,{throttle:1,pitch:i>90?1:0,bank:0,rudder:0},.05);
   if(s.condition!=='ON_GROUND')break;
  }
  assert.equal(s.condition,'FLYING',JSON.stringify(s.events));
  assert.ok(s.speed>0);assert.ok(s.y>core.groundHeight(s.x,s.z)+4);
  assert.ok(s.events.some(e=>e.kind==='takeoff'||e.kind==='simulated_glider_tow_release'));
 });
 test(craft+': stable practice approach lands, brakes to stop, and permits another takeoff',()=>{
  const {core}=sim(),s=core.startApproach(craft);
  for(let i=0;i<2500;i++){core.step(s,{pitch:0,bank:0,rudder:0,throttle:0},.05);if(s.condition!=='FLYING')break;}
  assert.equal(s.condition,'ON_GROUND',JSON.stringify(s.events));
  assert.ok(s.events.some(e=>e.kind==='landing'));
  const landingZ=s.z;
  for(let i=0;i<650&&s.speed>.05;i++)core.step(s,{throttle:-1,brake:true},.05);
  assert.equal(s.condition,'ON_GROUND','braking must not taxi out of runway');
  assert.equal(s.speed,0);
  assert.ok(s.z>=landingZ);
  assert.ok(s.events.some(e=>e.kind==='landing'));
  // A returned visitor can take off without restarting the aircraft state.
  for(let i=0;i<900;i++){
   core.step(s,{throttle:1,pitch:i>90?1:0,bank:0,rudder:0},.05);
   if(s.condition!=='ON_GROUND')break;
  }
  assert.equal(s.condition,'FLYING',JSON.stringify(s.events));
 });
}
test('an unsafe touchdown or runway excursion cannot masquerade as a successful landing',()=>{
 const {core,ops}=sim();
 const s=core.startApproach('trainer');
 s.x=ops.field.x+ops.field.width*2;s.z=0;
 s.y=core.groundHeight(s.x,s.z)+3.5;s.pitch=-.04;s.path=-.06;
 core.step(s,{pitch:0},.05);
 assert.equal(s.condition,'GROUND_CONTACT');
 assert.ok(s.events.some(e=>e.kind==='ground_contact'));
});
test('runway and landing UI work on desktop and touch with original signed-in-free world',()=>{
 for(const id of ['beginRunway','beginApproach','runwayReset','approachReset','mobileBrake']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/brake:has\('b'\)\|\|t\('brake'\)/);
 assert.match(html,/function flightSchool\(kind\)/);
 assert.match(html,/function forRunwayQuads\(emit\)/);
 assert.match(html,/function addRunwaySoftware\(/);
 assert.match(html,/function addRunwayWebGL\(/);
 assert.match(html,/addRunwaySoftware\(quad,project,ctx,w,h\)/);
 assert.match(html,/addRunwayWebGL\(w\)/);
 assert.match(html,/FICTIONAL_GAMEPLAY_AIRFIELD/);
 assert.match(html,/id="aaar-sky-passport-model"/);
 assert.doesNotMatch(html,/cdn\.jsdelivr\.net|unpkg\.com|threejs\.org/);
});
