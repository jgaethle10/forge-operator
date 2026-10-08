import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WorldEngineWebGpuClient,
  diffGeometryDigests,
  validateWorldEngineWebGpuClientPayload,
} from './world-engine-webgpu-client.js';
import type { GeometryAsset, WebGpuRenderPlan } from '../systemia/world-engine/webgpu.js';

const geometry:GeometryAsset={
  schema:'evercraft.world-engine.geometry.v1',
  id:'geo:test',
  primitive:'triangles',
  positions:[
    -1,-1,0,
    1,-1,0,
    0,1,0,
  ],
  normals:[
    0,0,1,
    0,0,1,
    0,0,1,
  ],
};

function plan():WebGpuRenderPlan{
  return {
    schema:'evercraft.world-engine.webgpu-plan.v1',
    worldId:'world',
    tick:0,
    timeSec:0,
    sourceVisualFrameDigest:'visual',
    width:640,
    height:360,
    clearColor:{r:0,g:0,b:0},
    viewMatrix:new Array(16).fill(0),
    projectionMatrix:new Array(16).fill(0),
    viewProjectionMatrix:new Array(16).fill(0),
    cameraPosition:[0,0,5],
    exposure:1,
    lights:[],
    draws:[{
      entityId:'entity',
      geometryId:'geo:test',
      materialId:'material',
      vertexCount:3,
      indexCount:0,
      modelMatrix:new Array(16).fill(0),
      normalMatrix:new Array(16).fill(0),
      baseColor:[1,1,1,1],
      metallic:0,
      roughness:1,
      emissive:[0,0,0],
      emissiveIntensity:0,
      materialModel:0,
      alphaMode:'opaque',
      alphaCutoff:-1,
      doubleSided:false,
      pipelineKey:'0:opaque:back',
    }],
    shadingModel:'evercraft-pbr-lite-v1',
    digest:'plan',
  };
}

test('browser WebGPU client validates canonical plan geometry bindings',()=>{
  assert.equal(
    validateWorldEngineWebGpuClientPayload(plan(),[geometry]),
    true,
  );

  assert.throws(
    ()=>validateWorldEngineWebGpuClientPayload(plan(),[]),
    /world_engine_webgpu_client_geometry_missing:geo:test/,
  );

  assert.throws(
    ()=>validateWorldEngineWebGpuClientPayload(plan(),[geometry,geometry]),
    /world_engine_webgpu_client_geometry_duplicate:geo:test/,
  );
});

test('browser WebGPU support probe is bounded to navigator.gpu availability',()=>{
  assert.equal(typeof WorldEngineWebGpuClient.isSupported(),'boolean');
});


test('geometry digest diff preserves unchanged GPU buffer lineage',()=>{
  const first='a'.repeat(64);
  const second='b'.repeat(64);
  const third='c'.repeat(64);
  const fourth='d'.repeat(64);

  assert.deepEqual(
    diffGeometryDigests(
      {hero:first,floor:second,old:fourth},
      {hero:first,floor:third,next:fourth},
    ),
    {
      added:['next'],
      changed:['floor'],
      removed:['old'],
      unchanged:['hero'],
    },
  );
});
