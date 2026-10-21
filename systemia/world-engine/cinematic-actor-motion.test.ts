import test from 'node:test';
import assert from 'node:assert/strict';
import {historicSilhouetteWorld,battleVesselGeometry,historicSilhouetteTake} from './battle-vessel-silhouettes.js';
import {makeBattleMotionDemo} from './battle-motion-demo.js';
import {animateCinematicEntities,validateActorMotionRig} from './cinematic-actor-motion.js';
import {buildCinematicCameraSequence} from './cinematic-rig.js';

test('actor choreography makes independent 3D hull positions, changing heading and authentic per-frame digest',()=>{
 const world=historicSilhouetteWorld();
 const rig=makeBattleMotionDemo(world);
 const proof=validateActorMotionRig(world,rig);
 assert.equal(proof.actorCount,4);
 assert.ok(proof.entityCount>120);
 assert.equal(proof.publicationAuthority,false);
 const before=animateCinematicEntities(world,world.entities,rig,0);
 const after=animateCinematicEntities(world,world.entities,rig,4);
 assert.notEqual(before.evidence.animationDigest,after.evidence.animationDigest);
 for(const id of ['hood','prince-of-wales','bismarck','prinz-eugen']){
  const a=before.entities.find(e=>e.id===id+'-ship-hull');
  const b=after.entities.find(e=>e.id===id+'-ship-hull');
  assert.ok(a?.renderable&&b?.renderable);
  assert.notDeepEqual(a.transform.position,b.transform.position);
  assert.notEqual(a.transform.rotationDeg?.y,b.transform.rotationDeg?.y);
  assert.deepEqual(a.transform.position,world.entities.find(e=>e.id===id+'-ship-hull')?.transform.position);
  const turret=after.entities.find(e=>e.id===id+'-turret-A'||e.id===id+'-turret-Anton');
  assert.ok(turret?.renderable);
 }
 assert.equal(after.entities.find(e=>e.id==='ocean')?.transform.position.y,0);
 assert.equal(after.entities.find(e=>e.id==='cinema-camera')?.transform.position.x,-90);
 assert.deepEqual(animateCinematicEntities(world,world.entities,rig,4).evidence,after.evidence);
});
test('cinematic actor rig refuses unknown IDs, duplicates, impossible keys, spurious publish authority',()=>{
 const world=historicSilhouetteWorld(),good=makeBattleMotionDemo(world);
 for(const failure of [
  r=>{r.tracks[1].entityIds.push(r.tracks[0].entityIds[0])},
  r=>{r.tracks[0].entityIds.push('absent-entity')},
  r=>{r.tracks[0].keyframes[1].timeSec=-1},
  r=>{r.tracks[0].keyframes[1].displacement.x=1e9},
  r=>{r.tracks[0].roll.amplitudeDeg=10},
  r=>{r.publicationAuthority=true},
  r=>{r.tracks[0].heave.frequencyHz=Infinity},
 ]){
  const candidate=structuredClone(good);failure(candidate);
  assert.throws(()=>validateActorMotionRig(world,candidate),/actor_motion_/);
 }
 assert.throws(()=>animateCinematicEntities(world,world.entities,good,10),/actor_motion_time_invalid/);
});
test('new generic cinematic rig passes original GPU compiler without touching original no-motion plan',()=>{
 const world=historicSilhouetteWorld(),rig=makeBattleMotionDemo(world),geo=battleVesselGeometry();
 const base={world,take:historicSilhouetteTake('bismarck_hero'),
  geometries:geo,viewport:{width:640,height:360}};
 const staticSeq=buildCinematicCameraSequence(base);
 const animatedSeq=buildCinematicCameraSequence({...base,actorRig:rig});
 assert.equal(staticSeq.frameCount,97);
 assert.equal(animatedSeq.frameCount,97);
 assert.equal(staticSeq.actorRigProof,undefined);
 assert.equal(animatedSeq.actorRigProof?.actorCount,4);
 assert.equal(staticSeq.frames[0].renderPlan.digest,animatedSeq.frames[0].renderPlan.digest);
 assert.notEqual(staticSeq.frames[96].renderPlan.digest,animatedSeq.frames[96].renderPlan.digest);
 assert.notEqual(animatedSeq.frames[0].actorMotionDigest,animatedSeq.frames[96].actorMotionDigest);
 assert.ok(animatedSeq.frames.every(f=>f.renderPlan.draws.length>100));
 assert.throws(()=>buildCinematicCameraSequence({...base,actorRig:{...rig,durationSec:3}}),
  /cinematic_camera_actor_rig_duration_mismatch/);
});
