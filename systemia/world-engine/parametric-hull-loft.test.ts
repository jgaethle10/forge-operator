import test from 'node:test';
import assert from 'node:assert/strict';
import {makeHullLoft,sampleHullLoft} from './parametric-hull-loft.js';
import {historicSilhouetteWorld,battleVesselGeometry,historicSilhouetteTake,VESSELS}
 from './battle-vessel-silhouettes.js';
import {makeBattleMotionDemo} from './battle-motion-demo.js';
import {makeBattleEnvironmentFx} from './battle-environment-fx.js';
import {attachCinematicFxToWorld,cinematicFxGeometry} from './cinematic-environment-fx.js';
import {organicFoamGeometry} from './organic-wake-geometry.js';
import {makeAnimatedOceanGrid,attachAnimatedOcean} from './animated-ocean.js';
import {buildCinematicCameraSequence} from './cinematic-rig.js';
import {validateGeometryAsset} from './webgpu.js';

test('source-owned 48 station curved hull, real camber and smooth finite normals for four distinct classes',()=>{
 const meshes=VESSELS.map(v=>{
  const profile=v.profile==='slender-heavy-cruiser'?'slender':
    v.profile==='long-battlecruiser'?'battlecruiser':
    v.profile==='compact-battleship'?'full':'balanced';
  const spec={id:v.id,profile,length:v.length,beam:v.beam,sections:48} as const;
  const mesh=makeHullLoft(spec);
  assert.equal(validateGeometryAsset(mesh),true);
  assert.equal(mesh.id,'owned:battle-vessel-'+v.id+'-hull');
  assert.equal(mesh.positions.length,48*(10+8)*6*3+2*10*3*3);
  assert.equal(mesh.positions.length,mesh.normals.length);
  assert.equal(mesh.uvs!.length,mesh.positions.length*2/3);
  assert.ok(mesh.positions.every(Number.isFinite));
  assert.ok(mesh.normals.every(Number.isFinite));
  const n=mesh.normals.length/3;
  for(let i=0;i<n;i++){
   assert.ok(Math.abs(Math.hypot(...mesh.normals.slice(i*3,i*3+3))-1)<1e-6);
  }
  const stern=sampleHullLoft(spec,0),mid=sampleHullLoft(spec,.5),bow=sampleHullLoft(spec,1);
  assert.ok(mid.halfBeam>stern.halfBeam*2);
  assert.ok(mid.halfBeam>bow.halfBeam*30);
  assert.ok(bow.deckHeight>mid.deckHeight);
  const yMax=Math.max(...mesh.positions.filter((_,i)=>i%3===1));
  assert.ok(yMax>mid.deckHeight);
  return mesh;
 });
 assert.equal(new Set(meshes.map(m=>m.id)).size,4);
 assert.notDeepEqual(meshes[0].positions,meshes[1].positions);
 assert.notDeepEqual(meshes[2].positions,meshes[3].positions);
 assert.throws(()=>makeHullLoft({id:'unsafe',profile:'balanced',length:40,beam:4,sections:180}),
  /hull_loft_spec_invalid/);
 assert.throws(()=>sampleHullLoft({id:'normal',profile:'full',length:39,beam:4},1.4),
  /hull_loft_sample_invalid/);
});

test('full scene creates only genuine parametric loft hull assets and original geometry IDs',()=>{
 const world=historicSilhouetteWorld();
 const assets=battleVesselGeometry();
 const ids=new Set(assets.map(a=>a.id));
 assert.equal(ids.size,assets.length);
 assert.equal(world.metadata?.validatedNavalPlans,false);
 assert.equal(world.metadata?.historicallyAuthenticatedDimensions,false);
 for(const v of VESSELS){
  const hull=world.entities.find(e=>e.id===v.id+'-ship-hull');
  const mesh=assets.find(a=>a.id===hull?.renderable?.geometryRef);
  assert.ok(mesh,'missing source loft for '+v.id);
  assert.ok((mesh.positions.length/3)>4000);
  assert.equal(hull?.tags?.includes('visual_reconstruction_unverified'),true);
 }
});
test('native signed GPU plans retain 4 moving loft hulls plus feathered foam, moving water and 3D source detail',()=>{
 const original=historicSilhouetteWorld(),rig=makeBattleMotionDemo(original),fx=makeBattleEnvironmentFx();
 const world=attachAnimatedOcean(attachCinematicFxToWorld(original,rig,fx,{organicWake:true}));
 const camera=buildCinematicCameraSequence({
  world,actorRig:rig,fxRig:fx,take:historicSilhouetteTake('bismarck_hero'),
  viewport:{width:640,height:360},
  geometries:[...battleVesselGeometry(),...cinematicFxGeometry(),...organicFoamGeometry(),
   makeAnimatedOceanGrid()]
 });
 assert.equal(camera.frameCount,97);
 for(const i of [0,48,95]){
  const p=camera.frames[i].renderPlan;
  for(const v of VESSELS){
   const draw=p.draws.find(d=>d.entityId===v.id+'-ship-hull');
   assert.equal(draw?.geometryId,'owned:battle-vessel-'+v.id+'-hull');
   assert.ok((draw?.vertexCount??0)>4000);
  }
  assert.ok(p.draws.filter(d=>d.geometryId.startsWith('owned:fx-organic-foam-')).length>25);
  assert.equal(p.draws.filter(d=>d.geometryId==='owned:fx-cinematic-wake-crest').length,0);
  assert.equal(p.draws.find(d=>d.entityId==='ocean')?.vertexCount,112*112*6);
 }
 assert.equal(camera.boundaries.publicationAuthority,false);
 assert.notEqual(camera.frames[0].renderPlan.digest,camera.frames[95].renderPlan.digest);
});
