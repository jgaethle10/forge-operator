import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const score=JSON.parse(readFileSync(new URL('./last-light-orchestra-score.json',import.meta.url)));
const noteValues={C:0,Db:1,D:2,Eb:3,E:4,F:5,Gb:6,G:7,Ab:8,A:9,Bb:10,B:11};
function number(note){
 const match=/^(C|Db|D|Eb|E|F|Gb|G|Ab|A|Bb|B)(-?[0-9])$/.exec(note);
 if(!match)throw Error('bad pitch '+note);
 return (Number(match[2])+1)*12+noteValues[match[1]];
}
const ranges={
 violin_pp:[number('D4'),number('B4')],
 violin_mf:[number('D4'),number('B4')],
 cello_pp:[number('C3'),number('C4')],
 cello_mf:[number('C3'),number('C4')],
 bass_pp_mid:[number('B1'),number('Bb2')],
 bassoon_pp:[number('C3'),number('B3')],
 horn_pp:[number('C4'),number('B4')],
 flute_pp:[number('C5'),number('B5')],
};
test('the beloved existing piano is protected by the canonical exact SHA',()=>{
 assert.equal(score.original_piano_do_not_overwrite,true);
 assert.equal(score.original_piano_pcm24_sha256,'630efc0e8206ec7a6f4f0dac41634ab2a34da7f518f9f90be0b339b4e5a2015e');
 assert.equal(score.reference_duration_seconds,35);
});
test('the orchestrator cannot silently treat individual recordings as a live full orchestra',()=>{
 assert.equal(score.actual_live_orchestra,false);
 assert.equal(score.commercial_release_approved,false);
 assert.ok(score.instrument_excluded.includes('viola'));
 assert.equal(score.software_assembled_using_real_note_recordings,true);
});
test('seven separately authored orchestra parts have enough authored notes for an audition',()=>{
 assert.deepEqual(score.instruments_in_first_audio_workprint,Object.keys(score.parts));
 assert.equal(Object.keys(score.parts).length,7);
 assert.equal(Object.values(score.parts).reduce((n,x)=>n+x.length,0),32);
});
test('each audition note falls inside the declared acoustic source chromatic-scale range',()=>{
 for(const [part,events] of Object.entries(score.parts)){
  for(const [at,note,hold,touch,source] of events){
   assert.ok(Number.isFinite(at)&&at>=0&&at+hold<=35,[part,at,hold]);
   assert.ok(Number.isFinite(hold)&&hold>.1&&hold<5,[part,hold]);
   assert.ok(Number.isFinite(touch)&&touch>0&&touch<=1,[part,touch]);
   assert.ok(source in ranges,[part,source]);
   const pitch=number(note);
   assert.ok(pitch>=ranges[source][0]&&pitch<=ranges[source][1],[part,note,source]);
  }
 }
});
test('the first layer waits until after the exposed piano opening',()=>{
 const first=Math.min(...Object.values(score.parts).flat().map(x=>x[0]));
 assert.ok(first>6);
});
