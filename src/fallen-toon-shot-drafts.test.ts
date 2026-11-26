import test from 'node:test';
import assert from 'node:assert/strict';
import {buildToonShotDrafts,selectToonShot,assignDialogueToShot} from './fallen-toon-shot-drafts.ts';

function specimen(){
  return {
    story:{scenes:Array.from({length:6},(_,i)=>({title:'Scene '+(i+1),
      action:'Character physical action '+(i+1),durationSec:9,dialogue:[]}))},
    bible:{entities:[
      {id:'mom',kind:'character',name:'Mom'},
      {id:'kid',kind:'character',name:'Kid'},
      {id:'family-story-world',kind:'location',name:'Story world'}]},
    seriesPlan:{
      productionNeeds:[{id:'video-a',kind:'video',durationSec:6},{id:'video-b',kind:'video',durationSec:2.5},
        {id:'need-line-1',kind:'speech'}],
      dialogue:[{id:'scene-1-line-1',speakerId:'mom',text:'Hello'},
        {id:'scene-5-line-1',speakerId:'kid',text:'Found it!'}],
    },
  };
}
test('draft constructor respects actual video needs instead of pretending 6 story scenes are 6 clips',()=>{
  const shots=buildToonShotDrafts(specimen());
  assert.equal(shots.length,2);
  assert.deepEqual(shots.map(x=>x.sceneIndex),[0,3]);
  assert.deepEqual(shots.map(x=>x.durationSec),[6,2.5]);
  assert.deepEqual(shots.flatMap(x=>x.dialogueCueIds).sort(),
    ['scene-1-line-1','scene-5-line-1'].sort());
  assert.equal(shots[0].characters.length,2);
  assert.ok(shots[0].characters[0].acting.hands.length>10);
  assert.equal(shots[0].locationId,'family-story-world');
  assert.equal(selectToonShot(shots,1)?.id,'toon-shot-2');
  assert.equal(selectToonShot(shots,999),null);
});
test('dialogue can be reassigned without duplication or loss',()=>{
  const shots=buildToonShotDrafts(specimen());
  const updated=assignDialogueToShot(shots,'scene-1-line-1','toon-shot-2');
  assert.equal(updated[0].dialogueCueIds.length,0);
  assert.equal(updated[1].dialogueCueIds.length,2);
  assert.equal(shots[0].dialogueCueIds.length,1,'immutable source');
  assert.throws(()=>assignDialogueToShot(shots,'scene-1-line-1','missing'),/unknown_destination/);
});
test('no media planning when required series materials are missing',()=>{
  const s=specimen();s.seriesPlan.productionNeeds=s.seriesPlan.productionNeeds.filter(x=>x.kind==='speech');
  assert.deepEqual(buildToonShotDrafts(s),[]);
});
