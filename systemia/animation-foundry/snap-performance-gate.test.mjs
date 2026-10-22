import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateSnapTrace as assess} from './snap-performance-gate.mjs';
const mk=(mode='good')=>{
 const samples=[];
 for(let i=0;i<=72;i++){
  const t=i/120;
  const d=t<.15?.052:t<.2?.052-(t-.15)*.76:t<.24?.014:t<.29?.014+(t-.24)*.78:.053;
  const wave=mode==='wave'?t*.9:0;
  const gap=mode==='wave'?.052:mode==='no-release'&&t>=.2?.012:d;
  const thumb=mode==='thumb-only'?.052-gap:0;
  const middle=mode==='thumb-only'?.052:gap;
  const y=mode==='thumb-only'||mode==='wave'||mode==='no-release'?0:t<.24?0:t<.29?-.036*((t-.24)/.05):-.036;
  samples.push({timeSec:t,thumbTip:[wave+thumb,0,0],
   middleTip:[wave+middle,y,0],wrist:[wave,0,-.13],palm:[wave,0,-.09]});
 }
 return {schema:'evercraft.animation.snap-trace.v1',sampleRateHz:120,samples,
    audio:{snapTimeSec:.26666667}};
};
test('synthetic finger contact and fast release is only kinematic candidate',()=>{
 const r=assess(mk());assert.equal(r.status,'KINEMATIC_CANDIDATE');assert.equal(r.creativeApproved,false);
});
test('whole arm wave fails finger-contact evidence',()=>{
 assert.ok(assess(mk('wave')).issues.includes('no_thumb_middle_contact'));
});
test('thumb closes but no finger release fails',()=>{
 assert.ok(assess(mk('no-release')).issues.includes('no_fast_finger_release'));
});
test('thumb-only opening is not a middle finger flick',()=>{
 assert.ok(assess(mk('thumb-only')).issues.includes('arm_wave_without_finger_flick'));
});
test('off-beat snap sound fails',()=>{const t=mk();t.audio.snapTimeSec=.5;assert.ok(assess(t).issues.includes('finger_sound_sync_off'))});
test('missing Foley event fails',()=>{const t=mk();delete t.audio;assert.ok(assess(t).issues.includes('snap_audio_event_missing'))});
test('missing 3D finger coordinate fails closed',()=>{const t=mk();delete t.samples[2].middleTip;assert.equal(assess(t).status,'HELD')});
test('nonmonotonic time fails',()=>{const t=mk();t.samples[4].timeSec=t.samples[3].timeSec;assert.ok(assess(t).issues.includes('invalid_sample_timing'))});
test('under-sampled animation held',()=>{const t=mk();t.sampleRateHz=24;assert.ok(assess(t).issues.includes('sampling_too_sparse'))});
test('unrecognized schema fails',()=>assert.equal(assess({}).status,'HELD'));
