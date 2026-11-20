import test from 'node:test';
import assert from 'node:assert/strict';
import {SCHEMA,DEFAULT_FIELD,beginGroundExplorer,validateGroundExplorer,interactGroundExplorer,stepGroundExplorer,groundActions} from '../public/worlds/flight/ground-explore-core.mjs';

const stopped=()=>({condition:'ON_GROUND',x:1810,z:0,yaw:0,speed:0,craft:'trainer'});
const advance=(s,seconds,input)=>{for(let i=0;i<seconds*20;i++)stepGroundExplorer(s,input,.05);return s;};
const moveTo=(s,x,z)=>{
 for(let i=0;i<2500;i++){
  const dx=x-s.person.x,dz=z-s.person.z;
  if(Math.hypot(dx,dz)<2)break;
  s.person.yaw=Math.atan2(dx,dz);
  stepGroundExplorer(s,{forward:1,run:true},.05);
 }
 assert.ok(Math.hypot(x-s.person.x,z-s.person.z)<2,'pedestrian could not reach safe nearby point');
};
test('stopped landed aircraft is the sole authorization to exit',()=>{
 for(const changes of [{speed:3},{condition:'FLYING'},{x:3000},{z:4500},{speed:-2}]){
  assert.throws(()=>beginGroundExplorer({...stopped(),...changes}),/requires_stopped|outside_training/);
 }
 const s=beginGroundExplorer(stopped());assert.equal(s.schema,SCHEMA);
 assert.equal(s.mode,'aircraft');assert.equal(groundActions(s).primary,'Exit aircraft');
});
test('post-landing foot -> cart -> drive -> park -> foot -> board aircraft',()=>{
 const s=beginGroundExplorer(stopped());
 assert.equal(interactGroundExplorer(s).action,'exited_aircraft');
 assert.equal(s.mode,'foot');assert.equal(groundActions(s).primary,'Board aircraft');
 moveTo(s,s.cart.x-4,s.cart.z);
 assert.equal(groundActions(s).primary,'Enter cart');
 assert.equal(interactGroundExplorer(s).action,'entered_cart');
 assert.equal(s.mode,'cart');
 assert.equal(interactGroundExplorer(s).action,'exited_cart','must be able to exit when stopped');
 assert.equal(s.mode,'foot');
 assert.equal(interactGroundExplorer(s).action,'entered_cart');
 advance(s,5,{throttle:1});
 assert.ok(s.cart.speed>4,'buggy must actually accelerate');
 assert.equal(interactGroundExplorer(s).action,'stop_to_exit');
 advance(s,5,{brake:true});
 assert.equal(s.cart.speed,0,'buggy brakes to stop');
 assert.equal(interactGroundExplorer(s).action,'exited_cart');
 moveTo(s,s.plane.x+5,s.plane.z);
 assert.equal(interactGroundExplorer(s).action,'boarded_aircraft');
 assert.equal(s.mode,'aircraft');
 assert.ok(s.events.some(e=>e.kind==='cart_entered')&&s.events.some(e=>e.kind==='cart_exited')&&s.events.some(e=>e.kind==='aircraft_boarded'));
});
test('bounds and hangar footprints stop both walking and buggy driving',()=>{
 const s=beginGroundExplorer(stopped());interactGroundExplorer(s);
 s.person.x=DEFAULT_FIELD.x+180;s.person.z=-890;s.person.yaw=Math.PI/2;
 const before=s.person.x;
 advance(s,8,{forward:1});
 assert.ok(s.person.x<DEFAULT_FIELD.x+180+31,'cannot walk through hangar');
 s.mode='cart';s.person=null;s.cart.x=DEFAULT_FIELD.x+480;s.cart.z=0;s.cart.yaw=Math.PI/2;
 advance(s,10,{throttle:1});
 assert.ok(s.cart.x<=DEFAULT_FIELD.x+500,'cart cannot escape bounded playground');
 assert.equal(s.cart.speed,0,'barrier stops vehicle');
});
test('invalid state is rejected and simulation is data-only without persistence or network',()=>{
 const s=beginGroundExplorer(stopped());
 assert.equal(validateGroundExplorer(s),s);
 assert.throws(()=>validateGroundExplorer({...s,mode:'helicopter'}),/invalid_ground_explorer/);
 assert.throws(()=>validateGroundExplorer({...s,events:new Array(201).fill('x')}),/invalid_ground_explorer/);
 assert.equal(s.provenance,'SYNTHETIC_LOCAL_GAMEPLAY');
});
