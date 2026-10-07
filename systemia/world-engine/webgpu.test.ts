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
  verifyWebGpuRenderPlan,
  type GeometryAsset
} from './webgpu.js';
import type { TextureAsset } from './texture.js';

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
  ],
  uvs:[
    0,0,
    1,0,
    .5,1
  ]
};

const baseTexture:TextureAsset={
  schema:'evercraft.world-engine.texture.v1',
  id:'texture:metal-base',
  width:2,
  height:2,
  format:'rgba8unorm-srgb',
  data:[
    255,0,0,255, 0,255,0,255,
    0,0,255,255, 255,255,255,255
  ]
};

const ormTexture:TextureAsset={
  schema:'evercraft.world-engine.texture.v1',
  id:'texture:metal-orm',
  width:1,
  height:1,
  format:'rgba8unorm',
  data:[255,128,64,255]
};

const emissiveTexture:TextureAsset={
  schema:'evercraft.world-engine.texture.v1',
  id:'texture:metal-emissive',
  width:1,
  height:1,
  format:'rgba8unorm-srgb',
  data:[64,32,16,255]
};

const normalTexture:TextureAsset={
  schema:'evercraft.world-engine.texture.v1',
  id:'texture:metal-normal',
  width:1,
  height:1,
  format:'rgba8unorm',
  data:[128,128,255,255]
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

  const badTangent=structuredClone(triangle);
  badTangent.tangents=[
    1,0,0,0,
    1,0,0,1,
    1,0,0,1
  ];
  assert.throws(
    ()=>validateGeometryAsset(badTangent),
    /webgpu_geometry_tangent_handedness_invalid/
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
  assert.equal(first.draws[0].pipelineKey,'0:opaque:back:repeat:repeat:linear:linear');

  assert.deepEqual(first.lights.map(light=>light.entityId),['ambient','point','spot','sun']);
  assert.deepEqual(first.lights.map(light=>light.kind),[0,2,3,1]);
  assert.ok(Math.abs(first.viewMatrix[14]+5)<1e-9);
  assert.equal(first.cameraPosition[2],5);
  assert.equal(first.exposure,1.25);
  assert.equal(first.width,1280);
  assert.equal(first.height,720);
});

test('WebGPU render-plan receipt detects binding tampering before submission',()=>{
  const plan=compileWebGpuRenderPlan(frame(),[triangle],{width:800,height:600});
  assert.equal(verifyWebGpuRenderPlan(plan),true);

  const tampered=structuredClone(plan);
  tampered.draws[0].materialId='tampered-material';
  assert.equal(verifyWebGpuRenderPlan(tampered),false);
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

test('v13 compiles base-color ORM and emissive texture bindings into the GPU plan',()=>{
  const texturedWorld=world();
  texturedWorld.visualScene!.materials[0]={
    ...texturedWorld.visualScene!.materials[0],
    textureRefs:{
      baseColor:baseTexture.id,
      orm:ormTexture.id,
      emissive:emissiveTexture.id
    },
    sampler:{
      addressModeU:'clamp-to-edge',
      addressModeV:'mirror-repeat',
      magFilter:'nearest',
      minFilter:'linear'
    }
  };
  const runtime=new EvercraftWorldRuntime(texturedWorld);
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

  const plan=compileWebGpuRenderPlan(
    texturedFrame,
    [triangle],
    {width:800,height:600},
    [emissiveTexture,baseTexture,ormTexture]
  );

  assert.deepEqual(plan.requiredTextureIds,[
    'texture:metal-base',
    'texture:metal-emissive',
    'texture:metal-orm'
  ]);
  assert.deepEqual(plan.draws[0].textureFlags,[1,1,1,0]);
  assert.deepEqual(plan.draws[0].textureRefs,{
    baseColor:'texture:metal-base',
    orm:'texture:metal-orm',
    emissive:'texture:metal-emissive',
    normal:null
  });
  assert.equal(
    plan.draws[0].pipelineKey,
    '0:opaque:back:clamp-to-edge:mirror-repeat:nearest:linear'
  );
  assert.equal(plan.textures.length,3);
});

test('textured materials require UVs and referenced texture assets',()=>{
  const texturedWorld=world();
  texturedWorld.visualScene!.materials[0]={
    ...texturedWorld.visualScene!.materials[0],
    textureRefs:{baseColor:baseTexture.id}
  };
  const runtime=new EvercraftWorldRuntime(texturedWorld);
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

  const noUv=structuredClone(triangle);
  delete noUv.uvs;
  assert.throws(
    ()=>compileWebGpuRenderPlan(texturedFrame,[noUv],{width:800,height:600},[baseTexture]),
    /webgpu_texture_uvs_required:geo:triangle/
  );
  assert.throws(
    ()=>compileWebGpuRenderPlan(texturedFrame,[triangle],{width:800,height:600},[]),
    /webgpu_texture_missing:texture:metal-base/
  );
});

test('v15 compiles linear normal maps only when tangent-space geometry is present',()=>{
  const texturedWorld=world();
  texturedWorld.visualScene!.materials[0]={
    ...texturedWorld.visualScene!.materials[0],
    textureRefs:{normal:normalTexture.id}
  };
  const runtime=new EvercraftWorldRuntime(texturedWorld);
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

  const tangentGeometry:GeometryAsset={
    ...structuredClone(triangle),
    tangents:[
      1,0,0,1,
      1,0,0,1,
      1,0,0,1
    ]
  };
  const plan=compileWebGpuRenderPlan(
    texturedFrame,
    [tangentGeometry],
    {width:800,height:600},
    [normalTexture]
  );
  assert.deepEqual(plan.requiredTextureIds,[normalTexture.id]);
  assert.deepEqual(plan.draws[0].textureFlags,[0,0,0,1]);
  assert.equal(plan.draws[0].textureRefs.normal,normalTexture.id);

  assert.throws(
    ()=>compileWebGpuRenderPlan(
      texturedFrame,
      [triangle],
      {width:800,height:600},
      [normalTexture]
    ),
    /webgpu_normal_map_tangents_required:metal/
  );

  const srgbNormal={...normalTexture,format:'rgba8unorm-srgb' as const};
  assert.throws(
    ()=>compileWebGpuRenderPlan(
      texturedFrame,
      [tangentGeometry],
      {width:800,height:600},
      [srgbNormal]
    ),
    /webgpu_normal_map_format_must_be_linear:texture:metal-normal/
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
  assert.match(EVERCRAFT_WEBGPU_WGSL,/textureSample/);
  assert.match(EVERCRAFT_WEBGPU_WGSL,/textureFlags/);
  assert.match(EVERCRAFT_WEBGPU_WGSL,/ormTexture/);
  assert.match(EVERCRAFT_WEBGPU_WGSL,/normalTexture/);
  assert.match(EVERCRAFT_WEBGPU_WGSL,/input\.tangent/);
  assert.match(EVERCRAFT_WEBGPU_WGSL,/cross\(N, T\)/);
});
