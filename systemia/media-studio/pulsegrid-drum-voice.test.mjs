import test from 'node:test';
import assert from 'node:assert/strict';
import {schedulePulseGridDrumVoice as perform} from './pulsegrid-drum-voice.mjs';
function rig(){
 const calls=[],param=name=>({
  setValueAtTime(v,t){calls.push([name,'set',v,t])},
  exponentialRampToValueAtTime(v,t){calls.push([name,'exp',v,t])}
 });
 const node=name=>({
  name,gain:param(name+'.gain'),frequency:param(name+'.frequency'),
  type:'',buffer:null,
  connect(other){calls.push([name,'connect',other?.name]);return other},
  start(t){calls.push([name,'start',t])},stop(t){calls.push([name,'stop',t])}
 });
 const dest=node('dest');
 const context={
  createGain:()=>node('gain'),createBiquadFilter:()=>node('filter')
 };
 return {calls,context,dest,node};
}
test('shared kick retains original pitch glide, sine waveform, gain release and stop',()=>{
 const f=rig(),r=perform({
  context:f.context,destination:f.dest,kind:'kick',time:.1,velocity:.8,
  createOscillator:()=>f.node('kick')
 });
 assert.equal(r.kind,'kick');
 assert.equal(r.noiseBuffer,null);
 assert.ok(Math.abs(r.stop_time-.34)<1e-9);
 assert.ok(f.calls.some(x=>x[0]==='kick.frequency'&&x[1]==='set'&&x[2]===135));
 assert.ok(f.calls.some(x=>x[0]==='kick.frequency'&&x[1]==='exp'&&x[2]===46));
 assert.ok(f.calls.some(x=>x[0]==='gain.gain'&&x[1]==='exp'&&x[2]===.001));
});
test('shared hi-hat reuses exact original performed noiseBuffer and high-pass',()=>{
 const f=rig(),noise={duration:.09,getChannelData:()=>new Float32Array(4320)};
 const source=f.node('hat');
 const r=perform({context:f.context,destination:f.dest,kind:'hat',
  time:.2,velocity:.5,noiseBuffer:noise,createBufferSource:()=>source});
 assert.equal(r.noiseBuffer,noise);
 assert.equal(source.buffer,noise);
 assert.ok(f.calls.some(x=>x[0]==='hat'&&x[1]==='start'));
 assert.ok(f.calls.some(x=>x[0]==='hat'&&x[1]==='stop'));
});
test('bad probabilities, missing hat sample and invalid timing allocate no sources',()=>{
 const f=rig();let nodes=0;
 for(const changes of [
  {time:-1},{velocity:0},{velocity:2},{kind:'other'},
  {kind:'hat',noiseBuffer:null},{kind:'hat',noiseBuffer:{duration:NaN}}
 ]){
  assert.throws(()=>perform({
   context:f.context,destination:f.dest,kind:'kick',time:0,velocity:.8,
   createOscillator:()=>{nodes++;return f.node('kick')},
   createBufferSource:()=>{nodes++;return f.node('hat')},
   ...changes,
  }),/Invalid PulseGrid drum/);
 }
 assert.equal(nodes,0);
});
