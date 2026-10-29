import test from 'node:test';
import assert from 'node:assert/strict';
import {schedulePulseGridSynthVoice as schedule} from './pulsegrid-synth-voice.mjs';

function fixture(){
 const calls=[],param=name=>({
   setValueAtTime(...a){calls.push([name,'set',...a])},
   exponentialRampToValueAtTime(...a){calls.push([name,'exp',...a])},
   setTargetAtTime(...a){calls.push([name,'target',...a])}
 });
 const destination={};
 const source={
   frequency:{value:0},type:'',connect:node=>{calls.push(['source','connect']);return node},
   start:t=>calls.push(['start',t]),stop:t=>calls.push(['stop',t])
 };
 const gain={gain:param('gain'),connect:()=>{calls.push(['gain','connect']);return destination}};
 let sources=0,gains=0;
 const context={createGain:()=>{gains++;return gain}};
 const createSource=()=>{sources++;return source};
 return {calls,source,context,createSource,destination,counts:()=>({sources,gains})};
}
test('synth scheduler preserves 440Hz piano-register triangle plus authored attack/release',()=>{
 const f=fixture();
 const r=schedule({context:f.context,createSource:f.createSource,
  destination:f.destination,track_id:'keys',pitch:69,velocity:.8,time:.3,duration:.5});
 assert.equal(r.waveform,'triangle');
 assert.equal(r.frequency_hz,440);
 assert.equal(r.stop_time,.92);
 assert.deepEqual(f.calls.filter(x=>x[0]==='gain'&&x[1]!=='connect'),[
  ['gain','set',.0001,.3],
  ['gain','exp',.144,.308],
  ['gain','target',.0001,.74,.03]
 ]);
 assert.deepEqual(f.calls.at(-1),['stop',.92]);
});
test('bass and bell preserve original recorded design oscillators and pitch frequencies',()=>{
 for(const [track,waveform] of [['bass','sawtooth'],['bell','sine'],['lead','triangle']]){
  const f=fixture(),r=schedule({context:f.context,destination:f.destination,
   createSource:f.createSource,track_id:track,pitch:60,velocity:.5,time:0,duration:.1});
  assert.equal(r.waveform,waveform);
  assert.ok(Math.abs(r.frequency_hz-261.625565)<.0001);
  assert.equal(f.source.type,waveform);
  assert.equal(f.counts().sources,1);
 }
});
test('invalid oscillator receipts fail closed before node allocation',()=>{
 const f=fixture(),valid={context:f.context,destination:f.destination,
  createSource:f.createSource,track_id:'keys',pitch:60,velocity:.6,time:0,duration:.3};
 for(const change of [{pitch:-1},{pitch:128},{velocity:0},{time:-1},
   {duration:0},{duration:35},{track_id:''},{createSource:null}]){
  assert.throws(()=>schedule({...valid,...change}),/Invalid PulseGrid synth/);
 }
 assert.deepEqual(f.counts(),{sources:0,gains:0});
});
