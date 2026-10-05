import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EvercraftWorldRuntime,
  replayWorld,
  type WorldDefinition
} from './engine.js';
import {
  compileVisualFrame,
  validateVisualScene
} from './visual.js';
import { compileRenderFrame } from './bridges.js';
import { WorldEntityStore } from './entity-store.js';

function visualWorld():WorldDefinition{
  return {
    schema:'evercraft.world-engine.world.v1',
    id:'visual-proof-world',
    version:1,
    tickRateHz:10,
    gravity:{x:0,y:0,z:0},
    visualScene:{
      schema:'evercraft.world-engine.visual-scene.v1',
      initialCameraEntityId:'camera-a',
      clearColor:{r:.01,g:.02,b:.03},
      materials:[
        {
          id:'metal',
          model:'pbr',
          baseColor:{r:.8,g:.8,b:.85,a:1},
          metallic:1,
          roughness:0,
          doubleSided:false
        },
        {
          id:'glow',
          model:'unlit',
          baseColor:{r:.1,g:.2,b:1,a:.75},
          emissive:{r:.1,g:.2,b:1},
          emissiveIntensity:4,
          alphaMode:'blend'
        }
      ],
      cameraTransitions:[
        {
          id:'a-to-b',
          fromCameraId:'camera-a',
          toCameraId:'camera-b',
          durationSec:1,
          curve:'linear'
        }
      ]
    },
    entities:[
      {
        id:'camera-a',
        transform:{
          position:{x:0,y:2,z:-10},
          rotationDeg:{x:0,y:0,z:0}
        },
        camera:{
          projection:{type:'perspective',fovYDeg:60},
          near:.1,
          far:100,
          exposure:1,
          layerMask:1
        },
        tags:['camera']
      },
      {
        id:'camera-b',
        transform:{
          position:{x:10,y:4,z:-5},
          rotationDeg:{x:0,y:90,z:0}
        },
        camera:{
          projection:{type:'perspective',fovYDeg:90},
          near:.2,
          far:200,
          exposure:2,
          layerMask:1
        },
        tags:['camera']
      },
      {
        id:'hero-mesh',
        transform:{position:{x:0,y:0,z:0}},
        renderable:{
          geometryRef:'geometry:hero',
          materialId:'metal',
          visible:true,
          castsShadow:true,
          receivesShadow:true,
          layerMask:1
        },
        tags:['renderable']
      },
      {
        id:'secret-mesh',
        transform:{position:{x:20,y:0,z:0}},
        renderable:{
          geometryRef:'geometry:secret',
          materialId:'glow',
          visible:true,
          layerMask:2
        },
        tags:['renderable','hidden-layer']
      },
      {
        id:'sun',
        transform:{
          position:{x:0,y:10,z:0},
          rotationDeg:{x:45,y:30,z:0}
        },
        light:{
          type:'directional',
          color:{r:1,g:.95,b:.9},
          intensity:4,
          castsShadow:true,
          layerMask:1
        },
        tags:['light']
      },
      {
        id:'off-layer-light',
        transform:{position:{x:5,y:3,z:0}},
        light:{
          type:'point',
          color:{r:1,g:0,b:0},
          intensity:20,
          range:10,
          layerMask:2
        },
        tags:['light']
      }
    ]
  };
}

test('visual scene validates material bindings, lights, cameras and transitions',()=>{
  const world=visualWorld();
  assert.equal(validateVisualScene(world.visualScene!,world.entities),true);

  const unknownMaterial=visualWorld();
  unknownMaterial.entities.find(entity=>entity.id==='hero-mesh')!.renderable!.materialId='missing';
  assert.throws(
    ()=>new EvercraftWorldRuntime(unknownMaterial),
    /visual_renderable_material_unknown/
  );

  const projectionMismatch=visualWorld();
  projectionMismatch.entities.find(entity=>entity.id==='camera-b')!.camera!.projection={
    type:'orthographic',
    orthoHeight:10
  };
  assert.throws(
    ()=>new EvercraftWorldRuntime(projectionMismatch),
    /visual_camera_transition_projection_mismatch/
  );
});

test('tick-bound camera activation blends deterministic camera state',()=>{
  const runtime=new EvercraftWorldRuntime(visualWorld());

  runtime.step([{
    id:'switch-camera',
    tick:1,
    kind:'activate_camera',
    cameraEntityId:'camera-b',
    transitionId:'a-to-b'
  }]);

  assert.equal(runtime.cameraRuntime!.activeCameraId,'camera-a');
  assert.equal(runtime.cameraRuntime!.transition!.id,'a-to-b');
  assert.ok(Math.abs(runtime.cameraRuntime!.transition!.elapsedSec-.1)<1e-9);

  const frame=compileVisualFrame(
    runtime.definition.id,
    runtime.tick,
    runtime.timeSec,
    runtime.definition.visualScene!,
    runtime.snapshot().entities,
    runtime.cameraRuntime!,
    runtime.activeEntityIds
  );

  assert.equal(frame.camera.cameraId,'camera-b');
  assert.equal(frame.camera.blend!.weight,.1);
  assert.ok(Math.abs(frame.camera.transform.position.x-1)<1e-9);
  assert.ok(Math.abs(frame.camera.transform.position.y-2.2)<1e-9);
  assert.ok(Math.abs((frame.camera.projection as any).fovYDeg-63)<1e-9);
  assert.ok(Math.abs(frame.camera.exposure-1.1)<1e-9);

  runtime.run(9);
  assert.equal(runtime.cameraRuntime!.activeCameraId,'camera-b');
  assert.equal(runtime.cameraRuntime!.transition,null);
});

test('visual frame applies camera layer masks and scene residency deterministically',()=>{
  const runtime=new EvercraftWorldRuntime(visualWorld());
  const first=compileVisualFrame(
    runtime.definition.id,
    runtime.tick,
    runtime.timeSec,
    runtime.definition.visualScene!,
    runtime.snapshot().entities,
    runtime.cameraRuntime!,
    runtime.activeEntityIds
  );

  assert.deepEqual(first.renderables.map(item=>item.entityId),['hero-mesh']);
  assert.deepEqual(first.lights.map(item=>item.entityId),['sun']);
  assert.deepEqual(first.materials.map(item=>item.id),['glow','metal']);

  runtime.setActiveEntityIds(['camera-a','camera-b','sun']);
  const second=compileVisualFrame(
    runtime.definition.id,
    runtime.tick,
    runtime.timeSec,
    runtime.definition.visualScene!,
    runtime.snapshot().entities,
    runtime.cameraRuntime!,
    runtime.activeEntityIds
  );

  assert.deepEqual(second.renderables,[]);
  assert.deepEqual(second.lights.map(item=>item.entityId),['sun']);
  assert.notEqual(first.digest,second.digest);
});

test('provider-neutral render frame embeds canonical visual subframe',()=>{
  const world=visualWorld();
  const runtime=new EvercraftWorldRuntime(world);
  const frame=compileRenderFrame(runtime.snapshot(),'legacy-camera',world);

  assert.ok(frame.visual);
  assert.equal(frame.cameraId,'camera-a');
  assert.deepEqual(frame.visual!.renderables.map(item=>item.entityId),['hero-mesh']);
  assert.deepEqual(frame.visual!.lights.map(item=>item.entityId),['sun']);
});

test('camera inputs participate in replay truth',()=>{
  const inputs=[
    {
      id:'switch-camera',
      tick:2,
      kind:'activate_camera' as const,
      cameraEntityId:'camera-b',
      transitionId:'a-to-b'
    }
  ];
  const receipt=replayWorld(visualWorld(),15,inputs);
  assert.equal(receipt.deterministic,true);
});

test('ECS indexes visual components as first-class world state',()=>{
  const world=visualWorld();
  const store=new WorldEntityStore(world.entities);
  assert.deepEqual(store.idsForComponent('camera'),['camera-a','camera-b']);
  assert.deepEqual(store.idsForComponent('renderable'),['hero-mesh','secret-mesh']);
  assert.deepEqual(store.idsForComponent('light'),['off-layer-light','sun']);
});

test('visual components require a visual scene authority',()=>{
  const world=visualWorld();
  delete world.visualScene;
  assert.throws(
    ()=>new EvercraftWorldRuntime(world),
    /world_visual_scene_required/
  );
});
