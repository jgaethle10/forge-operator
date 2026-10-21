import test from 'node:test';
import assert from 'node:assert/strict';
import {makeTaperedCabinGeometry,makeLathedFunnelGeometry,
 makeRoundObservationDeckGeometry,makeRadarArrayGeometry,parametricAssetGeometry
} from './parametric-asset-kit.js';
import {historicSilhouetteWorld,historicSilhouetteTake,battleVesselGeometry,VESSELS}
 from './battle-vessel-silhouettes.js';
import {makeBattleMotionDemo} from './battle-motion-demo.js';
import {makeBattleEnvironmentFx} from './battle-environment-fx.js';
import {cinematicFxGeometry,attachCinematicFxToWorld} from './cinematic-environment-fx.js';
import {attachAnimatedOcean,makeAnimatedOceanGrid} from './animated-ocean.js';
import {buildCinematicCameraSequence} from './cinematic-rig.js';
import {validateGeometryAsset} from './webgpu.js';

test('parameterized source-owned tapered, cylindrical, observation, open-radar meshes are real unique GPU triangles',()=>{
 const asset=parametricAssetGeometry();
 assert.equal(asset.length,4);
 assert.equal(new Set(asset.map(a=>a.id)).size,4);
 for(const a of asset){
  assert.equal(validateGeometryAsset(a),true);
  assert.ok(a.positions.length>36);
  assert.equal(a.positions.length,a.normals.length);
  assert.equal(a.uvs!.length,a.positions.length*2/3);
  assert.ok(a.positions.every(Number.isFinite));
  assert.ok(a.normals.every(Number.isFinite));
 }
 assert.ok(makeLathedFunnelGeometry().positions.length>makeTaperedCabinGeometry().positions.length);
 assert.ok(makeRoundObservationDeckGeometry().positions.length>makeTaperedCabinGeometry().positions.length);
 assert.ok(makeRadarArrayGeometry().positions.length>makeTaperedCabinGeometry().positions.length);
 assert.deepEqual(parametricAssetGeometry(),asset);
 assert.throws(()=>makeLathedFunnelGeometry(300),/asset_kit_funnel_segments_invalid/);
 assert.throws(()=>makeRoundObservationDeckGeometry(3),/asset_kit_platform_segments_invalid/);
});

test('ship details actually instantiate 3D sources with independently tagged actors not image cards',()=>{
 const world=historicSilhouetteWorld();
 const geo=battleVesselGeometry();
 assert.equal(geo.filter(g=>g.id.startsWith('owned:kit-')).length,4);
 const originalAssets=new Set(geo.map(g=>g.id));
 assert.equal(geo.length,originalAssets.size);
 for(const ship of VESSELS){
  const prefix=ship.id+'-';
  assert.ok(world.entities.some(e=>e.id===prefix+'bridge-tower'&&e.renderable?.geometryRef==='owned:kit-tapered-cabin'));
  assert.ok(world.entities.some(e=>e.id===prefix+'bridge-top'&&e.renderable?.geometryRef==='owned:kit-observation-deck'));
  assert.ok(world.entities.some(e=>e.id===prefix+'radar-array'&&e.renderable?.geometryRef==='owned:kit-open-radar-array'));
  assert.ok(world.entities.some(e=>e.id===prefix+'aft-deckhouse'&&e.renderable?.geometryRef==='owned:kit-tapered-cabin'));
  assert.ok(world.entities.some(e=>e.id===prefix+'funnel--7.5'||e.id===prefix+'funnel--6.5'||e.id===prefix+'funnel--7'||e.id===prefix+'funnel--8.6'));
  assert.ok(world.entities.some(e=>e.id.startsWith(prefix+'funnel-')&&e.renderable?.geometryRef==='owned:kit-ship-funnel'));
  assert.equal(world.entities.filter(e=>e.id.startsWith(prefix+'bridge-window-')).length,6);
  assert.equal(world.entities.filter(e=>e.id.startsWith(prefix+'bridge-wing-')).length,2);
  assert.equal(world.entities.filter(e=>e.id.startsWith(prefix+'hull-sheer-')).length,2);
 }
 assert.equal(world.metadata?.commercialPublicationAuthorized,false);
 assert.equal(world.metadata?.historicallyAuthenticatedDimensions,false);
});

test('details survive actual keyed object motion, alpha FX and animated ocean in signed native WebGPU plans',()=>{
 const original=historicSilhouetteWorld(),rig=makeBattleMotionDemo(original),fx=makeBattleEnvironmentFx();
 const world=attachAnimatedOcean(attachCinematicFxToWorld(original,rig,fx));
 const sequence=buildCinematicCameraSequence({
  world,actorRig:rig,fxRig:fx,take:historicSilhouetteTake('bismarck_hero'),
  geometries:[...battleVesselGeometry(),...cinematicFxGeometry(),makeAnimatedOceanGrid()],
  viewport:{width:640,height:360}
 });
 assert.equal(sequence.frameCount,97);
 assert.equal(sequence.boundaries.publicationAuthority,false);
 for(const i of [0,30,60,95]){
  const frame=sequence.frames[i];
  assert.ok(frame.renderPlan.draws.some(d=>d.entityId==='bismarck-funnel--6.5'&&d.geometryId==='owned:kit-ship-funnel'));
  assert.ok(frame.renderPlan.draws.some(d=>d.entityId==='bismarck-radar-array'&&d.geometryId==='owned:kit-open-radar-array'));
  assert.ok(frame.renderPlan.draws.some(d=>d.entityId==='ocean'&&d.geometryId==='owned:evercraft-dynamic-ocean-grid'));
  assert.ok(frame.renderPlan.draws.filter(d=>d.entityId.startsWith('vfx-')&&d.alphaMode==='blend').length>20);
  assert.ok(frame.renderPlan.draws.length>190);
 }
 assert.notEqual(sequence.frames[0].renderPlan.digest,sequence.frames[95].renderPlan.digest);
});
