import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzePulseGridArrangementArc} from './pulsegrid-arrangement-arc.mjs';

function session(parts=[]){
 return {tracks:parts.map(p=>({id:p.id,type:p.type||'synth',muted:!!p.muted,
  clips:[{bars:p.bars||4,steps_per_bar:16,notes:p.notes||[]}]}))};
}
const n=(start,length,velocity=.5)=>({start,length,velocity,pitch:60});
test('empty score is read-only and not an acoustic silence claim',()=>{
 const s=session([{id:'keys',notes:[]}]),before=JSON.stringify(s);
 const a=analyzePulseGridArrangementArc(s,0);
 assert.equal(a.bar_count,4);
 assert.deepEqual(a.completely_silent_score_bars,[1,2,3,4]);
 assert.equal(a.peak_midi_onsets,0);
 assert.deepEqual(a.peak_onset_bars,[]);
 assert.equal(a.measures_acoustic_loudness,false);
 assert.equal(a.automatic_composition_changes,false);
 assert.equal(a.emotional_quality_score,null);
 assert.equal(JSON.stringify(s),before);
});
test('late instrument arrival and handoff are measured from sounding spans',()=>{
 const s=session([
  {id:'keys',notes:[n(0,16,.3),n(16,8,.4)]},
  {id:'cello',notes:[n(16,16,.6),n(32,8,.8)]}
 ]);
 const a=analyzePulseGridArrangementArc(s,0);
 assert.deepEqual(a.first_entrances,[{track_id:'keys',bar:1},{track_id:'cello',bar:2}]);
 assert.equal(a.bars[0].sounding_parts,1);
 assert.equal(a.bars[1].sounding_parts,2);
 assert.equal(a.bars[2].sounding_parts,1);
 assert.deepEqual(a.bars[2].departures,['keys']);
 assert.deepEqual(a.completely_silent_score_bars,[4]);
 assert.equal(a.bars[1].mean_onset_velocity,.5);
 assert.ok(a.observations.some(f=>f.kind==='layer_arrival'));
});
test('held notes cross a bar without a fake onset; an exact note-off does not',()=>{
 const a=analyzePulseGridArrangementArc(session([{id:'keys',notes:[n(15,2,.7)]}]),0);
 assert.equal(a.bars[0].midi_onsets,1);
 assert.equal(a.bars[1].midi_onsets,0);
 assert.equal(a.bars[1].sounding_parts,1);
 assert.equal(a.bars[2].sounding_parts,0);
 const b=analyzePulseGridArrangementArc(session([{id:'keys',notes:[n(0,16)]}]),0);
 assert.equal(b.bars[1].sounding_parts,0);
});
test('return after a silent bar is a reentry, not a new instrument',()=>{
 const a=analyzePulseGridArrangementArc(session([{id:'keys',notes:[n(0,2),n(32,1)]}]),0);
 assert.deepEqual(a.bars[0].first_entrances,['keys']);
 assert.deepEqual(a.bars[2].reentries,['keys']);
 assert.deepEqual(a.bars[2].first_entrances,[]);
 assert.deepEqual(a.completely_silent_score_bars,[2,4]);
});
test('drums and imported audio are excluded; muted authored notes are disclosed',()=>{
 const a=analyzePulseGridArrangementArc(session([
  {id:'drums',type:'drums',notes:[n(0,1)]},
  {id:'audio',type:'audio',notes:[n(16,2)]},
  {id:'keys',muted:true,notes:[n(0,3,.2)]}
 ]),0);
 assert.equal(a.midi_note_count,1);
 assert.equal(a.pitched_part_count,1);
 assert.equal(a.bars[0].muted_sounding_parts,1);
 assert.equal(a.bars[1].score_silent,true);
 assert.match(a.coverage,/including_muted/);
 assert.match(a.excluded_audio,/drums_audio/);
});
test('densest bar is onset evidence, not an excitement or loudness rating',()=>{
 const a=analyzePulseGridArrangementArc(session([{id:'keys',notes:[
  n(0,1,.2),n(17,1,.8),n(18,1,.6),n(48,2,.3)
 ]}]),0);
 assert.equal(a.peak_midi_onsets,2);
 assert.deepEqual(a.peak_onset_bars,[2]);
 assert.equal(a.bars[1].mean_onset_velocity,.7);
 assert.ok(a.observations.some(f=>f.kind==='onset_density_contrast'));
});
test('bad graph, corrupt notes and over-budget scores fail closed',()=>{
 assert.throws(()=>analyzePulseGridArrangementArc(null,0),/Canonical/);
 assert.throws(()=>analyzePulseGridArrangementArc(session([]),-1),/Canonical/);
 assert.throws(()=>analyzePulseGridArrangementArc(session([{id:'bad',notes:[n(-1,1)]}]),0),/Invalid canonical MIDI note/);
 assert.throws(()=>analyzePulseGridArrangementArc(session([{id:'bad',notes:[{...n(0,1),velocity:NaN}]}]),0),/Invalid canonical MIDI note/);
 assert.throws(()=>analyzePulseGridArrangementArc(session([{id:'bad',bars:17}]),0),/Invalid canonical MIDI clip/);
 assert.throws(()=>analyzePulseGridArrangementArc(session([{id:'dense',notes:Array.from({length:4097},(_,i)=>n(i*.01,1))}]),0),/budget/);
});
test('high density analysis is bounded and preserves all legal notes',()=>{
 const s=session([{id:'keys',bars:16,notes:Array.from({length:4096},(_,i)=>n(i/20,.01))}]);
 const a=analyzePulseGridArrangementArc(s,0);
 assert.equal(a.midi_note_count,4096);
 assert.equal(a.bar_count,16);
 assert.equal(a.bars.reduce((total,bar)=>total+bar.midi_onsets,0),4096);
});
