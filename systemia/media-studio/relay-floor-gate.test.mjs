import assert from 'node:assert/strict';
import test from 'node:test';
import {assertRelayFloorBrief} from './relay-floor-gate.mjs';

function good() {
  const assets = Array.from({length: 5}, (_,i) => ({
    id:'v'+i,mediaKind:'video',rights:'owned',evidenceState:'observed',
    motionType:'physical_action',footageClass:'verified_eps_project',
    subjects:i===0?['visible-human-action','speaking-human']:['visible-human-action','cleanup-action']
  }));
  const scenes = assets.map((a,i)=>({
    id:'s'+i,assetId:a.id,
    mustShowSubjects:i===0?['visible-human-action','speaking-human']:['visible-human-action'],
    scoreEnergy:[.15,.4,.7,.85,.35][i],
    sfxCues:[{description:['boots-on-gravel','rake-through-leaves','real-tool-movement','haul-truck','yard-ambience'][i]}],
    ...(i===0?{onScreenDialogue:{text:'We need this yard back.',syncAudioAssetRef:'take-audio-001',performerUseConsentRef:'signed-talent-release-001'}}:{})
  }));
  return {creativeStandard:'relay-floor-v1',scenes,sourceAssets:assets,
    audioDirection:{dialogue:'human performed natural conversational dialogue',
      score:'original evolving music with build and resolve',
      foley:'physical tool sync sound per shot',ambience:'true outdoor environmental bed',
      voicePerformanceDirection:'listen to multiple takes for inflection and believable pauses',
      mixDirection:'duck score under speech, preserve impacts and master for phones'}};
}
test('relay cinematic brief requires real moving people, synchronized speech and layered sound',()=>{
  assert.doesNotThrow(()=>assertRelayFloorBrief(good()));
});
test('does not reject older commercial briefs that did not opt in',()=>{
  assert.doesNotThrow(()=>assertRelayFloorBrief({}));
});
test('EPS RC01 slideshow cannot masquerade as relay-floor production',()=>{
  const b=good();b.sourceAssets[1].mediaKind='image';
  assert.throws(()=>assertRelayFloorBrief(b),/still_photo_substitution/);
  b.sourceAssets[1].mediaKind='video';b.sourceAssets[1].motionType='camera_pan_over_still';
  assert.throws(()=>assertRelayFloorBrief(b),/physical_action_not_attested/);
});
test('no talking performer, synced audio, or consent means blocked',()=>{
  const b=good();delete b.scenes[0].onScreenDialogue;
  assert.throws(()=>assertRelayFloorBrief(b),/on_screen_talking_missing/);
  b.scenes[0].onScreenDialogue={text:'hello',syncAudioAssetRef:'',performerUseConsentRef:'abc'};
  assert.throws(()=>assertRelayFloorBrief(b),/synchronized_dialogue_audio_missing/);
});
test('single-loop music and empty sound spots cannot pass',()=>{
  const b=good();b.scenes.forEach(s=>{s.scoreEnergy=.5;s.sfxCues=[]});
  assert.throws(()=>assertRelayFloorBrief(b),/layered_foley_missing/);
  b.scenes.forEach((s,i)=>{s.sfxCues=[{description:'cue '+i}]});
  assert.throws(()=>assertRelayFloorBrief(b),/dynamic_score_arc_missing/);
});
test('illustrative actors need explicit advertising use review',()=>{
  const b=good();b.sourceAssets[0].footageClass='illustrative_stock';
  assert.throws(()=>assertRelayFloorBrief(b),/stock_talent_review_missing/);
  b.sourceAssets[0].modelOrTalentReleaseStatus='reviewed_for_this_ad';
  assert.doesNotThrow(()=>assertRelayFloorBrief(b));
});
