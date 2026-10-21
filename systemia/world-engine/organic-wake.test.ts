import test from 'node:test';
import assert from 'node:assert/strict';
import {organicFoamGeometry,makeOrganicFoamPatch,organicFoamSelection,ORGANIC_FOAM_PREFIX} from './organic-wake-geometry.js';
import {battleVesselGeometry,historicSilhouetteWorld,historicSilhouetteTake} from './battle-vessel-silhouettes.js';
import {makeBattleMotionDemo} from './battle-motion-demo.js';
import {makeBattleEnvironmentFx} from './battle-environment-fx.js';
import {attachCinematicFxToWorld,animateCinematicFx,cinematicFxGeometry} from './cinematic-environment-fx.js';
import {attachAnimatedOcean,makeAnimatedOceanGrid,sampleAnimatedOceanWave} from './animated-ocean.js';
import {buildCinematicCameraSequence} from './cinematic-rig.js';
import {validateGeometryAsset} from './webgpu.js';

test('owned organic wake source shapes are actual differently curved 3D mesh patches with no V silhouette',()=>{
 const meshes=organicFoamGeometry();
 assert.equal(meshes.length,4);
 assert.equal(new Set(meshes.map(g=>g.id)).size,4);
 for(const [i,g] of meshes.entries()){
  assert.equal(g.id,ORGANIC_FOAM_PREFIX+i);
  assert.equal(validateGeometryAsset(g),true);
  assert.ok(g.positions.length>=360);
  assert.equal(g.positions.length,g.normals.length);
  assert.equal(g.uvs!.length,g.positions.length*2/3);
  assert.ok(g.positions.every(Number.isFinite));
  const uniqueY=new Set(Array.from({length:g.positions.length/3},(_,j)=>g.positions[3*j+1].toFixed(6)));
  assert.ok(uniqueY.size>12);
  const nY=g.normals.filter((_,j)=>j%3===1);
  assert.ok(nY.filter(v=>v>.7).length>nY.length*.75);
  assert.notDeepEqual(makeOrganicFoamPatch((i+1)%4).positions,g.positions);
 }
 assert.throws(()=>makeOrganicFoamPatch(6),/organic_foam_variant_invalid/);
 assert.notEqual(organicFoamSelection('hood-wake',0),organicFoamSelection('hood-wake',1));
 assert.equal(organicFoamSelection('hood-wake',0),organicFoamSelection('hood-wake',0));
 assert.throws(()=>organicFoamSelection('bad!',1),/organic_foam_selection_invalid/);
});

test('real ocean-following wake center obeys current native GPU wave phase and keeps legacy draft unchanged',()=>{
 const original=historicSilhouetteWorld(),rig=makeBattleMotionDemo(original),fx=makeBattleEnvironmentFx();
 const untouched=JSON.stringify(original);
 const prior=attachCinematicFxToWorld(original,rig,fx);
 assert.ok(prior.entities.some(e=>e.renderable?.geometryRef==='owned:fx-cinematic-wake-crest'));
 assert.ok(prior.entities.every(e=>!e.renderable?.geometryRef?.startsWith(ORGANIC_FOAM_PREFIX)));
 const changed=attachAnimatedOcean(attachCinematicFxToWorld(original,rig,fx,{organicWake:true}));
 assert.equal(JSON.stringify(original),untouched);
 assert.equal(changed.metadata?.fxPublicationAuthority,false);
 assert.equal(changed.metadata?.organicFoamStyle,'individually_curved_surface_fragments_not_chevron');
 const foam=changed.entities.filter(e=>e.id.includes('-wake-')&&e.id.startsWith('vfx-'));
 assert.equal(foam.length,48);
 assert.ok(foam.every(e=>e.renderable?.geometryRef?.startsWith(ORGANIC_FOAM_PREFIX)));
 const one=animateCinematicFx(changed,changed.entities,rig,fx,2);
 const two=animateCinematicFx(changed,changed.entities,rig,fx,2.25);
 assert.notEqual(one.evidence.frameDigest,two.evidence.frameDigest);
 for(const e of one.entities.filter(e=>e.id.includes('-wake-')&&e.id.startsWith('vfx-')&&e.renderable?.visible)){
  const p=e.transform.position;
  const expected=-.60+sampleAnimatedOceanWave(p.x,p.z,2).height+.055;
  assert.ok(Math.abs(p.y-expected)<1e-10,e.id+':'+p.y+' != '+expected);
  assert.ok(e.renderable?.materialId.startsWith('vfx-wake-organic-'));
 }
 assert.ok(one.evidence.activeParticles>40);
 assert.throws(()=>attachCinematicFxToWorld(original,rig,fx,{organicWake:'yes'} as never),
  /cinematic_fx_organic_wake_option_invalid/);
});
test('native canonical GPU plans contain zero chevrons, varied curved foam patches, transparent age fades, original ocean',()=>{
 const base=historicSilhouetteWorld(),rig=makeBattleMotionDemo(base),fx=makeBattleEnvironmentFx();
 const world=attachAnimatedOcean(attachCinematicFxToWorld(base,rig,fx,{organicWake:true}));
 const s=buildCinematicCameraSequence({world,actorRig:rig,fxRig:fx,
  take:historicSilhouetteTake('bismarck_hero'),
  geometries:[...battleVesselGeometry(),...cinematicFxGeometry(),
   ...organicFoamGeometry(),makeAnimatedOceanGrid()],viewport:{width:640,height:360}
 });
 assert.equal(s.frameCount,97);
 assert.equal(s.fxRigProof?.publicationAuthority,false);
 for(const i of [0,36,72,95]){
  const draws=s.frames[i].renderPlan.draws;
  const foam=draws.filter(d=>d.geometryId.startsWith(ORGANIC_FOAM_PREFIX));
  assert.ok(foam.length>=25);
  assert.ok(new Set(foam.map(d=>d.geometryId)).size>=3);
  assert.ok(foam.every(d=>d.alphaMode==='blend'&&d.castsShadow===false&&d.baseColor[3]<.5));
  assert.equal(draws.filter(d=>d.geometryId==='owned:fx-cinematic-wake-crest').length,0);
  assert.ok(draws.some(d=>d.entityId==='ocean'&&d.geometryId==='owned:evercraft-dynamic-ocean-grid'));
 }
 assert.notEqual(s.frames[0].renderPlan.digest,s.frames[95].renderPlan.digest);
});
