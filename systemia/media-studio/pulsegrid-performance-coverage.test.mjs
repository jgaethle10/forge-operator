import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectPulseGridPerformedStepCoverage as inspect} from './pulsegrid-performance-coverage.mjs';

const straight=(count=64,start=.1)=>Array.from({length:count},(_,i)=>({
 step:i%16,loop_steps:16,time:start+i*.125,duration:.125,
}));
test('64 sequential scheduled steps over four bars prove a contiguous eight-second scheduled horizon',()=>{
 const events=straight();
 const proof=inspect({events,origin:.1,window_sec:8});
 assert.equal(proof.status,'verified_scheduled_step_contiguity');
 assert.equal(proof.performance_coverage_sec,8);
 assert.equal(proof.performance_window_complete,true);
 assert.equal(proof.performed_step_count,64);
 assert.equal(proof.performance_gap_count,0);
 assert.equal(proof.evidence,'observed_scheduled_steps_only');
});
test('a missing middle step is detected even if first/last timestamps span eight seconds',()=>{
 const events=straight().filter((_,i)=>i!==20);
 const proof=inspect({events,origin:.1,window_sec:8});
 assert.equal(proof.status,'verified_scheduled_step_contiguity');
 assert.equal(proof.performance_window_complete,false);
 assert.equal(proof.performance_coverage_sec,2.5);
 assert.equal(proof.first_gap_at_sec,2.5);
 assert.equal(proof.performance_gap_count,1);
});
test('repeating the wrong clip step does not masquerade as an uninterrupted multi-bar performance',()=>{
 const events=straight();events[16]={...events[16],step:0};
 events[17]={...events[17],step:0}; // sequential step should be 1
 const proof=inspect({events,origin:.1,window_sec:8});
 assert.equal(proof.performance_window_complete,false);
 assert.equal(proof.first_gap_at_sec,2.125);
});
test('swing changes step durations but valid sequence still proves real scheduling continuity',()=>{
 const events=[];let time=.2;
 for(let i=0;i<64;i++){
  const duration=i%2===0?.15:.1;
  events.push({time,duration,step:i%16,loop_steps:16});
  time+=duration;
 }
 const r=inspect({events,origin:.2,window_sec:8});
 assert.equal(r.performance_window_complete,true);
 assert.equal(r.performance_coverage_sec,8);
});
test('origin in middle of real transport interval counts only remaining interval as audited coverage',()=>{
 const events=straight(10);
 const proof=inspect({events,origin:.15,window_sec:.8});
 assert.equal(proof.performance_window_complete,true);
 assert.equal(proof.performance_coverage_sec,.8);
});
test('out-of-order, duplicate, malformed and missing transport receipts never become complete',()=>{
 const valid=straight(7);
 for(const events of [
  [],[...valid,valid[6]],valid.map((e,i)=>i===1?{...e,step:99}:e),
  valid.map((e,i)=>i===2?{...e,time:-5}:e),
  valid.map((e,i)=>i===2?{...e,duration:NaN}:e),
  Array.from({length:1025},(_,i)=>({step:i%16,loop_steps:16,time:i*.125,duration:.125})),
 ]){
  const result=inspect({events,origin:.1,window_sec:.8});
  assert.equal(result.status,'unavailable');
  assert.equal(result.performance_window_complete,false);
 }
 assert.equal(inspect({events:straight(),origin:.1,window_sec:20}).status,'unavailable');
});
