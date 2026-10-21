import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {prepareToonCelPreview,renderToonCelPreview} from './toon-cel-adapter.mjs';

const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'
  ?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)])):x;
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(stable(x))).digest('hex');
function fixture(){
  const core={
    schema:'evercraft.fallen.toon-shot-handoff.v1',
    state:'preproduction_work_orders_only',
    deliveryReady:false,publicationAuthority:false,
    boundaries:{videoRendered:false},
    frameCount:24,shots:[{
      id:'lantern-fox-shot',startFrame:0,frameCount:24,fps:24,
      characters:[{id:'ember',lockedTraits:{species:'fox',fur:'rust'},
        referenceAssetIds:['ember-original-prototype']}],
      dialogue:[],
      previewMotion:{specimenProfile:'original_fox_v1',reach:.75,
        blinkAtSec:.7,gazeX:.4,lanternLift:.8,tailEnergy:.3},
    }],
  };
  return {...core,digest:digest(core)};
}
test('a real packet-bound single original fox shot routes to a local synthetic preview',()=>{
  const plan=prepareToonCelPreview({packet:fixture(),shotId:'lantern-fox-shot'});
  assert.equal(plan.kind,'generic_fox_vector_animation_canary');
  assert.equal(plan.frameCount,24);
  assert.equal(plan.durationSec,1);
  assert.equal(plan.boundToRealShotId,true);
  assert.equal(plan.previewMotion.reach,.75);
  assert.match(plan.previewMotionDigest,/^[a-f0-9]{64}$/);
  assert.equal(plan.referenceMatched,false);
  assert.equal(plan.publicationAuthority,false);
});
test('explicitly rejects humans, missing shots, voice and incompatible timing',()=>{
  const original=fixture();
  assert.throws(()=>prepareToonCelPreview({packet:original,shotId:'missing'}),/shot_unknown/);
  const human=fixture();human.shots[0].characters[0].lockedTraits.species='human';
  const {digest:_,...revised}=human;human.digest=digest(revised);
  assert.throws(()=>prepareToonCelPreview({packet:human,shotId:'lantern-fox-shot'}),/supported_original_fox_only/);
  const speech=fixture();speech.shots[0].dialogue=[{id:'cue-1'}];
  const {digest:__,...speechCore}=speech;speech.digest=digest(speechCore);
  assert.throws(()=>prepareToonCelPreview({packet:speech,shotId:'lantern-fox-shot'}),/spoken_dialogue_not_supported/);
  const tooLong=fixture();tooLong.shots[0].frameCount=240;tooLong.frameCount=240;
  const {digest:___,...longCore}=tooLong;tooLong.digest=digest(longCore);
  assert.throws(()=>prepareToonCelPreview({packet:tooLong,shotId:'lantern-fox-shot'}),/duration_outside_canary_bounds/);
  const missingMotion=fixture();delete missingMotion.shots[0].previewMotion;
  const {digest:____,...missingCore}=missingMotion;missingMotion.digest=digest(missingCore);
  assert.throws(()=>prepareToonCelPreview({packet:missingMotion,shotId:'lantern-fox-shot'}),
    /authored_preview_motion_required/);
  const illegalMotion=fixture();illegalMotion.shots[0].previewMotion.gazeX=7;
  const {digest:_____,...illegalCore}=illegalMotion;illegalMotion.digest=digest(illegalCore);
  assert.throws(()=>prepareToonCelPreview({packet:illegalMotion,shotId:'lantern-fox-shot'}),
    /preview_motion_range_invalid:gazeX/);
  assert.throws(()=>renderToonCelPreview({packet:original,shotId:'lantern-fox-shot',outDir:'/tmp/cel-preview-test'}),
    /explicit_canary_opt_in_required/);
});

