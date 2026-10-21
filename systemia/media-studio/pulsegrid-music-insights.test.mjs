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
 assert.equal(pcs.length,12,'complete chromatic evidence cannot be top-five truncated');
 assert.deepEqual(pcs,['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B']);
 assert.equal(r.pitch_class_evidence.find(e=>e.pitch_class==='D').note_count,1);
 assert.equal(r.pitch_class_evidence.find(e=>e.pitch_class==='B').note_count,0);
 assert.equal(r.pitch_class_evidence.find(e=>e.pitch_class==='B').weight,0);
 assert.deepEqual(r.prominent_pitch_classes.map(e=>e.pitch_class),['G','E','C','A','F']);
 assert.ok(!r.prominent_pitch_classes.some(e=>e.pitch_class==='D'),
   'D is not top-five, but must remain in full evidence');
 assert.equal(r.pitch_class_weighting,'capped_note_duration_steps_times_midi_velocity');
});
test('drum and audio tracks are excluded from harmonic melody analysis',()=>{
 const s=createPulseGridSession('Rhythmic test');
 const r=analyzePulseGridMusic(s,0);
 assert.equal(r.note_count,0);
 assert.equal(r.inferred_key,null);
 assert.equal(r.pitch_class_evidence.length,12);
 assert.ok(r.pitch_class_evidence.every(e=>e.note_count===0&&e.weight===0));
 assert.deepEqual(r.prominent_pitch_classes,[]);
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

test('a held melodic phrase exposes rests between sounding events without mistaking leading silence for a phrase break',()=>{
 const source=createPulseGridSession('Phrase space');
 const ops=[
  {type:'note.add',track_id:'keys',scene:0,note:{pitch:60,start:4,length:3,velocity:.5}},
  {type:'note.add',track_id:'keys',scene:0,note:{pitch:64,start:6,length:3,velocity:.6}},
  {type:'note.add',track_id:'keys',scene:0,note:{pitch:67,start:13,length:1,velocity:.7}}
 ];
 const s=applyPulseGridTransaction(source,{intent:'observed notes and gaps',operations:ops},'human').session;
 const r=analyzePulseGridMusic(s,0),profile=r.track_profiles.find(p=>p.track_id==='keys');
 assert.equal(profile.rest_gap_count,1);
 assert.deepEqual(profile.rest_gaps,[{start_step:9,duration_steps:4}]);
 assert.equal(profile.longest_rest_steps,4);
 assert.ok(r.findings.some(f=>f.kind==='phrase_space'));
 assert.equal(r.automatic_composition_changes,false);
});
test('continuous legato notes and simultaneous chords do not invent breath gaps',()=>{
 const s=createPulseGridSession('Legato');
 const ops=[
  {type:'note.add',track_id:'keys',scene:0,note:{pitch:60,start:0,length:3}},
  {type:'note.add',track_id:'keys',scene:0,note:{pitch:64,start:0,length:3}},
  {type:'note.add',track_id:'keys',scene:0,note:{pitch:67,start:3,length:3}}
 ];
 const a=applyPulseGridTransaction(s,{intent:'legato',operations:ops},'human').session;
 const r=analyzePulseGridMusic(a,0);
 assert.equal(r.track_profiles.find(p=>p.track_id==='keys').rest_gap_count,0);
});
test('register overlap sweep detects real simultaneous different-track voices and excludes nonoverlapping voices',()=>{
 const s=createPulseGridSession('Register');
 const first=applyPulseGridTransaction(s,{intent:'voice separation',operations:[
  {type:'note.add',track_id:'keys',scene:0,note:{pitch:60,start:0,length:1}},
  {type:'note.add',track_id:'bass',scene:0,note:{pitch:61,start:1,length:1}}
 ]},'human').session;
 assert.equal(analyzePulseGridMusic(first,0).register_proximity_examples,0);
 const second=applyPulseGridTransaction(first,{intent:'another voice',operations:[
  {type:'note.add',track_id:'bass',scene:0,note:{pitch:62,start:0,length:.5}}
 ]},'human').session;
 assert.ok(analyzePulseGridMusic(second,0).register_proximity_examples>0);
});
test('music register scan stays bounded on dense same-track passages',()=>{
 const s=createPulseGridSession('Dense score');
 const clip=s.tracks.find(t=>t.id==='keys').clips[0];
 clip.notes=Array.from({length:4000},(_,i)=>({
  id:'dense-'+i,pitch:60,start:i*.002,length:2,velocity:.55,
  probability:1,microtiming:0
 }));
 const a=analyzePulseGridMusic(s,0);
 assert.equal(a.note_count,4000);
 assert.equal(a.register_proximity_examples,0);
 assert.equal(a.track_profiles[0].rest_gap_count,0);
 assert.equal(a.automatic_composition_changes,false);
});

test('all twelve sounding pitch classes survive a five-item summary',()=>{
 const s=createPulseGridSession('Chromatic evidence');
 const operations=Array.from({length:12},(_,pc)=>({
  type:'note.add',track_id:'keys',scene:0,
  note:{pitch:60+pc,start:pc,length:1,velocity:.5}
 }));
 const populated=applyPulseGridTransaction(s,{intent:'chromatic coverage',operations},'human').session;
 const r=analyzePulseGridMusic(populated,0);
 assert.equal(r.note_count,12);
 assert.deepEqual(r.pitch_class_evidence.map(e=>e.note_count),Array(12).fill(1));
 assert.equal(r.prominent_pitch_classes.length,5);
 assert.equal(r.inferred_key,null);
 assert.equal(r.automatic_composition_changes,false);
});

test('simultaneous chords are not misclassified as horizontal melodic leaps',()=>{
 const source=createPulseGridSession('Vertical harmony');
 const ops=[60,64,67].map(pitch=>({type:'note.add',track_id:'keys',scene:0,
   note:{pitch,start:0,length:2,velocity:.6}})).concat(
  [62,65,69].map(pitch=>({type:'note.add',track_id:'keys',scene:0,
   note:{pitch,start:2,length:2,velocity:.6}})));
 const s=applyPulseGridTransaction(source,{intent:'two stacked chords',operations:ops},'human').session;
 const r=analyzePulseGridMusic(s,0),profile=r.track_profiles.find(t=>t.track_id==='keys');
 assert.equal(profile.stacked_onset_groups,2);
 assert.equal(profile.melodic_interval_pairs,0);
 assert.equal(profile.large_melodic_leaps,0);
 assert.equal(profile.repeated_interval_motifs,0);
 assert.ok(!r.findings.some(f=>f.kind==='melodic_leaps'));
 assert.equal(r.note_count,6,'all chord notes still contribute to pitch-class evidence');
});

test('single-note motion retains real leaps without inferring a key',()=>{
 const source=createPulseGridSession('Single-note intervals');
 const operations=[60,72,74].map((pitch,start)=>({
  type:'note.add',track_id:'keys',scene:0,
  note:{pitch,start,length:1,velocity:.6}
 }));
 const s=applyPulseGridTransaction(source,{intent:'single-note line',operations},'human').session;
 const r=analyzePulseGridMusic(s,0),profile=r.track_profiles.find(t=>t.track_id==='keys');
 assert.equal(profile.stacked_onset_groups,0);
 assert.equal(profile.melodic_interval_pairs,2);
 assert.equal(profile.large_melodic_leaps,1);
 assert.ok(r.findings.some(f=>f.kind==='melodic_leaps'));
 assert.equal(r.inferred_key,null);
});
