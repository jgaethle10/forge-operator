import test from 'node:test';
import assert from 'node:assert/strict';
import {historicSilhouetteWorld,battleVesselGeometry,historicSilhouetteTake} from './battle-vessel-silhouettes.js';
import {makeBattleMotionDemo} from './battle-motion-demo.js';
import {makeBattleEnvironmentFx} from './battle-environment-fx.js';
import {validateCinematicFxRig,attachCinematicFxToWorld,
 animateCinematicFx,cinematicFxGeometry} from './cinematic-environment-fx.js';
import {buildCinematicCameraSequence} from './cinematic-rig.js';
import {validateGeometryAsset} from './webgpu.js';

test('reusable 3D environmental FX attaches bounded separate GPU geometry with no old-scene mutation',()=>{
 const original=historicSilhouetteWorld(),rig=makeBattleMotionDemo(original),fx=makeBattleEnvironmentFx();
 const digest=JSON.stringify(original);
 const proof=validateCinematicFxRig(original,rig,fx);
 assert.equal(proof.emitterCount,12);
 assert.equal(proof.particleBudget,104);
 assert.equal(proof.originalGeometryAssets,2);
 const shapes=cinematicFxGeometry();
 assert.equal(shapes.length,2);
 for(const g of shapes){validateGeometryAsset(g);assert.ok(g.positions.length>200);}
 const augmented=attachCinematicFxToWorld(original,rig,fx);
 assert.equal(JSON.stringify(original),digest);
 assert.equal(augmented.entities.length-original.entities.length,proof.particleBudget);
 assert.equal(augmented.entities.filter(e=>e.id.startsWith('vfx-')).length,104);
 assert.ok(augmented.entities.filter(e=>e.id.startsWith('vfx-')).every(e=>e.renderable?.visible===false));
 assert.equal(augmented.metadata?.fxPublicationAuthority,false);
 assert.equal(new Set(augmented.entities.map(e=>e.id)).size,augmented.entities.length);
 assert.throws(()=>attachCinematicFxToWorld(augmented,rig,fx),/cinematic_fx_already_attached/);
});
test('particles are deterministic over time, spawned from independently keyframed moving actors',()=>{
 const original=historicSilhouetteWorld(),rig=makeBattleMotionDemo(original),fx=makeBattleEnvironmentFx();
 const scene=attachCinematicFxToWorld(original,rig,fx);
 const start=animateCinematicFx(scene,scene.entities,rig,fx,0);
 const end=animateCinematicFx(scene,scene.entities,rig,fx,3.5);
 assert.equal(start.evidence.particleBudget,104);
 assert.ok(start.evidence.activeParticles>40);
 assert.ok(end.evidence.activeParticles>40);
 assert.notEqual(start.evidence.frameDigest,end.evidence.frameDigest);
 assert.equal(end.evidence.frameDigest,animateCinematicFx(scene,scene.entities,rig,fx,3.5).evidence.frameDigest);
 for(const v of ['hood','prince-of-wales','bismarck','prinz-eugen']){
  const a=start.entities.find(e=>e.id==='vfx-'+v+'-wake-00');
  const b=end.entities.find(e=>e.id==='vfx-'+v+'-wake-00');
  assert.ok(a?.renderable&&b?.renderable);
  const side=start.entities.filter(e=>e.id.startsWith('vfx-'+v));
  assert.equal(side.length,26);
  assert.ok(side.some(e=>e.renderable?.visible));
  assert.notDeepEqual(a.transform.position,b.transform.position);
 }
 assert.equal(scene.entities.find(e=>e.id==='ocean')?.renderable?.visible,undefined);
 assert.throws(()=>animateCinematicFx(scene,scene.entities,rig,fx,Infinity),/cinematic_fx_time/);
});
test('untrusted FX authoring fails closed on duplicate emitters, rogue anchors, budget and publication',()=>{
 const scene=historicSilhouetteWorld(),actors=makeBattleMotionDemo(scene);
 const cases=[
  fx=>{fx.publicationAuthority=true},
  fx=>{fx.emitters[1].id=fx.emitters[0].id},
  fx=>{fx.emitters[0].actorId='actor-not-on-stage'},
  fx=>{fx.emitters[0].count=1000},
  fx=>{fx.emitters[0].lifetimeSec=20},
  fx=>{fx.emitters[0].anchorLocal.x=Infinity},
  fx=>{fx.emitters[0].driftLocal.x=100},
  fx=>{fx.emitters[0].phase=-1}
 ];
 for(const mutate of cases){
  const fx=makeBattleEnvironmentFx();mutate(fx);
  assert.throws(()=>validateCinematicFxRig(scene,actors,fx),/cinematic_fx_/);
 }
});
test('actual canonical camera, visual and WebGPU plans contain dynamic GPU FX draws and changing digests',()=>{
 const original=historicSilhouetteWorld(),rig=makeBattleMotionDemo(original),fx=makeBattleEnvironmentFx();
 const scene=attachCinematicFxToWorld(original,rig,fx);
 const film=buildCinematicCameraSequence({
  world:scene,actorRig:rig,fxRig:fx,take:historicSilhouetteTake('bismarck_hero'),
  geometries:[...battleVesselGeometry(),...cinematicFxGeometry()],viewport:{width:640,height:360}
 });
 assert.equal(film.frameCount,97);
 assert.equal(film.fxRigProof?.particleBudget,104);
 assert.equal(film.actorRigProof?.actorCount,4);
 assert.equal(film.fxRigProof?.publicationAuthority,false);
 const first=film.frames[0],last=film.frames[95],mid=film.frames[48];
 assert.notEqual(first.environmentalFxDigest,last.environmentalFxDigest);
 assert.ok((mid.activeFxParticles??0)>40);
 const drawn=mid.renderPlan.draws.filter(d=>d.entityId.startsWith('vfx-'));
 assert.ok(drawn.length>40);
 assert.ok(drawn.some(d=>d.geometryId==='owned:fx-cinematic-3d-puff'));
 assert.ok(drawn.some(d=>d.geometryId==='owned:fx-cinematic-wake-crest'));
 assert.ok(drawn.every(d=>d.castsShadow===false));
 assert.notEqual(first.renderPlan.digest,mid.renderPlan.digest);
});
