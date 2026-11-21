import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeFoundryPianoTailCoverage as audit,foundryPianoSampleTailBudget as budget}
  from './instrument-foundry-tail-audit.mjs';
import {createPulseGridSession,applyPulseGridTransaction} from './pulsegrid-session.ts';

const digest='b'.repeat(64),assetId='audio-sha256:'+digest;
function sessionWith({sampleSeconds=.25,release=.2,noteSteps=4,pedal=[],
  rights='unknown',bpm=120,swing=0}={}){
 const original=createPulseGridSession('audition tail budget');
 const audio={id:assetId,digest,kind:'audio',mime_type:'audio/wav',byte_length:48044,
   duration_sec:sampleSeconds,sample_rate:48000,channels:1,
   source_refs:['sha256:'+digest],source_state:'recording',rights,
   source_name:'METADATA-ONLY-NOT-REAL-PIANO',parent_asset_ids:[]};
 const patch={kind:'recorded_piano_v1',max_transpose_semitones:2,samples:[
  {asset_id:assetId,root_pitch:60,velocity_min:0,velocity_max:1,release_sec:release}
 ]};
 const operations=[
  {type:'asset.register_audio',asset:audio},
  {type:'note.add',track_id:'keys',scene:0,
   note:{pitch:60,start:0,length:noteSteps,velocity:.7}},
  {type:'clip.set_foundry_piano_patch',track_id:'keys',scene:0,patch},
  {type:'clip.set_foundry_piano_pedal',track_id:'keys',scene:0,events:pedal},
  {type:'transport.set_tempo',bpm},
  {type:'transport.set_swing',swing}
 ];
 return applyPulseGridTransaction(original,{intent:'technical duration audit',operations},'human').session;
}
test('sample key hold deficit is visible and not misreported as clean release',()=>{
 const b=budget({sample_duration_sec:.25,playback_rate:1,held_seconds:.5,release_sec:.2});
 assert.equal(b.classification,'key_hold_shortfall');
 assert.equal(b.key_hold_shortfall_seconds,.25);
 assert.equal(b.tail_shortfall_seconds,.45);
});
test('sample can hold keys but lose natural release tail',()=>{
 const b=budget({sample_duration_sec:.65,playback_rate:1,held_seconds:.5,release_sec:.2});
 assert.equal(b.classification,'release_tail_shortfall');
 assert.equal(b.key_hold_shortfall_seconds,0);
 assert.equal(b.tail_shortfall_seconds,.05);
});
test('long enough recorded metadata is sufficient only as metadata',()=>{
 const b=budget({sample_duration_sec:1,playback_rate:1,held_seconds:.5,release_sec:.2});
 assert.equal(b.classification,'sufficient_metadata_duration');
 assert.equal(b.tail_shortfall_seconds,0);
});
test('two-semitone transposition changes available duration, without pretending more audio',()=>{
 const up=budget({sample_duration_sec:1,playback_rate:Math.pow(2,2/12),
   held_seconds:.91,release_sec:.2});
 const down=budget({sample_duration_sec:1,playback_rate:Math.pow(2,-2/12),
   held_seconds:.91,release_sec:.2});
 assert.ok(up.available_seconds<1);
 assert.ok(down.available_seconds>1);
 assert.ok(up.tail_shortfall_seconds>down.tail_shortfall_seconds);
});
test('canonical score audit reveals key-off exhaustion with genuine note/asset references',()=>{
 const s=sessionWith({sampleSeconds:.25});
 const before=structuredClone(s);
 const r=audit(s,0);
 assert.equal(r.authored_notes,1);
 assert.equal(r.mapped_notes,1);
 assert.equal(r.key_hold_shortfalls,1);
 assert.equal(r.total_findings,1);
 assert.equal(r.findings[0].kind,'key_hold_shortfall');
 assert.equal(r.findings[0].shortfall_seconds,.25);
 assert.equal(r.findings[0].asset_id,assetId);
 assert.equal(r.unknown_rights_note_uses,1);
 assert.equal(r.evidence,'canonical_asset_duration_metadata_only');
 assert.deepEqual(s,before,'technical audit is read-only');
});
test('pedal makes a score hold longer and exposes otherwise hidden sample shortage',()=>{
 const dry=sessionWith({sampleSeconds:.75,noteSteps:2});
 const wet=sessionWith({sampleSeconds:.75,noteSteps:2,
  pedal:[{step:0,down:true},{step:8,down:false}]});
 assert.equal(audit(dry).total_findings,0);
 const result=audit(wet);
 assert.equal(result.key_hold_shortfalls,1);
 assert.equal(result.findings[0].shortfall_seconds,.25);
});
test('swing-aware note duration derives score length, not unswung approximation',()=>{
 const straight=audit(sessionWith({sampleSeconds:.14,noteSteps:1,swing:0}));
 const swung=audit(sessionWith({sampleSeconds:.14,noteSteps:1,swing:80}));
 assert.equal(straight.key_hold_shortfalls,0);
 assert.equal(swung.key_hold_shortfalls,1);
});
test('a sample with sufficient mapped metadata still does not grant owned rights',()=>{
 const result=audit(sessionWith({sampleSeconds:2,rights:'unknown'}));
 assert.equal(result.total_findings,0);
 assert.equal(result.unknown_rights_note_uses,1);
 assert.match(result.limitations,/rights clearance/);
});
test('unknown material, malformed duration and invalid scene fail closed',()=>{
 assert.throws(()=>budget({sample_duration_sec:-1,playback_rate:1,
  held_seconds:1,release_sec:.2}),/Invalid/);
 assert.throws(()=>budget({sample_duration_sec:1,playback_rate:0,
  held_seconds:1,release_sec:.2}),/Invalid/);
 assert.throws(()=>audit({},0),/Invalid/);
 assert.throws(()=>audit(sessionWith(),-1),/Invalid/);
});
