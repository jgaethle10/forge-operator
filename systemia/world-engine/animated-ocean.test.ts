import test from 'node:test';
import assert from 'node:assert/strict';
import {historicSilhouetteWorld,battleVesselGeometry,historicSilhouetteTake} from './battle-vessel-silhouettes.js';
import {makeBattleMotionDemo} from './battle-motion-demo.js';
import {makeBattleEnvironmentFx} from './battle-environment-fx.js';
import {cinematicFxGeometry,attachCinematicFxToWorld} from './cinematic-environment-fx.js';
import {buildCinematicCameraSequence} from './cinematic-rig.js';
import {makeAnimatedOceanGrid,attachAnimatedOcean,sampleAnimatedOceanWave,
 OCEAN_WAVE_GEOMETRY_ID,OCEAN_WAVE_AMPLITUDE} from './animated-ocean.js';
import {validateGeometryAsset} from './webgpu.js';
test('owned animated ocean creates true watertight original 3D GPU ocean triangle mesh',()=>{
 const g=makeAnimatedOceanGrid();
 validateGeometryAsset(g);
 assert.equal(g.id,OCEAN_WAVE_GEOMETRY_ID);
 assert.equal(g.positions.length/3,112*112*6);
 assert.equal(g.normals.length,g.positions.length);
 assert.equal(g.uvs!.length,112*112*6*2);
 assert.ok(g.normals.every((n,i)=>n===(i%3===1?1:0)));
 assert.throws(()=>makeAnimatedOceanGrid(181),/animated_ocean_grid_budget_invalid/);
});
test('water surface changes deterministically with time and analytical normals stay normalized',()=>{
 const a=sampleAnimatedOceanWave(11,19,.2);
 const b=sampleAnimatedOceanWave(11,19,1.8);
 assert.notEqual(a.height,b.height);
 assert.notEqual(a.normal.x,b.normal.x);
 assert.deepEqual(sampleAnimatedOceanWave(11,19,.2),a);
 assert.ok(Math.abs(Math.hypot(a.normal.x,a.normal.y,a.normal.z)-1)<1e-12);
 assert.ok(Math.abs(a.height)<OCEAN_WAVE_AMPLITUDE*1.04);
 assert.throws(()=>sampleAnimatedOceanWave(1,2,NaN),/animated_ocean_sample_invalid/);
});
test('dynamic ocean is opt-in and leaves original historic or commercial scenes unchanged',()=>{
 const source=historicSilhouetteWorld();
 const before=JSON.stringify(source);
 const wave=attachAnimatedOcean(source);
 assert.equal(JSON.stringify(source),before);
 assert.equal(source.entities.find(e=>e.id==='ocean')?.renderable?.geometryRef,'owned:procedural-sea');
 assert.equal(wave.entities.find(e=>e.id==='ocean')?.renderable?.geometryRef,OCEAN_WAVE_GEOMETRY_ID);
 assert.deepEqual(wave.entities.find(e=>e.id==='ocean')?.transform.scale,{x:2,y:1,z:2});
 assert.equal(wave.metadata?.animatedOceanSimulationIsCFD,false);
 assert.equal(wave.metadata?.publicationAuthority,false);
 assert.throws(()=>attachAnimatedOcean(wave),/animated_ocean_requires_unmodified_static_sea/);
});
test('moving ocean, four actors and GPU transparent FX all coexist in native signed canonical render plans',()=>{
 const base=historicSilhouetteWorld();
 const actorRig=makeBattleMotionDemo(base),fxRig=makeBattleEnvironmentFx();
 const world=attachAnimatedOcean(attachCinematicFxToWorld(base,actorRig,fxRig));
 const geometry=[...battleVesselGeometry(),...cinematicFxGeometry(),makeAnimatedOceanGrid()];
 const sequence=buildCinematicCameraSequence({
  world,take:historicSilhouetteTake('bismarck_hero'),
  geometries:geometry,actorRig,fxRig,viewport:{width:640,height:360}
 });
 assert.equal(sequence.frameCount,97);
 assert.equal(sequence.actorRigProof?.actorCount,4);
 assert.equal(sequence.fxRigProof?.emitterCount,12);
 for(const sample of [0,48,95]){
  const frame=sequence.frames[sample];
  const sea=frame.renderPlan.draws.find(d=>d.entityId==='ocean');
  assert.equal(sea?.geometryId,OCEAN_WAVE_GEOMETRY_ID);
  assert.equal(sea?.vertexCount,112*112*6);
  assert.ok(frame.renderPlan.draws.filter(d=>d.alphaMode==='blend').length>20);
  assert.ok((frame.activeFxParticles??0)>40);
 }
 assert.notEqual(sequence.frames[0].renderPlan.digest,sequence.frames[95].renderPlan.digest);
 assert.equal(sequence.boundaries.publicationAuthority,false);
});
