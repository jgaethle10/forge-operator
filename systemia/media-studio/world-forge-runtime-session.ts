import crypto from 'node:crypto';

import type {
  Euler3,
  Vec3 as ForgeVec3,
  WorldForgeProject,
  WorldForgeTransform,
} from './world-forge.js';
import {
  compileWorldForgeToWorldEngine,
  worldEngineEulerToWorldForge,
  worldEngineVectorToWorldForge,
  type WorldForgeWorldEngineBridgeResult,
} from './world-forge-world-engine.js';
import {
  EvercraftWorldRuntime,
  verifyWorldSnapshot,
  worldDefinitionDigest,
  type WorldDefinition,
  type WorldInput,
  type WorldSnapshot,
} from '../world-engine/engine.js';
import { semanticWorldDigest } from '../world-engine/studio-edit.js';

export interface WorldForgeRuntimeOverlayRow {
  nodeId:string;
  entityId:string;
  transform:WorldForgeTransform;
}

export interface WorldForgeRuntimeStepReceipt {
  schema:'evercraft.fallen.world-forge-runtime-step-receipt.v1';
  projectId:string;
  projectVersion:number;
  worldId:string;
  worldVersion:number;
  worldDefinitionDigest:string;
  snapshotDigestBefore:string;
  snapshotDigestAfter:string;
  tickBefore:number;
  tickAfter:number;
  ticksAdvanced:number;
  timeSecBefore:number;
  timeSecAfter:number;
  inputCount:number;
  overlayCount:number;
  deterministic:true;
  boundaries:{
    publicationAuthorityGranted:false;
    productionRenderAuthorityGranted:false;
    externalRealWorldAuthorityGranted:false;
  };
  digest:string;
}

export interface WorldForgeRuntimeSessionState {
  schema:'evercraft.fallen.world-forge-runtime-session-state.v1';
  bridge:WorldForgeWorldEngineBridgeResult;
  snapshot:WorldSnapshot;
  overlay:WorldForgeRuntimeOverlayRow[];
}

export interface WorldForgeRuntimeStepResult {
  schema:'evercraft.fallen.world-forge-runtime-step.v1';
  snapshot:WorldSnapshot;
  overlay:WorldForgeRuntimeOverlayRow[];
  receipt:WorldForgeRuntimeStepReceipt;
}

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,item])=>[key,stable(item)])
    );
  }
  return value;
}

function hash(value:unknown){
  return crypto.createHash('sha256').update(
    typeof value==='string'?value:JSON.stringify(stable(value)),
  ).digest('hex');
}

function receiptDigest(
  receipt:Omit<WorldForgeRuntimeStepReceipt,'digest'>|WorldForgeRuntimeStepReceipt,
){
  const copy={...(receipt as WorldForgeRuntimeStepReceipt)} as Record<string,unknown>;
  delete copy.digest;
  return hash(copy);
}

function forgeScaleFromEngine(scale:ForgeVec3|undefined):ForgeVec3{
  const value=scale??{x:1,y:1,z:1};
  return {
    x:value.x,
    y:value.z,
    z:value.y,
  };
}

function forgeRotationFromEngine(rotation:Euler3|undefined):Euler3{
  return worldEngineEulerToWorldForge(rotation??{x:0,y:0,z:0});
}

export function projectWorldEngineSnapshotToWorldForge(input:{
  project:WorldForgeProject;
  bridge:WorldForgeWorldEngineBridgeResult;
  snapshot:WorldSnapshot;
}):WorldForgeRuntimeOverlayRow[]{
  if(!verifyWorldSnapshot(input.snapshot)){
    throw new Error('world_forge_runtime_overlay_snapshot_digest_invalid');
  }
  if(input.snapshot.worldId!==input.bridge.world.id){
    throw new Error('world_forge_runtime_overlay_world_mismatch');
  }
  if(input.snapshot.worldVersion!==input.bridge.world.version){
    throw new Error(
      `world_forge_runtime_overlay_version_mismatch:expected=${input.bridge.world.version}:actual=${input.snapshot.worldVersion}`,
    );
  }
  if(input.snapshot.definitionDigest!==worldDefinitionDigest(input.bridge.world)){
    throw new Error('world_forge_runtime_overlay_definition_mismatch');
  }

  const runtimeById=new Map(
    input.snapshot.entities.map(entity=>[entity.id,entity]),
  );

  return input.bridge.receipt.nodeEntityMap
    .map(mapping=>{
      const entity=runtimeById.get(mapping.entityId);
      if(!entity) return null;
      return {
        nodeId:mapping.nodeId,
        entityId:mapping.entityId,
        transform:{
          position:worldEngineVectorToWorldForge(
            entity.transform.position,
            input.project.unitScaleMeters,
          ),
          rotationDeg:forgeRotationFromEngine(entity.transform.rotationDeg),
          scale:forgeScaleFromEngine(entity.transform.scale),
        },
      };
    })
    .filter((row):row is WorldForgeRuntimeOverlayRow=>Boolean(row))
    .sort((a,b)=>a.nodeId.localeCompare(b.nodeId));
}

function assertRuntimeMatchesProject(input:{
  project:WorldForgeProject;
  runtimeWorld:WorldDefinition;
  snapshot:WorldSnapshot;
}){
  const bridge=compileWorldForgeToWorldEngine({project:input.project});

  if(input.runtimeWorld.id!==bridge.world.id){
    throw new Error(
      `world_forge_runtime_session_world_id_mismatch:expected=${bridge.world.id}:actual=${input.runtimeWorld.id}`,
    );
  }
  if(input.runtimeWorld.version!==bridge.world.version){
    throw new Error(
      `world_forge_runtime_session_world_version_mismatch:expected=${bridge.world.version}:actual=${input.runtimeWorld.version}`,
    );
  }
  if(
    semanticWorldDigest(input.runtimeWorld)!==
    semanticWorldDigest(bridge.world)
  ){
    throw new Error('world_forge_runtime_session_world_semantic_mismatch');
  }
  if(!verifyWorldSnapshot(input.snapshot)){
    throw new Error('world_forge_runtime_session_snapshot_digest_invalid');
  }
  if(input.snapshot.worldId!==input.runtimeWorld.id){
    throw new Error('world_forge_runtime_session_snapshot_world_mismatch');
  }
  if(input.snapshot.worldVersion!==input.runtimeWorld.version){
    throw new Error('world_forge_runtime_session_snapshot_version_mismatch');
  }
  if(
    input.snapshot.definitionDigest!==
    worldDefinitionDigest(input.runtimeWorld)
  ){
    throw new Error('world_forge_runtime_session_snapshot_definition_mismatch');
  }

  return bridge;
}

export function initializeWorldForgeRuntimeSession(input:{
  project:WorldForgeProject;
}):WorldForgeRuntimeSessionState{
  const bridge=compileWorldForgeToWorldEngine({project:input.project});
  const runtime=new EvercraftWorldRuntime(bridge.world);
  const snapshot=runtime.snapshot();
  const overlay=projectWorldEngineSnapshotToWorldForge({
    project:input.project,
    bridge,
    snapshot,
  });

  return {
    schema:'evercraft.fallen.world-forge-runtime-session-state.v1',
    bridge,
    snapshot,
    overlay,
  };
}

export function stepWorldForgeRuntimeSession(input:{
  project:WorldForgeProject;
  runtimeWorld:WorldDefinition;
  snapshot:WorldSnapshot;
  ticks:number;
  inputs?:WorldInput[];
}):WorldForgeRuntimeStepResult{
  if(!Number.isInteger(input.ticks)||input.ticks<0||input.ticks>600){
    throw new Error('world_forge_runtime_session_ticks_invalid');
  }
  if((input.inputs?.length??0)>5000){
    throw new Error('world_forge_runtime_session_input_limit');
  }

  const bridge=assertRuntimeMatchesProject({
    project:input.project,
    runtimeWorld:input.runtimeWorld,
    snapshot:input.snapshot,
  });
  const runtime=new EvercraftWorldRuntime(input.runtimeWorld);
  runtime.restoreSnapshot(input.snapshot);

  const before=input.snapshot;
  const after=input.ticks===0
    ? runtime.snapshot()
    : runtime.run(input.ticks,input.inputs??[]);

  if(!verifyWorldSnapshot(after)){
    throw new Error('world_forge_runtime_session_result_snapshot_invalid');
  }
  if(after.tick!==before.tick+input.ticks){
    throw new Error(
      `world_forge_runtime_session_tick_mismatch:expected=${before.tick+input.ticks}:actual=${after.tick}`,
    );
  }

  const overlay=projectWorldEngineSnapshotToWorldForge({
    project:input.project,
    bridge,
    snapshot:after,
  });

  const receiptCore:Omit<WorldForgeRuntimeStepReceipt,'digest'>={
    schema:'evercraft.fallen.world-forge-runtime-step-receipt.v1',
    projectId:input.project.id,
    projectVersion:input.project.version,
    worldId:input.runtimeWorld.id,
    worldVersion:input.runtimeWorld.version,
    worldDefinitionDigest:worldDefinitionDigest(input.runtimeWorld),
    snapshotDigestBefore:before.digest,
    snapshotDigestAfter:after.digest,
    tickBefore:before.tick,
    tickAfter:after.tick,
    ticksAdvanced:input.ticks,
    timeSecBefore:before.timeSec,
    timeSecAfter:after.timeSec,
    inputCount:input.inputs?.length??0,
    overlayCount:overlay.length,
    deterministic:true,
    boundaries:{
      publicationAuthorityGranted:false,
      productionRenderAuthorityGranted:false,
      externalRealWorldAuthorityGranted:false,
    },
  };

  return {
    schema:'evercraft.fallen.world-forge-runtime-step.v1',
    snapshot:after,
    overlay,
    receipt:{
      ...receiptCore,
      digest:receiptDigest(receiptCore),
    },
  };
}

export function verifyWorldForgeRuntimeStepReceipt(
  receipt:WorldForgeRuntimeStepReceipt,
){
  if(receipt?.schema!=='evercraft.fallen.world-forge-runtime-step-receipt.v1'){
    return false;
  }
  return receipt.digest===receiptDigest(receipt);
}
