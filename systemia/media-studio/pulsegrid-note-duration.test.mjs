import test from 'node:test';
import assert from 'node:assert/strict';
import {pulseGridNoteDurationSeconds as seconds} from './pulsegrid-note-duration.mjs';

test('straight 16th note and whole-bar durations are exact at 120 BPM',()=>{
 assert.equal(seconds({bpm:120,start_step:0,length_steps:1}),.125);
 assert.equal(seconds({bpm:120,start_step:0,length_steps:16}),2);
});
test('swing pairs preserve complete musical note lengths without doubling',()=>{
 const two=seconds({bpm:120,swing:60,start_step:0,length_steps:2});
 const odd=seconds({bpm:120,swing:60,start_step:1,length_steps:2});
 assert.ok(Math.abs(two-.25)<1e-12);
 assert.ok(Math.abs(odd-.25)<1e-12);
});
test('a single even step is longer and a single odd step shorter with swing',()=>{
 const first=seconds({bpm:120,swing:60,start_step:0,length_steps:1});
 const second=seconds({bpm:120,swing:60,start_step:1,length_steps:1});
 assert.ok(first>.125&&second<.125);
 assert.ok(Math.abs(first+second-.25)<1e-12);
});
test('fractional MIDI note length uses the actual next swung step proportion',()=>{
 const full=seconds({bpm:100,swing:40,start_step:0,length_steps:1});
 const half=seconds({bpm:100,swing:40,start_step:1,length_steps:.5});
 assert.ok(Math.abs(seconds({bpm:100,swing:40,start_step:0,length_steps:1.5})-(full+half))<1e-12);
});
test('invalid timing cannot silently schedule negative or implausibly long notes',()=>{
 for(const args of [
  {bpm:0,start_step:0,length_steps:1},
  {bpm:120,swing:-1,start_step:0,length_steps:1},
  {bpm:120,start_step:-1,length_steps:1},
  {bpm:120,start_step:0,length_steps:0},
  {bpm:120,start_step:0,length_steps:1000},
 ])assert.throws(()=>seconds(args),/Invalid PulseGrid/);
});
