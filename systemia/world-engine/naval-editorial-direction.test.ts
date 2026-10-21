import test from 'node:test';
import assert from 'node:assert/strict';
import {applyNavalEditorialGrade,makeNavalEditorialTake} from './naval-editorial-direction.js';
import {historicSilhouetteWorld,battleVesselGeometry} from './battle-vessel-silhouettes.js';
import {makeBattleMotionDemo} from './battle-motion-demo.js';
import {makeBattleEnvironmentFx} from './battle-environment-fx.js';
import {attachCinematicFxToWorld,cinematicFxGeometry} from './cinematic-environment-fx.js';
import {makeAnimatedOceanGrid,attachAnimatedOcean} from './animated-ocean.js';
import {organicFoamGeometry} from './organic-wake-geometry.js';
import {buildCinematicCameraSequence} from './cinematic-rig.js';
import {auditWebGpuHeroFraming} from './shot-composition.js';
import {auditNavalEditorialForeground} from './naval-foreground-audit.js';

test('low-waterline and telephoto cinema shots are independent source-authored 3D cameras',()=>{
 const low=makeNavalEditorialTake('waterline_tracking');
 const far=makeNavalEditorialTake('compressed_formation');
 assert.notEqual(low.id,far.id);
 assert.equal(low.targetEntityId,'bismarck-ship-hull');
 assert.equal(far.targetEntityId,'hood-ship-hull');
 assert.equal(low.fps,24);
 assert.equal(low.durationSec,4);
 assert.ok(low.orbit!.startHeight<8&&low.orbit!.endHeight<8);
 assert.ok(low.orbit!.radius<far.orbit!.radius*.5);
 assert.ok(low.startFovYDeg!<far.startFovYDeg!+20);
 assert.throws(()=>makeNavalEditorialTake('bogus' as never),/naval_editorial_shot_invalid/);
});
test('editorial lighting is optional, independently authored, and cannot mutate existing camera/scene',()=>{
 const before=historicSilhouetteWorld(),digest=JSON.stringify(before);
 const grade=applyNavalEditorialGrade(before,'waterline_tracking');
 assert.equal(JSON.stringify(before),digest);
 assert.notDeepEqual(grade.visualScene?.atmosphere,before.visualScene?.atmosphere);
 assert.notDeepEqual(grade.visualScene?.colorManagement,before.visualScene?.colorManagement);
 const graded=grade.visualScene?.materials.find(m=>m.id==='battle-bismarck-hull');
 const original=before.visualScene?.materials.find(m=>m.id==='battle-bismarck-hull');
 assert.ok(graded&&original);
 assert.ok(graded.baseColor.r>original.baseColor.r);
 assert.ok(graded.metallic<original.metallic);
 assert.equal(grade.metadata?.historicallyAuthenticatedLighting,false);
 assert.equal(grade.metadata?.publicationAuthority,false);
});
test('source 3D tracking direction builds unique signed original camera/GPU frames alongside full world components',()=>{
 const base=applyNavalEditorialGrade(historicSilhouetteWorld(),'waterline_tracking');
 const rig=makeBattleMotionDemo(base),fx=makeBattleEnvironmentFx();
 const world=attachAnimatedOcean(attachCinematicFxToWorld(base,rig,fx,{organicWake:true}));
 const assets=[...battleVesselGeometry(),...cinematicFxGeometry(),...organicFoamGeometry(),makeAnimatedOceanGrid()];
 const film=buildCinematicCameraSequence({
  world,actorRig:rig,fxRig:fx,geometries:assets,
  take:makeNavalEditorialTake('waterline_tracking'),
  viewport:{width:640,height:360}
 });
 assert.equal(film.frameCount,97);
 assert.equal(film.actorRigProof?.actorCount,4);
 assert.equal(film.fxRigProof?.emitterCount,12);
 assert.equal(film.boundaries.publicationAuthority,false);
 const audits=[];
 for(const i of [0,24,48,72,95]){
  const frame=film.frames[i];
  assert.ok(frame.cameraPosition.y>1);
  const audit=auditWebGpuHeroFraming({plan:frame.renderPlan,
    geometries:assets,subject:{id:'bismarck-shot',
    entityIds:['bismarck-ship-hull','bismarck-bridge-tower','bismarck-mast'],
    minVisibleFraction:.35}});
  assert.notEqual(audit.framingStatus,'subject_offscreen');
  assert.ok(audit.coverage.width>.18);
  if(i===48)assert.equal(audit.framingStatus,'good_technical_framing');
  const foreground=auditNavalEditorialForeground({plan:frame.renderPlan,
    geometries:assets,hero:'bismarck'});
  assert.equal(foreground.estimatedForegroundClear,true);
  assert.equal(foreground.visibleNearfieldObstructions.length,0);
  assert.equal(foreground.compared.length,3);
  assert.ok(frame.renderPlan.draws.filter(d=>d.geometryId.startsWith('owned:fx-organic-foam-')).length>25);
  assert.ok(frame.renderPlan.draws.some(d=>d.entityId==='ocean'&&d.vertexCount===112*112*6));
  audits.push(audit.coverage.area);
 }
 assert.ok(Math.max(...audits)>.045);
 assert.notEqual(film.frames[0].renderPlan.digest,film.frames[95].renderPlan.digest);
});
