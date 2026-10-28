import test from 'node:test';
import assert from 'node:assert/strict';
import {FOUNDRY_REVIEW_BUDGET as budget,validateFoundryReviewSourceCounts as check} from './instrument-foundry-review-budget.mjs';
test('a genuine four-bar dense performed mix fits bounded Web Audio source budget',()=>{
 const result=check({piano_voices:32,synth_voices:32,drum_hits:64,imported_audio_beds:1});
 assert.equal(result.valid,true);
 assert.equal(result.source_count,129);
 assert.equal(budget.render_seconds,8);
 assert.equal(budget.sample_rate,48000);
});
test('each individual audio source family has a positive hard limit',()=>{
 for(const [field,max] of [
  ['piano_voices',64],['synth_voices',64],['drum_hits',96],['imported_audio_beds',4]
 ]){
  assert.equal(check({[field]:max}).valid,true);
  const failed=check({[field]:max+1});
  assert.equal(failed.valid,false);
  assert.equal(failed.limit,max);
 }
});
test('combined-graph source budget rejects otherwise legal individual families',()=>{
 const r=check({piano_voices:64,synth_voices:64,drum_hits:96,imported_audio_beds:4});
 assert.equal(r.valid,false);
 assert.equal(r.limit,224);
});
test('negative, NaN, noninteger and infinite source counts fail closed',()=>{
 for(const n of [-1,.5,NaN,Infinity]){
  assert.equal(check({piano_voices:n}).valid,false);
 }
});
