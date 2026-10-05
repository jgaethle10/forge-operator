import test from 'node:test';
import assert from 'node:assert/strict';
import { EvercraftWorldRuntime, type WorldDefinition } from './engine.js';
import {
  compileVisualFrame,
  verifyVisualFrameContract
} from './visual.js';
import {
  compileWebGpuRenderPlan,
  EVERCRAFT_WEBGPU_WGSL,
  validateGeometryAsset,
  type GeometryAsset
} from './webgpu.js';

const triangle:GeometryAsset={
  schema:'evercraft.world-engine.geometry.v1',
  id:'geo:triangle',
  primitive:'triangles',
  positions:[
    -1,-1,0,
    1,-1,0,
    0,1,0
  ],
  normals:[
    0,0,1,
    0,0,1,
    0,0,1
  ]
};

function world():WorldDefinition{
  return {
    schema:'evercraft.world-engine.world.v1',
    id:'webgpu-proof-world',
    version:1,
    tickRateHz:60,
    gravity:{x:0,y:0,z:0},
    visualScene:{
      schema:'evercraft.world-engine.visual-scene.v1',
      initialCameraEntityId:'camera',
      clearColor:{r:.02,g:.03,b:.05},
      materials:[
        {
          id:'metal',
          model:'pbr',
          baseColor:{r:.7,g:.8,b:.9,a:1},
          metallic:.5,
          roughness:.25,
          emissive:{r:.05,g:.02,b:.01},
          emissiveIntensity:2
        }
      ]
    },
    entities:[
      {
        id:'camera',
        transform:{
          position:{x:0,y:0,z:5},
          rotationDeg:{x:0,y:0,z:0}
        },
        camera:{
          projection:{type:'perspective',fovYDeg:60},
          near:.1,
          far:100,
          exposure:1.25,
          layerMask:1
        }
      },
      {
        id:'object',
        transform:{
          position:{x:2,y:0,z:0},
          rotationDeg:{x:0,y:45,z:0},
          scale:{x:1,y:2,z:1}
        },
        renderable:{
          geometryRef:'geo:triangle',
          materialId:'metal',
          layerMask:1,
          castsShadow:true,
          receivesShadow:true
        }
      },
      {
        id:'ambient',
        transform:{position:{x:0,y:0,z:0}},
        light:{
          type:'ambient',
          color:{r:.1,g:.1,b:.15},
          intensity:.5,
          layerMask:1
        }
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
          intensity:3,
          layerMask:1
        }
      },
      {
        id:'point',
        transform:{position:{x:2,y:3,z:4}},
        light:{
          type:'point',
          color:{r:.5,g:.6,b:1},
          intensity:5,
          range:20,
          layerMask:1
        }
      },
      {
        id:'spot',
        transform:{
          position:{x:-2,y:4,z:3},
          rotationDeg:{x:25,y:-20,z:0}
        },
        light:{
          type:'spot',
          color:{r:1,g:.5,b:.2},
          intensity:4,
          range:15,
          innerConeDeg:15,
          outerConeDeg:30,
          layerMask:1
        }
      }
    ]
  };
}

function frame(){
  const runtime=new EvercraftWorldRuntime(world());
  const snapshot=runtime.snapshot();
  return compileVisualFrame(
    snapshot.worldId,
    snapshot.tick,
    snapshot.timeSec,
    runtime.definition.visualScene!,
    snapshot.entities,
    snapshot.cameraRuntime!,
    snapshot.activeEntityIds
  );
}

test('visual frame includes canonical clear color and verifies its digest',()=>{
  const visual=frame();
  assert.deepEqual(visual.clearColor,{r:.02,g:.03,b:.05});
  assert.equal(verifyVisualFrameContract(visual),true);

  const tampered=structuredClone(visual);
  tampered.clearColor.r=.9;
  assert.equal(verifyVisualFrameContract(tampered),false);
});

test('geometry contract validates triangle positions normals and indices',()=>{
  assert.equal(validateGeometryAsset(triangle),true);

  const bad=structuredClone(triangle);
  bad.normals=[0,0,1];
  assert.throws(
    ()=>validateGeometryAsset(bad),
    /webgpu_geometry_normals_invalid/
  );

  const indexed=structuredClone(triangle);
  indexed.indices=[0,1,7];
  assert.throws(
    ()=>validateGeometryAsset(indexed),
    /webgpu_geometry_index_invalid/
  );
});

test('WebGPU render plan is deterministic and binds camera material geometry and all light kinds',()=>{
  const visual=frame();
  const first=compileWebGpuRenderPlan(visual,[triangle],{width:1280,height:720});
  const second=compileWebGpuRenderPlan(visual,[triangle],{width:1280,height:720});

  assert.equal(first.digest,second.digest);
  assert.equal(first.sourceVisualFrameDigest,visual.digest);
  assert.equal(first.shadingModel,'evercraft-pbr-lite-v1');
  assert.deepEqual(first.clearColor,{r:.02,g:.03,b:.05});
  assert.equal(first.draws.length,1);
  assert.equal(first.draws[0].entityId,'object');
  assert.equal(first.draws[0].geometryId,'geo:triangle');
  assert.equal(first.draws[0].materialId,'metal');
  assert.equal(first.draws[0].vertexCount,3);
  assert.equal(first.draws[0].indexCount,0);
  assert.equal(first.draws[0].modelMatrix[12],2);
  assert.equal(first.draws[0].metallic,.5);
  assert.equal(first.draws[0].roughness,.25);
  assert.equal(first.draws[0].pipelineKey,'0:opaque:back');

  assert.deepEqual(first.lights.map(light=>light.entityId),['ambient','point','spot','sun']);
  assert.deepEqual(first.lights.map(light=>light.kind),[0,2,3,1]);
  assert.ok(Math.abs(first.viewMatrix[14]+5)<1e-9);
  assert.equal(first.cameraPosition[2],5);
  assert.equal(first.exposure,1.25);
  assert.equal(first.width,1280);
  assert.equal(first.height,720);
});

test('WebGPU planning rejects a tampered visual frame receipt',()=>{
  const visual=frame();
  visual.camera.exposure=99;
  assert.throws(
    ()=>compileWebGpuRenderPlan(visual,[triangle],{width:800,height:600}),
    /webgpu_visual_frame_digest_invalid/
  );
});

test('WebGPU planning fails closed when a geometry asset is missing',()=>{
  assert.throws(
    ()=>compileWebGpuRenderPlan(frame(),[],{width:800,height:600}),
    /webgpu_geometry_missing:geo:triangle/
  );
});

test('v9 fails closed on texture sampling until texture runtime lands',()=>{
  const visual=frame();
  const material=visual.materials.find(item=>item.id==='metal')!;
  material.textureRefs={baseColor:'texture:metal'};
  // Preserve a valid frame receipt for a frame whose canonical material actually references a texture.
  const runtime=new EvercraftWorldRuntime({
    ...world(),
    visualScene:{
      ...world().visualScene!,
      materials:[{
        ...world().visualScene!.materials[0],
        textureRefs:{baseColor:'texture:metal'}
      }]
    }
  });
  const snapshot=runtime.snapshot();
  const texturedFrame=compileVisualFrame(
    snapshot.worldId,
    snapshot.tick,
    snapshot.timeSec,
    runtime.definition.visualScene!,
    snapshot.entities,
    snapshot.cameraRuntime!,
    snapshot.activeEntityIds
  );

  assert.throws(
    ()=>compileWebGpuRenderPlan(texturedFrame,[triangle],{width:800,height:600}),
    /webgpu_textures_not_yet_supported:metal/
  );
});

test('v9 fails closed rather than silently dropping lights beyond its shader limit',()=>{
  const base=world();
  for(let i=0;i<5;i++){
    base.entities.push({
      id:`extra-light-${i}`,
      transform:{position:{x:i,y:2,z:0}},
      light:{
        type:'point',
        color:{r:1,g:1,b:1},
        intensity:1,
        range:10,
        layerMask:1
      }
    });
  }
  const runtime=new EvercraftWorldRuntime(base);
  const snapshot=runtime.snapshot();
  const visual=compileVisualFrame(
    snapshot.worldId,
    snapshot.tick,
    snapshot.timeSec,
    runtime.definition.visualScene!,
    snapshot.entities,
    snapshot.cameraRuntime!,
    snapshot.activeEntityIds
  );
  assert.equal(visual.lights.length,9);
  assert.throws(
    ()=>compileWebGpuRenderPlan(visual,[triangle],{width:800,height:600}),
    /webgpu_light_limit_exceeded:9/
  );
});

test('owned WGSL contains vertex, fragment, lighting and material paths',()=>{
  assert.match(EVERCRAFT_WEBGPU_WGSL,/@vertex/);
  assert.match(EVERCRAFT_WEBGPU_WGSL,/@fragment/);
  assert.match(EVERCRAFT_WEBGPU_WGSL,/lightData/);
  assert.match(EVERCRAFT_WEBGPU_WGSL,/metallic/);
  assert.match(EVERCRAFT_WEBGPU_WGSL,/roughness/);
  assert.match(EVERCRAFT_WEBGPU_WGSL,/discard/);
});
