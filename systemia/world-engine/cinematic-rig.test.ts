import test from 'node:test';
import assert from 'node:assert/strict';
import type {WorldDefinition} from './engine.js';
import type {GeometryAsset} from './webgpu.js';
import {verifyWebGpuRenderPlan} from './webgpu.js';
import {buildCinematicCameraSequence,type CinematicCameraTake} from './cinematic-rig.js';

const triangle:GeometryAsset={
  schema:'evercraft.world-engine.geometry.v1',id:'hero-mesh',primitive:'triangles',
  positions:[-1,-1,0,1,-1,0,0,1,0],
  normals:[0,0,1,0,0,1,0,0,1],
  uvs:[0,0,1,0,.5,1]
};
function world():WorldDefinition{
  return {schema:'evercraft.world-engine.world.v1',
    id:'world-cinematic-motion-proof',version:1,tickRateHz:60,
    gravity:{x:0,y:0,z:0},
    visualScene:{schema:'evercraft.world-engine.visual-scene.v1',
      initialCameraEntityId:'cam',
      materials:[{id:'hero-mat',model:'pbr',baseColor:{r:.8,g:.7,b:.5,a:1},
        metallic:.3,roughness:.4}]},
    entities:[
      {id:'cam',transform:{position:{x:0,y:3,z:8}},camera:{
        projection:{type:'perspective',fovYDeg:55},near:.1,far:200,exposure:1}},
      {id:'hero',transform:{position:{x:0,y:1,z:0}},
        rigidBody:{mass:1,velocity:{x:1,y:0,z:0},linearDamping:0},
        renderable:{geometryRef:'hero-mesh',materialId:'hero-mat'}},
      {id:'sun',transform:{position:{x:0,y:20,z:0}},light:{
        type:'ambient',color:{r:1,g:1,b:1},intensity:.7}}
    ]
  };
}
function take(move:CinematicCameraTake['move']):CinematicCameraTake{
  return {schema:'evercraft.world-engine.cinematic-camera-take.v1',
    id:'real-space-scene-test',cameraEntityId:'cam',targetEntityId:'hero',
    durationSec:1,fps:30,ease:'smootherstep',move,
    ...(move==='dolly'?{startPosition:{x:-3,y:2,z:10},endPosition:{x:0,y:1.5,z:4}}:{}),
    ...(move==='crane'?{startPosition:{x:-2,y:1,z:8},endPosition:{x:2,y:8,z:10}}:{}),
    ...(move==='orbit'?{orbit:{radius:8,startAngleDeg:-55,endAngleDeg:55,startHeight:2,endHeight:3}}:{}),
    ...(move==='follow'?{follow:{startOffset:{x:-5,y:2,z:5},endOffset:{x:-3,y:3,z:4}}}:{})
  };
}
function render(t:CinematicCameraTake,model=world()){
  return buildCinematicCameraSequence({
    world:model,take:t,geometries:[triangle],viewport:{width:640,height:360}
  });
}
test('real canonical PBR/WebGPU plan for every dolly frame, not a diagram of camera paths',()=>{
  const a=render(take('dolly')),b=render(take('dolly'));
  assert.equal(a.frameCount,31);
  assert.equal(a.frames[0].tick,0);
  assert.equal(a.frames[30].tick,60);
  assert.equal(a.frames[30].timeSec,1);
  assert.deepEqual(a.frames[0].cameraPosition,{x:-3,y:2,z:10});
  assert.deepEqual(a.frames[30].cameraPosition,{x:0,y:1.5,z:4});
  assert.equal(a.frames[0].renderPlan.sourceVisualFrameDigest,a.frames[0].frameDigest);
  assert.ok(a.frames.every(frame=>verifyWebGpuRenderPlan(frame.renderPlan)));
  assert.notEqual(a.frames[0].renderPlan.digest,a.frames[15].renderPlan.digest);
  assert.deepEqual(a.frames.map(f=>f.renderPlan.digest),b.frames.map(f=>f.renderPlan.digest));
  assert.equal(a.boundaries.renderingNotPerformed,true);
  assert.equal(a.boundaries.publicationAuthority,false);
});
test('orbital camera respects the actual moving physical target and smooth timing',()=>{
  const a=render(take('orbit'));
  assert.ok(a.frames[0].cameraPosition.x<0);
  assert.ok(a.frames[30].cameraPosition.x>a.frames[0].cameraPosition.x);
  assert.ok(a.frames[30].lookAt.x>a.frames[0].lookAt.x+0.8);
  assert.ok(Math.abs(a.frames[0].cameraRotationDeg.y-a.frames[30].cameraRotationDeg.y)>20);
  assert.ok(a.frames[15].renderPlan.draws.length>0);
});
test('follow camera moves with real fixed-step world body, crane changes height',()=>{
  const f=render(take('follow'));
  const c=render(take('crane'));
  assert.ok(f.frames[30].cameraPosition.x>f.frames[0].cameraPosition.x);
  assert.ok(f.frames[30].lookAt.x>f.frames[0].lookAt.x);
  assert.equal(c.frames[0].cameraPosition.y,1);
  assert.equal(c.frames[30].cameraPosition.y,8);
  assert.equal(c.frames[15].renderPlan.height,360);
});
test('camera respects controlled fov and does not silently mutate the original world',()=>{
  const model=world();
  const before=structuredClone(model);
  const t={...take('dolly'),startFovYDeg:35,endFovYDeg:70};
  const sequence=render(t,model);
  assert.equal(sequence.frames[0].fovYDeg,35);
  assert.equal(sequence.frames[30].fovYDeg,70);
  assert.deepEqual(model,before);
});
test('fails closed on absent assets, bad camera, bad durations, zero subject clearance and unsupported fps',()=>{
  const base=take('dolly');
  for(const patch of [
    {durationSec:9},{fps:25},{fps:24},{cameraEntityId:'missing'},
    {targetEntityId:'missing'},{rollDeg:15},{startFovYDeg:110},
    {startPosition:{x:0,y:1,z:0}},
    {move:'crane',startPosition:{x:0,y:2,z:9},endPosition:{x:0,y:2,z:6}},
  ]){
    assert.throws(()=>render({...base,...patch} as CinematicCameraTake),/cinematic_camera_/);
  }
  assert.throws(()=>buildCinematicCameraSequence({
    world:world(),take:base,geometries:[],viewport:{width:640,height:360}
  }),/webgpu_geometry_missing/);
});
