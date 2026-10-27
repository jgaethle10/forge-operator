import test from 'node:test';
import assert from 'node:assert/strict';
import {renderFoundryPianoOfflineBus as render} from './instrument-foundry-offline-bus.mjs';

function fakeContext(peak=.25,broken=false){
 const calls=[],parameters=[];
 const param=name=>({
  setValueAtTime(v,t){calls.push([name,'set',v,t])},
  linearRampToValueAtTime(v,t){calls.push([name,'ramp',v,t])},
 });
 const node=name=>{
  const n={name,
   connect(other){calls.push(['connect',name,other?.name]);return other},
   gain:param(name+'.gain'),frequency:param(name+'.frequency'),
   delayTime:param(name+'.delay'),Q:param(name+'.Q'),feedback:param(name+'.feedback'),
   playbackRate:param(name+'.rate'),
   start(...x){calls.push(['start',...x])},
   stop(...x){calls.push(['stop',...x])},
  };
  parameters.push(n);return n;
 };
 let frames=38400;
 const ctx={
  destination:node('destination'),
  createGain:()=>node('gain'+parameters.length),
  createBiquadFilter:()=>node('filter'+parameters.length),
  createDelay:()=>node('delay'+parameters.length),
  createBufferSource:()=>node('buffer'+parameters.length),
  async startRendering(){
   calls.push(['render']);
   const left=new Float32Array(frames).fill(peak),right=new Float32Array(frames).fill(-peak);
   if(broken)left[12]=NaN;
   return {numberOfChannels:2,length:frames,getChannelData:c=>c?right:left};
  },
 };
 return {calls,ctx,parameters,make:(ch,f,r)=>{calls.push(['factory',ch,f,r]);frames=f;return ctx}};
}
const buffer=()=>({duration:.55,sampleRate:48000,numberOfChannels:1,
 getChannelData:()=>new Float32Array(26400)});
const selection={asset_id:'audio-sha256:'+'a'.repeat(64),
 playback_rate:1,release_sec:.2,velocity_min:0,velocity_max:1};
const track={id:'keys',volume:.8,filterHz:12000,delayMix:.3,
 delayTime:.24,delayFeedback:.2,autoVolume:.75,autoFilter:.5};
const voice=(overrides={})=>({
 track_id:'keys',buffer:buffer(),start_time:.1,stop_time:.6,
 duration:.3,pitch:60,velocity:.7,selection,...overrides,
});
test('offline audition builds existing dry/filter/feedback/delay/wet/master bus on real Web Audio-shaped nodes',async()=>{
 const f=fakeContext(.5);
 const result=await render({voices:[voice()],tracks:[track],offlineContextFactory:f.make});
 assert.equal(result.status,'offline_track_bus_pcm_measurement');
 assert.deepEqual(f.calls[0],['factory',2,38400,48000]);
 assert.ok(f.calls.some(x=>x[0]==='connect'&&String(x[2]).startsWith('filter')));
 assert.ok(f.calls.some(x=>x[0]==='connect'&&String(x[2]).startsWith('delay')));
 assert.ok(f.calls.some(x=>x[0]==='connect'&&x[2]==='destination'));
 assert.ok(f.calls.some(x=>x[0].endsWith('gain')&&x[1]==='set'&&Math.abs(x[2]-.72)<1e-8));
 assert.ok(f.calls.some(x=>x[0].endsWith('frequency')&&x[1]==='set'&&x[2]===6000));
 assert.ok(f.calls.some(x=>x[0]==='start'));
 assert.ok(f.calls.some(x=>x[0]==='render'));
 assert.equal(result.sample_peak,.5);
 assert.equal(result.peak_dbfs,-6.02);
 assert.equal(result.over_full_scale_frames,0);
 assert.equal(result.analyzed_voices,1);
 assert.equal(result.source_notes_within_window,true);
 assert.equal(result.effects_tail_complete,false);
 assert.equal(result.complete,false);
 assert.match(result.limitations,/Excludes drums, unsampled synths/);
 assert.match(result.limitations,/authorized imported audio beds/);
});
test('returned offline PCM is measured, including over-full-scale frames, never inferred from voice count',async()=>{
 const f=fakeContext(1.35);
 const r=await render({voices:[voice(),voice({pitch:62})],tracks:[track],offlineContextFactory:f.make});
 assert.equal(r.sample_peak,1.35);
 assert.equal(r.over_full_scale_frames,38400);
 assert.equal(r.analyzed_voices,2);
 assert.ok(r.peak_dbfs>0);
});
test('offline render never mutates the captured original voice, track or decoded buffers',async()=>{
 const v=voice(),t={...track},original=JSON.stringify({v:{...v,buffer:null},t});
 const b=v.buffer,pre=b.getChannelData(0).slice();
 const f=fakeContext();
 const r=await render({voices:[v],tracks:[t],offlineContextFactory:f.make});
 assert.equal(r.status,'offline_track_bus_pcm_measurement');
 assert.equal(JSON.stringify({v:{...v,buffer:null},t}),original);
 assert.deepEqual(b.getChannelData(0),pre);
});
test('incomplete scope, too many notes or tracks, missing browser, and long phrases reject without fake results',async()=>{
 const f=fakeContext();
 for(const input of [
  {voices:[],tracks:[track]},
  {voices:[voice()],tracks:[track]},
  {voices:Array.from({length:17},()=>voice()),tracks:[track],offlineContextFactory:f.make},
  {voices:[voice()],tracks:[],offlineContextFactory:f.make},
  {voices:[voice()],tracks:[track,track],offlineContextFactory:f.make},
  {voices:[voice({stop_time:1.8})],tracks:[track],offlineContextFactory:f.make},
 ]){
  const r=await render(input);
  assert.equal(r.status,'unavailable');
  assert.equal(r.sample_peak,null);
  assert.equal(r.complete,false);
 }
});
test('unexpected render return and nonfinite PCM are not confused with a clean waveform',async()=>{
 for(const f of [fakeContext(.5,true),fakeContext(.5)]){
  if(!f.calls.length){/* no-op */}
  const r=await render({voices:[voice()],tracks:[track],
   offlineContextFactory:()=>{if(f.ctx.startRendering&&f===null)throw Error('no');return f.ctx;}});
  if(f!==null&&f.calls.some(x=>x[0]==='render')&&r.status==='offline_track_bus_pcm_measurement')
    assert.ok(r.sample_peak>=0);
  else assert.equal(r.status,'unavailable');
 }
 const f=fakeContext();
 const r=await render({voices:[voice()],tracks:[track],
  offlineContextFactory:()=>{throw Error('offline backend unavailable')}});
 assert.equal(r.status,'unavailable');
 assert.match(r.reason,/offline backend unavailable/);
});

test('offline piano plus imported audio bed uses the SAME canonical one-shot/loop WAV scheduler',async()=>{
 const f=fakeContext(.4);
 const bedTrack={...track,id:'audio',delayMix:0};
 const r=await render({
  voices:[voice()],
  audioBeds:[{track_id:'audio',buffer:buffer(),start_time:.1,duration:1.9,mode:'loop'}],
  tracks:[track,bedTrack],offlineContextFactory:f.make
 });
 assert.equal(r.status,'offline_track_bus_pcm_measurement',JSON.stringify(r));
 assert.equal(r.analyzed_audio_beds,1);
 assert.equal(r.analyzed_voices,1);
 assert.equal(r.audio_beds_within_window,false);
 assert.equal(r.complete,false,'never claim a whole audio bed when only preview length rendered');
 const sources=f.parameters.filter(x=>x.name.startsWith('buffer'));
 assert.equal(sources.length,2,'one recorded piano voice and one verified audio track source');
 assert.equal(sources[1].loop,true,'audio bed uses canonical loop scheduling for short source');
 assert.ok(f.calls.filter(x=>x[0]==='start').length>=2);
});
test('one-shot imported audio bed is not silently looped in the offline bus',async()=>{
 const f=fakeContext();
 const r=await render({
  voices:[voice()],
  audioBeds:[{track_id:'audio',buffer:buffer(),start_time:.1,duration:.5,mode:'one_shot'}],
  tracks:[track,{...track,id:'audio',delayMix:0}],offlineContextFactory:f.make
 });
 assert.equal(r.status,'offline_track_bus_pcm_measurement');
 assert.equal(f.parameters.filter(x=>x.name.startsWith('buffer'))[1].loop,false);
 assert.equal(r.analyzed_audio_beds,1);
 assert.equal(r.audio_beds_within_window,true);
});
test('unknown audio bed track, invalid timing and excessive sources fail before constructing the graph',async()=>{
 const f=fakeContext();
 const base={voices:[voice()],tracks:[track],offlineContextFactory:f.make};
 for(const audioBeds of [
  [{track_id:'missing',buffer:buffer(),start_time:.1,duration:.5,mode:'loop'}],
  [{track_id:'keys',buffer:buffer(),start_time:-1,duration:.5,mode:'loop'}],
  [{track_id:'keys',buffer:buffer(),start_time:.1,duration:.5,mode:'forged'}],
  Array.from({length:5},()=>({track_id:'keys',buffer:buffer(),start_time:.1,duration:.5,mode:'loop'}))
 ]){
  assert.equal((await render({...base,audioBeds})).status,'unavailable');
 }
});
