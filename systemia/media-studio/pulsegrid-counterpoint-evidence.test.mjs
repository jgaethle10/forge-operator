import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzePulseGridCounterpoint as analyze} from './pulsegrid-counterpoint-evidence.mjs';
import {createPulseGridSession,applyPulseGridTransaction} from './pulsegrid-session.ts';

function score(notes){
  const original=createPulseGridSession('Contrapuntal evidence');
  const operations=notes.map(([track_id,pitch,start,length=1])=>({
    type:'note.add',track_id,scene:0,note:{pitch,start,length,velocity:.64},
  }));
  return applyPulseGridTransaction(original,{intent:'Real canonical MIDI events',operations},'human').session;
}
test('two distinct pitched parts form an observable parallel fifth, without auto-editing music',()=>{
 const s=score([
  ['keys',60,0],['bass',53,0],
  ['keys',62,2],['bass',55,2],
 ]);
 const unchanged=JSON.stringify(s),result=analyze(s,0);
 assert.equal(result.motion_summary.parallel_fifths,1);
 assert.equal(result.motion_summary.parallel_octaves_or_unisons,0);
 assert.equal(result.motion_summary.similar,1);
 assert.equal(result.simultaneous_single_note_onsets,2);
 assert.equal(result.bounded_examples[0].from_step,0);
 assert.equal(result.bounded_examples[0].to_step,2);
 assert.equal(result.bounded_examples[0].kind,'parallel_perfect_fifths');
 assert.equal(result.automatic_note_changes,false);
 assert.equal(result.editorial_rules,'observational_not_prescriptive');
 assert.equal(result.human_musician_review_required,true);
 assert.equal(JSON.stringify(s),unchanged);
});
test('octave doubling is an observation rather than a universal counterpoint mistake',()=>{
 const s=score([['keys',72,0],['bass',60,0],['keys',74,2],['bass',62,2]]);
 const r=analyze(s,0);
 assert.equal(r.motion_summary.parallel_octaves_or_unisons,1);
 assert.equal(r.motion_summary.parallel_fifths,0);
 assert.match(r.findings[0].recommendation,/cinematic unisons/);
});
test('contrary direction and oblique motion are distinguished from parallel perfect intervals',()=>{
 const contrary=score([['keys',60,0],['bass',48,0],['keys',62,2],['bass',47,2]]);
 const oblique=score([['keys',60,0],['bass',48,0],['keys',60,2],['bass',50,2]]);
 assert.equal(analyze(contrary,0).motion_summary.contrary,1);
 assert.equal(analyze(contrary,0).motion_summary.parallel_fifths,0);
 assert.equal(analyze(oblique,0).motion_summary.oblique,1);
});
test('stacked chords do not masquerade as singular voice-leading strands',()=>{
 const s=score([
  ['keys',60,0],['keys',64,0],['bass',53,0],
  ['keys',62,2],['bass',55,2],
 ]);
 const r=analyze(s,0);
 assert.equal(r.simultaneous_single_note_onsets,1);
 assert.equal(r.motion_summary.parallel_fifths,0);
});
test('a held note overlapping the next piano attack prevents invented monophonic lines',()=>{
 const s=score([
  ['keys',60,0,4],['bass',53,0,1],
  ['keys',62,2,1],['bass',55,2,1],
 ]);
 const r=analyze(s,0);
 assert.equal(r.simultaneous_single_note_onsets,1);
 assert.equal(r.motion_summary.parallel_fifths,0);
});
test('an intervening unmatched onset prevents claims of successive parallel motion',()=>{
 const s=score([
  ['keys',60,0],['bass',53,0],
  ['keys',61,1],
  ['keys',62,2],['bass',55,2],
 ]);
 const r=analyze(s,0);
 assert.equal(r.simultaneous_single_note_onsets,2);
 assert.equal(r.motion_summary.parallel_fifths,0);
});
test('asynchronous independent phrases are not falsely assigned classical simultaneous voices',()=>{
 const s=score([
  ['keys',60,0],['bass',53,1],
  ['keys',62,2],['bass',55,3],
 ]);
 const r=analyze(s,0);
 assert.equal(r.simultaneous_single_note_onsets,0);
 assert.equal(r.analyzed_track_pairs,0);
 assert.ok(r.findings.some(f=>f.kind==='no_unambiguous_counterpoint'));
 assert.equal(r.real_audio_masking_measured,false);
});
test('underlying interval distribution is observable even without motion',()=>{
 const s=score([['keys',60,0],['bass',59,0]]);
 const r=analyze(s,0);
 assert.equal(r.interval_class_histogram[1],1);
 assert.equal(r.motion_summary.contrary,0);
 assert.equal(r.inferred_key,null);
});
test('invalid canonical note and oversized orchestra fail safely',()=>{
 assert.throws(()=>analyze(null,0),/Canonical PulseGrid/);
 const s=score([['keys',60,0]]);
 s.tracks.find(t=>t.id==='keys').clips[0].notes[0].pitch=129;
 assert.throws(()=>analyze(s,0),/Invalid canonical MIDI/);
 const huge={tracks:Array.from({length:25},(_,i)=>({id:'voice'+i,type:'synth',clips:[{notes:[]}]}))};
 assert.throws(()=>analyze(huge,0),/track budget/);
});
