import test from 'node:test';
import assert from 'node:assert/strict';
import {planPulseGridBusAutomation as plan} from './pulsegrid-bus-automation.mjs';
const track={id:'keys',volume:.8,filterHz:12000};
const e=(time,autoVolume=1,autoFilter=1)=>({
 track_id:'keys',time,autoVolume,autoFilter,trackVolume:.8,trackFilterHz:12000
});
test('actual scheduled volume/filter automation is replayed at original step times without interpolation',()=>{
 const result=plan({tracks:[track],events:[e(10,.8,.5),e(10.25,.4,.25),e(10.5,.9,.8)],
  origin:10,window_sec:.8});
 assert.equal(result.recorded_events_in_window,3);
 assert.equal(result.evidence,'original_scheduled_track_step_automation');
 assert.deepEqual(result.automation_events.filter(x=>!x.initial).map(x=>x.relative_time),[0,.25,.5]);
 assert.deepEqual(result.automation_events.filter(x=>!x.initial).map(x=>x.volume),[.64,.32,.72]);
 assert.deepEqual(result.automation_events.filter(x=>!x.initial).map(x=>x.frequency_hz),[6000,3000,9600]);
});
test('past automation initializes the earliest performed note; future events are excluded, never invented',()=>{
 const r=plan({tracks:[track],events:[e(9,.5,.4),e(10.3,.7,.2),e(11,.9,.9)],
  origin:10,window_sec:.8});
 assert.equal(r.automation_events[0].relative_time,0);
 assert.equal(r.automation_events[0].volume,.4);
 assert.equal(r.recorded_events_in_window,1);
 assert.equal(r.later_recorded_events_excluded,1);
});
test('missing tracks, changed base volume and malformed measurements fail closed',()=>{
 const base={tracks:[track],events:[e(0)],origin:0,window_sec:8};
 for(const patch of [
  {events:[]},{events:[{...e(0),autoVolume:Infinity}]},
  {events:[{...e(0),track_id:'forged'}]},
  {events:[{...e(0),trackVolume:.5}]},
  {tracks:[track,{...track,id:'bass'}]},
  {events:Array.from({length:1025},(_,i)=>e(i*.01))},
  {window_sec:9},
 ]){
  assert.throws(()=>plan({...base,...patch}),/Invalid|Missing|changed/);
 }
});
