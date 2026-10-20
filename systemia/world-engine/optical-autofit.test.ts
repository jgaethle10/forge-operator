import test from 'node:test';
import assert from 'node:assert/strict';
import {battleshipGeometry,battleshipWorld} from './battleship-scene.js';
import {composeNativeBattleshipCamera} from './native-format-camera.js';
import {autoFitOrbitCamera} from './optical-autofit.js';

const subject={id:'battleship-hero',entityIds:['ship-hull','bridge-house','mast-main']};
test('general geometry-based preflight evaluates real orbit alternatives and never chooses worse measured composition',()=>{
 const format='vertical',spec=composeNativeBattleshipCamera(format);
 const world=battleshipWorld(),geometries=battleshipGeometry();
 const result=autoFitOrbitCamera({
  world,geometries,take:spec.cameraTake,
  viewport:spec.viewport,subject,
  radiusFactors:[1,1.2,1.45],targetZOffsets:[0,3,6]
 });
 const {receipt,take}=result;
 assert.equal(receipt.schema,'evercraft.world-engine.optical-autofit.v1');
 assert.equal(receipt.evaluated.length,9);
 assert.equal(receipt.sampleFrameCount,13);
 assert.equal(receipt.publicationAuthority,false);
 assert.equal(receipt.creativeReviewRequired,true);
 assert.equal(receipt.noPostCrop,true);
 assert.ok(receipt.selected.cameraScore<=receipt.initial.cameraScore);
 assert.equal(take.durationSec,4);
 assert.equal(take.move,'orbit');
 assert.equal(take.orbit?.radius,receipt.selected.radius);
 assert.equal(take.lookAtOffset?.z,receipt.selected.targetZ);
 assert.ok(receipt.evaluated.every(x=>Number.isFinite(x.cameraScore)&&Number.isFinite(x.overflow)));
 assert.ok(receipt.evaluated.some(x=>x.radius!==receipt.initial.radius));
 assert.ok(receipt.evaluated.some(x=>x.targetZ!==receipt.initial.targetZ));
});
test('safe candidate envelope rejects unbounded or nonsensical runtime camera sweeps',()=>{
 const spec=composeNativeBattleshipCamera('wide');
 const world=battleshipWorld(),geometries=battleshipGeometry();
 const base={world,geometries,take:spec.cameraTake,viewport:spec.viewport,subject};
 for(const params of [
  {radiusFactors:[1,2.5]}, {radiusFactors:[.4,1]},
  {radiusFactors:[1,NaN]}, {targetZOffsets:[-25,0]},
  {targetZOffsets:[0,Infinity]}, {radiusFactors:[1.1]},
  {targetZOffsets:[4]}
 ]){
  assert.throws(()=>autoFitOrbitCamera({...base,...params}),/world_autofit_candidate_bounds_invalid/);
 }
 assert.throws(()=>autoFitOrbitCamera({...base,take:{...spec.cameraTake,move:'dolly'}}),
  /world_autofit_orbit_required/);
});
test('manual camera override and a factual-fidelity gate remain separate from optical automation',()=>{
 const spec=composeNativeBattleshipCamera('square');
 assert.equal(spec.publishAuthority,false);
 assert.equal(spec.cameraSource,'new_3d_camera_plan_not_post_crop');
 assert.equal(spec.cameraTake.targetEntityId,'ship-hull');
});
