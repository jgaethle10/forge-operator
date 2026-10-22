import test from 'node:test';
import assert from 'node:assert/strict';
import {stageNavalPlatingSourceWorld,isOriginalLoftedNavalHullGeometry,
 NATIVE_PLATING_MATERIAL_FLAG,NATIVE_FOAM_MATERIAL_FLAG,NAVAL_PLATING_SHADER_SOURCE_ID}
 from './native-hull-plating.js';
import {historicSilhouetteWorld,battleVesselGeometry,VESSELS} from './battle-vessel-silhouettes.js';
import {EVERCRAFT_WEBGPU_WGSL,validateGeometryAsset} from './webgpu.js';
import {makeBattleMotionDemo} from './battle-motion-demo.js';
import {makeBattleEnvironmentFx} from './battle-environment-fx.js';
import {attachCinematicFxToWorld,cinematicFxGeometry} from './cinematic-environment-fx.js';
import {organicFoamGeometry} from './organic-wake-geometry.js';
import {attachAnimatedOcean,makeAnimatedOceanGrid} from './animated-ocean.js';
import {buildCinematicCameraSequence} from './cinematic-rig.js';
import {historicSilhouetteTake} from './battle-vessel-silhouettes.js';
test('authored native steel plating and foam are separate, nonoverlapping GPU material markers',()=>{
 assert.equal(NATIVE_PLATING_MATERIAL_FLAG,-3);
 assert.equal(NATIVE_FOAM_MATERIAL_FLAG,-2);
 assert.match(EVERCRAFT_WEBGPU_WGSL,/object\.shadowFlags\.z < -2\.5 && object\.shadowFlags\.z > -3\.5/);
 assert.match(EVERCRAFT_WEBGPU_WGSL,/object\.shadowFlags\.z < -1\.5 && object\.shadowFlags\.z > -2\.5/);
 assert.match(EVERCRAFT_WEBGPU_WGSL,/platePitch|panelLine|strake/);
 assert.match(EVERCRAFT_WEBGPU_WGSL,/input\.uv\.x/);
 assert.match(EVERCRAFT_WEBGPU_WGSL,/input\.uv\.y/);
 assert.match(EVERCRAFT_WEBGPU_WGSL,/roughness = clamp\(roughness \+/);
 assert.doesNotMatch(EVERCRAFT_WEBGPU_WGSL,/textureSample.*plating/);
 assert.equal(isOriginalLoftedNavalHullGeometry('owned:battle-vessel-bismarck-hull'),true);
 assert.equal(isOriginalLoftedNavalHullGeometry('owned:fx-organic-foam-1'),false);
 assert.equal(isOriginalLoftedNavalHullGeometry('owned:battle-vessel-imposter-hull'),false);
});
test('all 4 source hulls use genuine longitudinal UV meshes, and grade is immutable opt-in',()=>{
 const scene=historicSilhouetteWorld(),original=JSON.stringify(scene);
 const graded=stageNavalPlatingSourceWorld(scene),assets=battleVesselGeometry();
 assert.equal(JSON.stringify(scene),original);
 assert.equal(graded.metadata?.navalPlatingShader,NAVAL_PLATING_SHADER_SOURCE_ID);
 assert.equal(graded.metadata?.authenticHistoricalPaint,false);
 assert.equal(graded.metadata?.publicationAuthority,false);
 assert.equal(graded.metadata?.externalImageAssetsRequired,false);
 const ids=VESSELS.map(v=>'owned:battle-vessel-'+v.id+'-hull');
 for(const id of ids){
  const mesh=assets.find(a=>a.id===id);
  assert.ok(mesh);
  assert.equal(validateGeometryAsset(mesh!),true);
  assert.ok(mesh!.uvs!.length>9000);
  const uniqueU=new Set(mesh!.uvs!.filter((_,i)=>i%2===0).map(u=>u.toFixed(3)));
  assert.ok(uniqueU.size>40);
 }
 assert.throws(()=>stageNavalPlatingSourceWorld({ ...scene,entities:scene.entities.filter(e=>e.id!=='hood-ship-hull')}),/plating_requires_four_original/);
});
test('PBR material source flag leaves canonical World Engine frame hashes and 3D moving actors unchanged',()=>{
 const ungraded=historicSilhouetteWorld(),graded=stageNavalPlatingSourceWorld(ungraded);
 const actor=makeBattleMotionDemo(graded),fx=makeBattleEnvironmentFx();
 const film=buildCinematicCameraSequence({
  world:attachAnimatedOcean(attachCinematicFxToWorld(graded,actor,fx,{organicWake:true})),
  actorRig:actor,fxRig:fx,take:historicSilhouetteTake('bismarck_hero'),
  geometries:[...battleVesselGeometry(),...cinematicFxGeometry(),...organicFoamGeometry(),makeAnimatedOceanGrid()],
  viewport:{width:640,height:360}
 });
 assert.equal(film.frameCount,97);
 assert.equal(film.boundaries.publicationAuthority,false);
 for(const i of [0,48,95]){
  const draws=film.frames[i].renderPlan.draws;
  assert.equal(draws.filter(d=>isOriginalLoftedNavalHullGeometry(d.geometryId)).length,4);
  assert.ok(draws.filter(d=>d.geometryId.startsWith('owned:fx-organic-foam-')).length>25);
  assert.equal(draws.find(d=>d.entityId==='ocean')?.vertexCount,112*112*6);
 }
 assert.notEqual(film.frames[0].renderPlan.digest,film.frames[95].renderPlan.digest);
});
