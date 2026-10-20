import test from 'node:test';
import assert from 'node:assert/strict';
import {battleshipWorld,battleshipGeometry} from './battleship-scene.js';
import {composeNativeBattleshipCamera} from './native-format-camera.js';
import {directWorldEngineShot} from './shot-director.js';
import {verifyWebGpuRenderPlan} from './webgpu.js';

const scene=battleshipWorld(),geometry=battleshipGeometry();
const hero={id:'ship-hero',entityIds:['ship-hull','bridge-house','mast-main']};
const detail={id:'gun-turret-detail',
  entityIds:['turret-fore-a','barrel-fore-a-port','barrel-fore-a-starboard']};
const base=(format:'wide'|'square'|'vertical')=>{
 const spec=composeNativeBattleshipCamera(format);
 return {world:scene,geometries:geometry,viewport:spec.viewport,
   take:{...spec.cameraTake,durationSec:.5},hero,
   detail,detailTargetEntityId:'turret-fore-a'};
};
test('hero shot keeps complete source geometry in distinct native World Engine GPU plans',()=>{
 const result=directWorldEngineShot({...base('wide'),intent:'hero_full'});
 assert.equal(result.receipt.intent,'hero_full');
 assert.equal(result.receipt.fullHeroAutoFit?.schema,'evercraft.world-engine.optical-autofit.v1');
 assert.equal(result.sequence.frameCount,13);
 assert.equal(result.receipt.candidatesEvaluated,15);
 assert.equal(result.receipt.titleSafeRegion,null);
 assert.ok(result.receipt.composition.samples.every(x=>x.status!=='subject_offscreen'));
 assert.ok(result.sequence.frames.every(x=>verifyWebGpuRenderPlan(x.renderPlan)));
 assert.equal(result.receipt.publicationAuthority,false);
});
test('actual turret detail view targets fore turret and gun barrels, never silently substitutes ship hull',()=>{
 const result=directWorldEngineShot({...base('square'),intent:'detail_closeup'});
 assert.equal(result.receipt.intent,'detail_closeup');
 assert.equal(result.take.targetEntityId,'turret-fore-a');
 assert.deepEqual(result.receipt.composition.subjectEntityIds,detail.entityIds);
 assert.equal(result.receipt.candidatesEvaluated,15);
 assert.ok(result.receipt.selected.radius<20);
 assert.equal(result.sequence.frames[0].renderPlan.width,480);
 assert.equal(result.sequence.frames[0].renderPlan.height,480);
 assert.ok(result.receipt.composition.samples.some(x=>x.coverage.width>.1));
 assert.equal(result.receipt.clientApproval,false);
});
test('native portrait title-safe view reserves measured right-hand region without screen-space cropping',()=>{
 const result=directWorldEngineShot({...base('vertical'),intent:'title_safe'});
 assert.equal(result.receipt.titleSafeRegion?.axis,'right');
 assert.equal(result.receipt.candidatesEvaluated,12);
 assert.equal(result.receipt.composition.samples.length,3);
 assert.ok(result.receipt.safeRegionClearanceScore!==null);
 assert.equal(result.receipt.fullHeroAutoFit,null);
 assert.equal(result.sequence.frames[0].renderPlan.height,640);
 assert.notEqual(result.receipt.selected.focusOffset.x,0);
 assert.ok(result.receipt.cameraPlanDigests.every(x=>/^[0-9a-f]{64}$/.test(x)));
 assert.equal(result.receipt.publicationAuthority,false);
});
test('director fails closed on invalid inputs, missing subject or nonsensical lens choice',()=>{
 assert.throws(()=>directWorldEngineShot({...base('wide'),intent:'fantasy' as any}),
  /world_director_intent_invalid/);
 assert.throws(()=>directWorldEngineShot({...base('wide'),intent:'detail_closeup',detail:undefined}),
  /world_director_detail_subject_required/);
 assert.throws(()=>directWorldEngineShot({...base('wide'),intent:'detail_closeup',
  detailTargetEntityId:'invalid'}),
  /world_director_detail_target_must_be_hero/);
 assert.throws(()=>directWorldEngineShot({...base('wide'),intent:'hero_full',
  viewport:{width:20,height:20}}),
  /world_director_viewport_invalid/);
});
