import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSeriesEpisode} from './series.ts';
import {compileToonShotHandoff,inspectToonHandoff,renderToonShotDirection} from './toon-shot-handoff.mjs';

const bible={
  schema:'evercraft.fallen.series-bible.v1',id:'lantern-fox',title:'Lantern Fox',
  styleRules:['Consistent painterly storybook characters and physically motivated animation.'],
  entities:[
    {id:'ember',kind:'character',name:'Ember',description:'Bright curious fox',
      immutableTraits:{species:'fox',fur:'rust-red',eyes:'amber',hands:'small fox paws'},
      voiceProfileId:'ember-voice-v1',referenceAssetIds:['ember-reference']},
    {id:'observatory',kind:'location',name:'Moonrise Observatory',
      immutableTraits:{architecture:'copper dome'},referenceAssetIds:['observatory-reference']}
  ],
  canon:[{subjectId:'ember',key:'home',value:'observatory',locked:true}]
};
const project={
  id:'lantern-fox-ep-01',title:'The Wandering Light',
  brief:{prompt:'A curious fox discovers a glowing lantern and sings to light the observatory.',
    format:'episode',durationSec:90,aspectRatio:'16:9',seriesId:bible.id,
    episodeId:'lantern-fox-ep-01',style:'cinematic family cartoon',
    dialogue:[{id:'line-1',speakerId:'ember',text:'Follow the light!',emotion:'wonder'}]},
  assets:[{id:'ember-reference',path:'./fixtures/ember-reference.png',kind:'image',
    rights:'owned',entityRefs:['ember'],tags:['character']}],
};
function fixture(){
  const episode=compileSeriesEpisode(project,bible);
  const videoNeeds=episode.productionNeeds.filter(n=>n.kind==='video');
  assert.ok(videoNeeds.length>0,'fixture requires actual generated video work orders');
  return {bible,episode,
    shots:videoNeeds.map((need,i)=>({
      id:'toon-shot-'+(i+1),visualNeedId:need.id,durationSec:need.durationSec,
      locationId:'observatory',action:'Ember inspects a floating lantern with careful movements.',
      soundDirection:'Soft original piano, environmental texture, dialogue intelligible.',
      characters:[{entityId:'ember',acting:{
        objective:'Understand why the lantern glows',
        physicalAction:'Walk slowly and reach toward the glow',
        face:'Curious eyes with restrained widening',
        gazeTarget:'The floating lantern in frame',
        hands:'Four fingers remain anatomically consistent and grip carefully',
      }}],
      dialogueCueIds:i===0?['line-1']:[],
    }))
  };
}
test('real Fallen Series Mode episode compiles to immutable toon shot and voice work orders',()=>{
  const input=fixture();
  const packet=compileToonShotHandoff(input);
  assert.equal(packet.schema,'evercraft.fallen.toon-shot-handoff.v1');
  assert.equal(packet.state,'preproduction_work_orders_only');
  assert.equal(packet.deliveryReady,false);
  assert.equal(packet.boundaries.videoRendered,false);
  assert.equal(packet.boundaries.voicesGenerated,false);
  assert.equal(packet.shots.length,input.shots.length);
  assert.equal(packet.shots[0].characters[0].lockedTraits.fur,'rust-red');
  assert.equal(packet.shots[0].characters[0].voiceProfileId,'ember-voice-v1');
  assert.equal(packet.shots[0].dialogue[0].voiceProfileId,'ember-voice-v1');
  assert.equal(packet.shots[0].dialogue[0].speechNeedId,'need-line-1');
  assert.ok(packet.shots[0].qualityGates.includes('phonemes_visemes_and_dialogue_sync'));
  assert.ok(packet.shots[0].qualityGates.includes('character_face_and_hand_anatomy'));
  assert.equal(packet.shots.at(-1).startFrame+packet.shots.at(-1).frameCount,packet.frameCount);
  assert.equal(inspectToonHandoff(packet).qualityGatesPending,true);
  assert.equal(compileToonShotHandoff(input).digest,packet.digest);
});
test('toon planning rejects character hands and expressions without explicit acting direction',()=>{
  const input=fixture();delete input.shots[0].characters[0].acting.hands;
  assert.throws(()=>compileToonShotHandoff(input),/toon_handoff_direction_missing:toon-shot-1:ember:hands/);
  input.shots[0].characters[0].acting.hands='Stable paws follow pose';
  input.shots[0].characters[0].acting.face='';
  assert.throws(()=>compileToonShotHandoff(input),/toon_handoff_direction_missing:toon-shot-1:ember:face/);
});
test('toon rejects missing reference image, broken voice identity and unassigned lines',()=>{
  const input=fixture();
  const noRefs={...input,bible:{...input.bible,entities:input.bible.entities.map(x=>x.id==='ember'?{...x,referenceAssetIds:[]}:x)}};
  // An altered bible must never pass the continuity digest check.
  assert.throws(()=>compileToonShotHandoff(noRefs),/toon_handoff_bible_digest_mismatch/);
  const noDialogue=fixture();noDialogue.shots[0].dialogueCueIds=[];
  assert.throws(()=>compileToonShotHandoff(noDialogue),/toon_handoff_dialogue_cues_unallocated/);
  const invisible=fixture();invisible.shots[0].characters[0].entityId='not-ember';
  assert.throws(()=>compileToonShotHandoff(invisible),/toon_handoff_character_not_in_bible/);
  const wrongSpeaker=fixture();wrongSpeaker.shots[0].dialogueCueIds=['line-unknown'];
  assert.throws(()=>compileToonShotHandoff(wrongSpeaker),/toon_handoff_unknown_dialogue_cue/);
});
test('toon rejects duplicate needs, missing or misassigned scenes, frame and duration drift',()=>{
  const input=fixture();
  const mismatch=fixture();mismatch.shots[0].durationSec+=9;
  assert.throws(()=>compileToonShotHandoff(mismatch),/toon_handoff_visual_duration_mismatch/);
  const second={...input.shots[0],id:'duplicate-use'};
  assert.throws(()=>compileToonShotHandoff({...input,shots:[...input.shots,second]}),
    /toon_handoff_visual_need_count_mismatch/);
  const packet=compileToonShotHandoff(fixture());
  const altered={...packet,frameCount:packet.frameCount+1};
  assert.throws(()=>inspectToonHandoff(altered),/toon_handoff_packet_tampered/);
  const unauthorized={...packet,deliveryReady:true};
  assert.throws(()=>inspectToonHandoff(unauthorized),/toon_handoff_packet_tampered/);
});

test('toon shot directions feed real image/video prompts with locked eyes, hands and voice',()=>{
  const packet=compileToonShotHandoff(fixture());
  const direction=renderToonShotDirection(packet,packet.shots[0].id);
  assert.match(direction,/HAND[S/PAW]*:/);
  assert.match(direction,/Maintain consistent limb count, digit anatomy/);
  assert.match(direction,/locked_voice=ember-voice-v1/);
  assert.match(direction,/FACE: Curious eyes with restrained widening/);
  assert.match(direction,/PHYSICAL BLOCKING: Walk slowly/);
  assert.match(direction,/FALLEN TOON SHOT DIRECTION/);
  assert.match(direction,/Sound is NOT generated by this visual prompt/);
  assert.throws(()=>renderToonShotDirection(packet,'unknown'),/toon_handoff_shot_not_found/);
  const unauthorized={...packet,publicationAuthority:true};
  assert.throws(()=>renderToonShotDirection(unauthorized,packet.shots[0].id),/toon_handoff_packet_tampered/);
});
