import test from 'node:test';
import assert from 'node:assert/strict';
import {FoundryPianoPolyphonyLedger} from './instrument-foundry-polyphony.mjs';
const v=(track_id,start_time,stop_time,voice_gain=.4)=>({track_id,start_time,stop_time,voice_gain});
test('one recorded MIDI voice has no invented chord risk',()=>{
 const l=new FoundryPianoPolyphonyLedger();
 l.record(v('keys',0,1,.68));
 assert.deepEqual({...l.snapshot(),caution:undefined},{
  evidence:'scheduled_sampled_voices_not_measured_audio',observed_voices:1,
  excluded_voices:0,max_simultaneous_voices:1,peak_summed_voice_gain:.68,
  review_gain_summation:false,observation_complete:true,caution:undefined
 });
});
test('simultaneous sampled notes accumulate conservative, NOT measured, headroom proxy',()=>{
 const l=new FoundryPianoPolyphonyLedger();
 l.record(v('keys',.05,1,.68));
 l.record(v('keys',.05,.7,.68));
 l.record(v('keys',.05,.3,.55));
 const s=l.snapshot();
 assert.equal(s.max_simultaneous_voices,3);
 assert.equal(s.peak_summed_voice_gain,1.91);
 assert.equal(s.review_gain_summation,true);
 assert.match(s.caution,/Does not measure PCM peak/);
});
test('note-on at the exact note-off boundary does not fake polyphony',()=>{
 const l=new FoundryPianoPolyphonyLedger();
 l.record(v('keys',0,.25,.68));
 l.record(v('keys',.25,.5,.68));
 assert.equal(l.snapshot().max_simultaneous_voices,1);
});
test('out of order and overlapping tails are computed by real scheduled times',()=>{
 const l=new FoundryPianoPolyphonyLedger();
 l.record(v('keys',2,3,.3));l.record(v('keys',0,2.5,.5));
 l.record(v('other',2.1,2.8,.3));
 assert.equal(l.snapshot().max_simultaneous_voices,3);
 assert.equal(l.snapshot().peak_summed_voice_gain,1.1);
});
test('truncated observations never claim to be complete or safe',()=>{
 const l=new FoundryPianoPolyphonyLedger(2);
 l.record(v('keys',0,1,.3));l.record(v('keys',0,1,.3));l.record(v('keys',0,1,.8));
 const s=l.snapshot();
 assert.equal(s.observed_voices,2);assert.equal(s.excluded_voices,1);
 assert.equal(s.observation_complete,false);
 assert.equal(s.review_gain_summation,false);
});
test('snapshot is repeatable and reset clears old playback evidence',()=>{
 const l=new FoundryPianoPolyphonyLedger();
 l.record(v('keys',0,1,.6));
 assert.equal(l.snapshot(),l.snapshot());
 l.reset();
 const s=l.snapshot();
 assert.equal(s.observed_voices,0);assert.equal(s.peak_summed_voice_gain,0);
 assert.equal(s.observation_complete,true);
});
test('malformed voice schedules fail before being counted',()=>{
 const l=new FoundryPianoPolyphonyLedger();
 for(const x of [v('keys',-1,1),v('',0,1),v('keys',1,1),v('keys',0,NaN),
  v('keys',0,1,Infinity),v('keys',0,1,1.3)]){
  assert.throws(()=>l.record(x),/Invalid Foundry/);
 }
 assert.equal(l.snapshot().observed_voices,0);
 assert.throws(()=>new FoundryPianoPolyphonyLedger(0),/Invalid/);
});
