import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzePulseGridMusic} from './pulsegrid-music-insights.mjs';
import {createPulseGridSession,applyPulseGridTransaction} from './pulsegrid-session.ts';

function populated(){
 const base=createPulseGridSession('Music Theory Review');
 const operations=[
  {type:'note.add',track_id:'keys',scene:0,note:{pitch:62,start:0,length:2,velocity:.3}},
  {type:'note.add',track_id:'keys',scene:0,note:{pitch:65,start:2,length:2,velocity:.35}},
  {type:'note.add',track_id:'keys',scene:0,note:{pitch:69,start:4,length:2,velocity:.4}},
  {type:'note.add',track_id:'keys',scene:0,note:{pitch:72,start:6,length:2,velocity:.45}},
  {type:'note.add',track_id:'keys',scene:0,note:{pitch:76,start:8,length:2,velocity:.6}},
  {type:'note.add',track_id:'keys',scene:0,note:{pitch:79,start:10,length:2,velocity:.7}},
 ];
 return applyPulseGridTransaction(base,{intent:'fixture with musical contour',operations},'human').session;
}
test('analysis reads canonical MIDI without editing or certifying its musical taste',()=>{
 const s=populated(),prior=JSON.stringify(s);
 const r=analyzePulseGridMusic(s,0);
 assert.equal(r.note_count,6);
 assert.equal(r.pitched_track_count,1);
 assert.equal(r.schema,'evercraft.fallen.music-theory-insights.v1');
 assert.equal(r.inferred_key,null);
 assert.equal(r.taste_or_originality_score,null);
 assert.equal(r.automatic_composition_changes,false);
 assert.equal(r.reviewer,'human_musician_required');
 assert.equal(JSON.stringify(s),prior);
});
test('pitch class evidence reflects actual MIDI note names, not guessed tonic',()=>{
 const r=analyzePulseGridMusic(populated(),0);
 const pcs=r.pitch_class_evidence.map(e=>e.pitch_class);
 assert.ok(pcs.includes('D'));
 assert.ok(pcs.includes('F'));
});
test('drum and audio tracks are excluded from harmonic melody analysis',()=>{
 const s=createPulseGridSession('Rhythmic test');
 const r=analyzePulseGridMusic(s,0);
 assert.equal(r.note_count,0);
 assert.equal(r.inferred_key,null);
 assert.ok(r.findings.some(f=>f.kind==='empty_arrangement'));
});
test('motif and melodic leap observations remain gentle musician prompts',()=>{
 const s=createPulseGridSession('Motif test');
 const pitches=[60,62,64,67,69,71,74,76,78,81];
 const ops=pitches.map((pitch,start)=>({type:'note.add',track_id:'keys',scene:0,
  note:{pitch,start,length:1,velocity:.55}}));
 const a=applyPulseGridTransaction(s,{intent:'motif pattern',operations:ops},'human').session;
 const r=analyzePulseGridMusic(a,0);
 assert.ok(r.track_profiles[0].repeated_interval_motifs>0);
 assert.ok(r.findings.some(f=>f.kind==='motif_repetition'));
});
test('different simultaneous parts sharing register surface masking for audition',()=>{
 const s=createPulseGridSession('Orchestral clarity');
 const ops=[
  {type:'note.add',track_id:'keys',scene:0,note:{pitch:60,start:0,length:2}},
  {type:'note.add',track_id:'bass',scene:0,note:{pitch:61,start:0,length:2}},
 ];
 const a=applyPulseGridTransaction(s,{intent:'register overlap fixture',operations:ops},'human').session;
 const r=analyzePulseGridMusic(a,0);
 assert.ok(r.register_proximity_examples>=1);
 assert.ok(r.findings.some(f=>f.kind==='register_proximity'));
});
test('invalid root objects or corrupt MIDI notes are rejected',()=>{
 assert.throws(()=>analyzePulseGridMusic(null,0),/Canonical PulseGrid/);
 const s=populated();s.tracks.find(x=>x.id==='keys').clips[0].notes[0].pitch=129;
 assert.throws(()=>analyzePulseGridMusic(s,0),/Invalid canonical note/);
});
