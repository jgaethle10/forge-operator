import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeFoundryDecodedPianoDryPeak as audit} from './instrument-foundry-dry-pcm.mjs';
const buffer=(value=1,channels=1,rate=48000,duration=.5)=>{
 const samples=Math.ceil(duration*rate),data=Array.from({length:channels},(_,c)=>
  Float32Array.from({length:samples},()=>Array.isArray(value)?value[c]:value));
 return {duration,sampleRate:rate,numberOfChannels:channels,getChannelData:c=>data[c]};
};
const voice=(b,start_time=0,stop_time=.3,voice_gain=.68,other={})=>({
 buffer:b,start_time,stop_time,voice_gain,release_start:stop_time-.05,
 attack_sec:.004,playback_rate:1,source_offset_sec:0,...other,
});
test('one real PCM note has peak below full scale despite a voice gain of .68',()=>{
 const r=audit({voices:[voice(buffer(1))]});
 assert.equal(r.status,'measured_offline_dry_approximation');
 assert.equal(r.sample_peak,.68);
 assert.equal(r.peak_dbfs,-3.35);
 assert.equal(r.over_full_scale_frames,0);
 assert.equal(r.complete,true);
 assert.equal(r.analyzed_voices,1);
});
test('two exact-phase decoded samples really exceed 0 dBFS before track effects',()=>{
 const b=buffer(1);
 const r=audit({voices:[voice(b),voice(b)]});
 assert.equal(r.sample_peak,1.36);
 assert.ok(r.over_full_scale_frames>1000);
 assert.ok(r.peak_dbfs>0);
 assert.match(r.limitations,/No track\/master\/effects/);
});
test('two opposite-polarity piano waves cancel even when gain-sum heuristic would warn',()=>{
 const r=audit({voices:[voice(buffer(1)),voice(buffer(-1))]});
 assert.equal(r.sample_peak,0);
 assert.equal(r.over_full_scale_frames,0);
 assert.equal(r.peak_dbfs,-180);
});
test('consecutive notes do not sum at an exact note-off/note-on boundary',()=>{
 const r=audit({voices:[
  voice(buffer(1),0,.15,.68,{release_start:.1}),
  voice(buffer(1),.15,.3,.68,{release_start:.25}),
 ]});
 assert.equal(r.sample_peak,.68);
 assert.equal(r.over_full_scale_frames,0);
});
test('real stereo channels are measured separately, not collapsed or double-counted',()=>{
 const r=audit({voices:[voice(buffer([1,-.25],2))]});
 assert.equal(r.sample_peak,.68);
 assert.equal(r.over_full_scale_frames,0);
});
test('buffer source offsets and semitone playback-rate are read, not ignored',()=>{
 const rate=48000;
 const b=buffer(0,1,rate,.5),pcm=b.getChannelData(0);
 for(let i=rate*.1;i<rate*.3;i++)pcm[i]=1;
 const r=audit({voices:[voice(b,0,.15,.68,{source_offset_sec:.1,playback_rate:1.1})]});
 assert.equal(r.sample_peak,.68);
 const dry=audit({voices:[voice(b,0,.08,.68,{source_offset_sec:0})]});
 assert.equal(dry.sample_peak,0);
});
test('later scheduled notes outside a short preview are marked incomplete not safe',()=>{
 const b=buffer(1,1,48000,2);
 const r=audit({voices:[
  voice(b,0,.2,.5,{release_start:.15}),
  voice(b,1,1.4,.5,{release_start:1.35}),
 ],window_sec:.8});
 assert.equal(r.complete,false);
 assert.equal(r.analyzed_voices,2);
 assert.equal(r.sample_peak,.5);
});
test('empty, unverified and unavailable PCM fail closed without a fabricated peak',()=>{
 for(const input of [
  {voices:[]},
  {voices:[voice({duration:.5,sampleRate:48000,numberOfChannels:1})]},
  {voices:[voice({duration:.5,sampleRate:48000,numberOfChannels:1,
   getChannelData(){throw Error('storage revoked')}})]},
  {voices:[voice(buffer(1,1,48000,.02))]},
  {voices:[voice(buffer(1),0,.2,.5,{release_start:.5})]},
  {voices:Array.from({length:17},()=>voice(buffer(1)))},
 ]){
  const result=audit(input);
  assert.equal(result.status,'unavailable',JSON.stringify(input.voices?.length));
  assert.equal(result.sample_peak,null);
  assert.equal(result.complete,false);
 }
});
test('nonfinite or out-of-range PCM rejects all results, never emits a clean-looking number',()=>{
 const b=buffer(.5);
 b.getChannelData(0)[4000]=NaN;
 assert.equal(audit({voices:[voice(b)]}).status,'unavailable');
 const x=buffer(.5);
 x.getChannelData(0)[4000]=2;
 assert.equal(audit({voices:[voice(x)]}).status,'unavailable');
});
