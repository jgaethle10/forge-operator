import crypto from 'node:crypto';
import { EvercraftWorldRuntime, type WorldDefinition } from './engine.js';
import { compileVisualFrame } from './visual.js';
import {
  compileWebGpuRenderPlan,
  EVERCRAFT_WEBGPU_WGSL,
  type GeometryAsset
} from './webgpu.js';

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value && typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,item])=>[key,stable(item)])
    );
  }
  return value;
}

function sha256(value:unknown){
  return crypto.createHash('sha256')
    .update(typeof value==='string'?value:JSON.stringify(stable(value)))
    .digest('hex');
}

export const WORLD_ENGINE_REFERENCE_GEOMETRY:GeometryAsset={
  schema:'evercraft.world-engine.geometry.v1',
  id:'geometry:reference-triangle',
  primitive:'triangles',
  positions:[
    -2,-2,0,
    2,-2,0,
    0,2,0
  ],
  normals:[
    0,0,1,
    0,0,1,
    0,0,1
  ]
};

export function worldEngineReferenceWorld():WorldDefinition{
  return {
    schema:'evercraft.world-engine.world.v1',
    id:'evercraft-world-engine-reference-frame',
    version:1,
    tickRateHz:60,
    gravity:{x:0,y:0,z:0},
    visualScene:{
      schema:'evercraft.world-engine.visual-scene.v1',
      initialCameraEntityId:'camera',
      clearColor:{r:.02,g:.03,b:.05},
      materials:[{
        id:'reference-unlit',
        model:'unlit',
        baseColor:{r:.25,g:.5,b:.75,a:1},
        doubleSided:true
      }]
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
          exposure:1,
          layerMask:1
        }
      },
      {
        id:'reference-triangle',
        transform:{position:{x:0,y:0,z:0}},
        renderable:{
          geometryRef:WORLD_ENGINE_REFERENCE_GEOMETRY.id,
          materialId:'reference-unlit',
          visible:true,
          layerMask:1
        }
      }
    ]
  };
}

export function buildWorldEngineReferenceFramePackage(){
  const world=worldEngineReferenceWorld();
  const runtime=new EvercraftWorldRuntime(world);
  const snapshot=runtime.snapshot();
  const visualFrame=compileVisualFrame(
    snapshot.worldId,
    snapshot.tick,
    snapshot.timeSec,
    runtime.definition.visualScene!,
    snapshot.entities,
    snapshot.cameraRuntime!,
    snapshot.activeEntityIds
  );
  const plan=compileWebGpuRenderPlan(
    visualFrame,
    [WORLD_ENGINE_REFERENCE_GEOMETRY],
    {width:64,height:64}
  );

  const core={
    schema:'evercraft.world-engine.webgpu-reference-frame.v1' as const,
    worldId:world.id,
    worldDefinitionDigest:runtime.definitionDigest,
    snapshotDigest:snapshot.digest,
    visualFrameDigest:visualFrame.digest,
    planDigest:plan.digest,
    shaderDigest:sha256(EVERCRAFT_WEBGPU_WGSL),
    plan,
    geometries:[WORLD_ENGINE_REFERENCE_GEOMETRY],
    wgsl:EVERCRAFT_WEBGPU_WGSL,
    expected:{
      center:{
        x:32,
        y:32,
        rgba:[64,128,191,255]
      },
      background:{
        x:2,
        y:2,
        rgba:[5,8,13,255]
      },
      tolerance:2
    }
  };
  return {...core,digest:sha256(core)};
}
