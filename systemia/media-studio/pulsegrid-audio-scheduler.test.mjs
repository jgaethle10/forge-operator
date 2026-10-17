import test from 'node:test';
import assert from 'node:assert/strict';
import {schedulePulseGridAudioBuffer} from './pulsegrid-audio-scheduler.mjs';
const sink={};
function harness(bufferSeconds=1.1){
  const calls=[];
  const createSource=()=>{
    const source={
      buffer:null,loop:false,loopEnd:0,
      connect(target){calls.push(['connect',target]);},
      start(...args){calls.push(['start',...args]);},
      stop(...args){calls.push(['stop',...args]);},
    };
    return source;
  };
  return {calls,createSource,buffer:{duration:bufferSeconds},destination:sink};
}
test('one-shot piano attack and release plays once even when scene duration is longer',()=>{
  const h=harness(.91);
  const r=schedulePulseGridAudioBuffer({...h,time:0.25,duration:2,mode:'one_shot'});
  assert.deepEqual(h.calls.filter(x=>x[0]==='start'),[['start',.25,0,.91]]);
  assert.equal(h.calls.filter(x=>x[0]==='stop').length,0);
  assert.equal(r.looped,false);
  assert.equal(r.scheduled_duration_sec,.91);
});
test('short ordinary drum/audio loop repeats to scene duration, preserving old behavior',()=>{
  const h=harness(.91);
  const r=schedulePulseGridAudioBuffer({...h,time:1.5,duration:2,mode:'loop'});
  assert.deepEqual(h.calls.filter(x=>x[0]==='start'),[['start',1.5]]);
  assert.deepEqual(h.calls.filter(x=>x[0]==='stop'),[['stop',3.5]]);
  assert.equal(r.looped,true);
});
test('one-shot 2s sample in 1.5s scene never spills into next scene',()=>{
  const h=harness(2);
  const r=schedulePulseGridAudioBuffer({...h,time:0,duration:1.5,mode:'one_shot'});
  assert.deepEqual(h.calls.filter(x=>x[0]==='start'),[['start',0,0,1.5]]);
  assert.equal(r.scheduled_duration_sec,1.5);
});
test('default mode retains preexisting audio loop semantics',()=>{
  const h=harness(.25);
  assert.equal(schedulePulseGridAudioBuffer({...h,time:1,duration:2}).looped,true);
});
test('invalid modes and invalid timing fail closed before creating a source',()=>{
  const h=harness();
  assert.throws(()=>schedulePulseGridAudioBuffer({...h,time:0,duration:2,mode:'repeat_forever'}),/Invalid audio playback mode/);
  assert.throws(()=>schedulePulseGridAudioBuffer({...h,time:0,duration:0,mode:'one_shot'}),/Invalid PulseGrid audio schedule/);
  assert.throws(()=>schedulePulseGridAudioBuffer({...h,time:Infinity,duration:1}),/Invalid PulseGrid audio schedule/);
  assert.equal(h.calls.length,0);
});
test('invalid decoded buffer never schedules false playback',()=>{
  const h=harness(0);
  assert.throws(()=>schedulePulseGridAudioBuffer({...h,time:0,duration:1}),/Valid decoded audio buffer/);
  assert.equal(h.calls.length,0);
});
