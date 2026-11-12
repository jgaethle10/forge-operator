import test from 'node:test';
import assert from 'node:assert/strict';
import {initialHazardLatch,reactiveCommandLatched} from './controller-rc05-latched-watch.mjs';
const base={estimate:{x:1,z:0,heading:0},goal:{x:10,z:0},bounds:{xmin:-.7,xmax:10.8,ymin:-2.8,ymax:2.8},
 scan:[],scanAgeSec:0,velocity:{x:0,z:0},uncertainty:.055,delaySeconds:.4,
 braking:.5,robotRadius:.22,maxSpeed:.82,state:{preferredTurn:0},tracks:[]};
const crossing={x:2,z:0,radius:.3,vx:-.35,vz:0,observedSpeed:.35};
test('risk from tracked moving obstacle sets persistent hold with modeled queue cancellation',()=>{
 const r=reactiveCommandLatched({...base,tracks:[{...crossing,x:.8}]},{pendingCommands:[{x:.7,z:0}]});
 assert.equal(r.latch.active,true);assert.equal(r.cancelPending,true);
 assert.equal(r.decision.reason,'latched_hazard_hold');assert.deepEqual(r.decision.velocity,{x:0,z:0});
 assert.equal(r.diagnostic.realEmergencyStop,false);
});
test('pending risky command can latch even when current request appears harmless',()=>{
 const r=reactiveCommandLatched({...base,tracks:[{...crossing,x:1.7}]},
   {pendingCommands:[{x:.8,z:0}]});
 assert.equal(r.latch.active,true);assert.equal(r.cancelPending,true);
});
test('one clear frame cannot release prior hazard; five clear frames and elapsed time required',()=>{
 let state={active:true,clearStreak:0,ageTicks:1,recoveryTicks:0};
 for(let i=0;i<4;i++){const r=reactiveCommandLatched(base,{latch:state});
   assert.equal(r.latch.active,true);assert.equal(r.cancelPending,true);state=r.latch;}
 const r=reactiveCommandLatched(base,{latch:state});
 assert.equal(r.latch.active,false);assert.equal(r.diagnostic.phase,'release');
 assert.ok(Math.hypot(r.decision.velocity.x,r.decision.velocity.z)<=.24+1e-8);
});
test('sensor dropout never releases latch',()=>{
 let r=reactiveCommandLatched({...base,scanAgeSec:Infinity},{latch:{active:true,clearStreak:3,ageTicks:10,recoveryTicks:0}});
 assert.equal(r.latch.active,true);assert.equal(r.latch.clearStreak,0);
 assert.equal(r.decision.reason,'latched_hazard_hold');
});
test('recovery speed is capped and ordinary hold preserved',()=>{
 const r=reactiveCommandLatched(base,{latch:{active:false,clearStreak:0,ageTicks:0,recoveryTicks:7}});
 assert.equal(r.diagnostic.phase,'recovery');assert.ok(Math.hypot(r.decision.velocity.x,r.decision.velocity.z)<=.24+1e-8);
 const stale=reactiveCommandLatched({...base,scanAgeSec:1});
 assert.equal(stale.decision.reason,'stale_sensor_hold');
});
test('malformed queued commands fail closed',()=>{
 assert.throws(()=>reactiveCommandLatched(base,{pendingCommands:[{x:Infinity,z:0}]}),/rc05e_invalid_latch_state/);
 assert.throws(()=>reactiveCommandLatched(base,{latch:{active:true,clearStreak:-1,ageTicks:1,recoveryTicks:0}}),/rc05e_invalid_latch_state/);
});
test('crossing from opposite side also triggers hazard latch',()=>{
 const r=reactiveCommandLatched({...base,tracks:[{x:1.5,z:.3,vx:0,vz:-.5,radius:.4,observedSpeed:.5}]});
 assert.equal(r.latch.active,true);
});