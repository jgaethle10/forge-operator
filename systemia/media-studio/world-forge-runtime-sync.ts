import crypto from 'node:crypto';

import {
  applyWorldForgeChangeSet,
  type WorldForgeChangeSet,
} from './world-forge-changeset.js';
import {
  compileWorldForgeToWorldEngine,
  type WorldForgeWorldEngineBridgeReceipt,
} from './world-forge-world-engine.js';
import {
  worldForgeDigest,
  type WorldForgeMutationReceipt,
  type WorldForgeProject,
} from './world-forge.js';
import {
  worldDefinitionDigest,
  type WorldDefinition,
  type WorldEntity,
} from '../world-engine/engine.js';
import {
  applyWorldEditTransaction,
  semanticAssetManifestDigest,
  semanticWorldDigest,
  worldEditTransactionDigest,
  type WorldAssetManifest,
  type WorldEditOperation,
  type WorldEditResult,
  type WorldEditTransaction,
} from '../world-engine/studio-edit.js';
import type { MaterialDefinition } from '../world-engine/visual.js';
import {
  applyGeometryHotReload,
  geometryAssetDigest,
  type GeometryAsset,
  type GeometryHotReloadReceipt,
} from '../world-engine/webgpu.js';

export interface WorldForgeRuntimeSyncReceipt {
  schema:'evercraft.fallen.world-forge-runtime-sync-receipt.v1';
  changeSetId:string;
  changeSetDigest:string;
  projectId:string;
  projectVersionBefore:number;
  projectVersionAfter:number;
  projectDigestBefore:string;
  projectDigestAfter:string;
  worldId:string;
  worldVersionBefore:number;
  worldVersionAfter:number;
  worldDigestBefore:string;
  worldDigestAfter:string;
  assetManifestDigestBefore:string;
  assetManifestDigestAfter:string;
  transactionId:string;
  transactionDigest:string;
  worldEditReceiptDigest:string;
  operationCount:number;
  operationKinds:string[];
  semanticWorldVerified:true;
  semanticAssetsVerified:true;
  geometryAssetCountBefore:number;
  geometryAssetCountAfter:number;
  geometryHotReloadIds:string[];
  geometryRemovedIds:string[];
  webGpuReadyAfter:boolean;
  visualParityAfter:'exact'|'approximate'|'blocked';
  boundaries:{
    publicationAuthorityGranted:false;
    productionRenderAuthorityGranted:false;
    simulationAuthorityGranted:false;
    runtimeMutationUsesWorldEngineEditContract:true;
  };
  digest:string;
}

export interface WorldForgeRuntimeSyncResult {
  schema:'evercraft.fallen.world-forge-runtime-sync.v1';
  nextProject:WorldForgeProject;
  forgeMutationReceipt:WorldForgeMutationReceipt;
  transaction:WorldEditTransaction;
  runtime:WorldEditResult;
  geometries:GeometryAsset[];
  geometryHotReloadReceipts:GeometryHotReloadReceipt[];
  removedGeometryIds:string[];
  bridgeReceiptAfter:WorldForgeWorldEngineBridgeReceipt;
  receipt:WorldForgeRuntimeSyncReceipt;
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

function same(a:unknown,b:unknown){
  return hash(a)===hash(b);
}

function safeActorId(value:string){
  const trimmed=String(value||'').trim();
  if(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(trimmed)) return trimmed;
  return `wf-actor:${hash(trimmed).slice(0,24)}`;
}

function operationId(transactionId:string,index:number,kind:string){
  return `op:${hash(`${transactionId}:${index}:${kind}`).slice(0,28)}`;
}

function withoutTransform(entity:WorldEntity){
  const {transform:_transform,...rest}=entity;
  return rest;
}

function entityDiff(
  before:WorldDefinition,
  after:WorldDefinition,
  transactionId:string,
){
  const operations:WorldEditOperation[]=[];
  const beforeMap=new Map(before.entities.map(entity=>[entity.id,entity]));
  const afterMap=new Map(after.entities.map(entity=>[entity.id,entity]));

  for(const entityId of [...new Set([...beforeMap.keys(),...afterMap.keys()])].sort()){
    const previous=beforeMap.get(entityId);
    const next=afterMap.get(entityId);

    if(!previous&&next){
      operations.push({
        id:'',
        kind:'upsert_entity',
        entity:structuredClone(next),
      });
      continue;
    }
    if(previous&&!next){
      operations.push({
        id:'',
        kind:'remove_entity',
        entityId,
      });
      continue;
    }
    if(!previous||!next||same(previous,next)) continue;

    if(
      same(withoutTransform(previous),withoutTransform(next)) &&
      !same(previous.transform,next.transform)
    ){
      operations.push({
        id:'',
        kind:'set_transform',
        entityId,
        value:structuredClone(next.transform),
      });
    }else{
      operations.push({
        id:'',
        kind:'upsert_entity',
        entity:structuredClone(next),
      });
    }
  }

  return operations.map((operation,index)=>({
    ...operation,
    id:operationId(transactionId,index,operation.kind),
  })) as WorldEditOperation[];
}

function materialDiff(
  before:MaterialDefinition[],
  after:MaterialDefinition[],
  transactionId:string,
  offset:number,
){
  const operations:WorldEditOperation[]=[];
  const beforeMap=new Map(before.map(material=>[material.id,material]));
  const afterMap=new Map(after.map(material=>[material.id,material]));

  for(const id of [...new Set([...beforeMap.keys(),...afterMap.keys()])].sort()){
    const previous=beforeMap.get(id);
    const next=afterMap.get(id);
    if(!previous&&next){
      operations.push({id:'',kind:'upsert_material',material:structuredClone(next)});
    }else if(previous&&!next){
      operations.push({id:'',kind:'remove_material',materialId:id});
    }else if(previous&&next&&!same(previous,next)){
      operations.push({id:'',kind:'upsert_material',material:structuredClone(next)});
    }
  }

  return operations.map((operation,index)=>({
    ...operation,
    id:operationId(transactionId,offset+index,operation.kind),
  })) as WorldEditOperation[];
}

function assetDiff(
  before:WorldAssetManifest,
  after:WorldAssetManifest,
  transactionId:string,
  offset:number,
){
  const upserts:WorldEditOperation[]=[];
  const removals:WorldEditOperation[]=[];
  const beforeMap=new Map(before.assets.map(asset=>[asset.id,asset]));
  const afterMap=new Map(after.assets.map(asset=>[asset.id,asset]));

  for(const id of [...new Set([...beforeMap.keys(),...afterMap.keys()])].sort()){
    const previous=beforeMap.get(id);
    const next=afterMap.get(id);
    if(!previous&&next){
      upserts.push({id:'',kind:'upsert_asset',asset:structuredClone(next)});
    }else if(previous&&!next){
      removals.push({id:'',kind:'remove_asset',assetId:id});
    }else if(
      previous&&next&&
      !same({...previous,revision:1},{...next,revision:1})
    ){
      upserts.push({
        id:'',
        kind:'upsert_asset',
        asset:{
          ...structuredClone(next),
          revision:Math.max(previous.revision+1,next.revision),
        },
      });
    }
  }

  return [...upserts,...removals].map((operation,index)=>({
    ...operation,
    id:operationId(transactionId,offset+index,operation.kind),
  })) as WorldEditOperation[];
}

function compileTransaction(input:{
  beforeWorld:WorldDefinition;
  afterWorld:WorldDefinition;
  beforeAssets:WorldAssetManifest;
  afterAssets:WorldAssetManifest;
  changeSet:WorldForgeChangeSet;
  runtimeWorld:WorldDefinition;
  runtimeAssets:WorldAssetManifest;
}){
  if(
    input.beforeWorld.visualScene?.initialCameraEntityId !==
    input.afterWorld.visualScene?.initialCameraEntityId
  ){
    throw new Error('world_forge_runtime_sync_initial_camera_change_not_supported');
  }
  if(!same(
    input.beforeWorld.visualScene?.cameraTransitions??[],
    input.afterWorld.visualScene?.cameraTransitions??[],
  )){
    throw new Error('world_forge_runtime_sync_camera_transition_change_not_supported');
  }

  const transactionId=`wfedit:${input.changeSet.digest.slice(0,24)}`;
  const assetUpserts=assetDiff(
    input.beforeAssets,
    input.afterAssets,
    transactionId,
    0,
  ).filter(operation=>operation.kind==='upsert_asset');

  const materialOperations=materialDiff(
    input.beforeWorld.visualScene?.materials??[],
    input.afterWorld.visualScene?.materials??[],
    transactionId,
    assetUpserts.length,
  );

  const entityOperations=entityDiff(
    input.beforeWorld,
    input.afterWorld,
    transactionId,
  ).map((operation,index)=>({
    ...operation,
    id:operationId(
      transactionId,
      assetUpserts.length+materialOperations.length+index,
      operation.kind,
    ),
  })) as WorldEditOperation[];

  const clearColorOperations:WorldEditOperation[]=[];
  const beforeColor=input.beforeWorld.visualScene?.clearColor??null;
  const afterColor=input.afterWorld.visualScene?.clearColor??null;
  if(!same(beforeColor,afterColor)){
    clearColorOperations.push({
      id:operationId(
        transactionId,
        assetUpserts.length+materialOperations.length+entityOperations.length,
        'set_clear_color',
      ),
      kind:'set_clear_color',
      value:afterColor?structuredClone(afterColor):null,
    });
  }

  const removedMaterials=materialOperations.filter(
    operation=>operation.kind==='remove_material',
  );
  const upsertMaterials=materialOperations.filter(
    operation=>operation.kind==='upsert_material',
  );
  const assetOperations=assetDiff(
    input.beforeAssets,
    input.afterAssets,
    transactionId,
    0,
  );
  const removedAssets=assetOperations.filter(
    operation=>operation.kind==='remove_asset',
  );

  const operations:WorldEditOperation[]=[];
  const reId=(operation:WorldEditOperation)=>{
    const next={
      ...operation,
      id:operationId(transactionId,operations.length,operation.kind),
    } as WorldEditOperation;
    operations.push(next);
  };

  for(const operation of assetOperations.filter(item=>item.kind==='upsert_asset')) reId(operation);
  for(const operation of upsertMaterials) reId(operation);
  for(const operation of entityOperations) reId(operation);
  for(const operation of clearColorOperations) reId(operation);
  for(const operation of removedMaterials) reId(operation);
  for(const operation of removedAssets) reId(operation);

  if(!operations.length){
    throw new Error('world_forge_runtime_sync_no_runtime_effect');
  }

  const actorKind=input.changeSet.author.kind==='agent'
    ? 'agent'
    : input.changeSet.author.kind==='system'
      ? 'system'
      : 'human';

  const transaction:WorldEditTransaction={
    schema:'evercraft.world-engine.edit-transaction.v1',
    id:transactionId,
    worldId:input.runtimeWorld.id,
    baseWorldDigest:worldDefinitionDigest(input.runtimeWorld),
    baseAssetManifestDigest:input.runtimeAssets.digest,
    actor:{
      kind:actorKind,
      id:safeActorId(input.changeSet.author.id),
    },
    reason:`World Forge ChangeSet ${input.changeSet.id}: ${input.changeSet.title}`,
    operations,
  };

  return transaction;
}

function receiptDigest(
  receipt:Omit<WorldForgeRuntimeSyncReceipt,'digest'>|WorldForgeRuntimeSyncReceipt,
){
  const copy={...(receipt as WorldForgeRuntimeSyncReceipt)} as Record<string,unknown>;
  delete copy.digest;
  return hash(copy);
}

export function verifyWorldForgeRuntimeSyncReceipt(
  receipt:WorldForgeRuntimeSyncReceipt,
){
  if(receipt?.schema!=='evercraft.fallen.world-forge-runtime-sync-receipt.v1') return false;
  return receipt.digest===receiptDigest(receipt);
}

export function syncWorldForgeChangeSetToRuntime(input:{
  project:WorldForgeProject;
  changeSet:WorldForgeChangeSet;
  runtimeWorld:WorldDefinition;
  runtimeAssets:WorldAssetManifest;
}):WorldForgeRuntimeSyncResult{
  const forgeApply=applyWorldForgeChangeSet({
    project:input.project,
    changeSet:input.changeSet,
  });
  if(forgeApply.status!=='applied'||!forgeApply.mutation){
    throw new Error(
      `world_forge_runtime_sync_changeset_blocked:${forgeApply.reason??'unknown'}`,
    );
  }

  const nextProject=forgeApply.mutation.project;
  const beforeBridge=compileWorldForgeToWorldEngine({project:input.project});
  const afterBridge=compileWorldForgeToWorldEngine({project:nextProject});

  if(input.runtimeWorld.id!==beforeBridge.world.id){
    throw new Error('world_forge_runtime_sync_world_id_mismatch');
  }
  if(input.runtimeWorld.version!==input.project.version){
    throw new Error(
      `world_forge_runtime_sync_world_version_mismatch:expected=${input.project.version}:actual=${input.runtimeWorld.version}`,
    );
  }
  if(input.runtimeAssets.worldId!==input.runtimeWorld.id){
    throw new Error('world_forge_runtime_sync_manifest_world_mismatch');
  }

  if(semanticWorldDigest(input.runtimeWorld)!==semanticWorldDigest(beforeBridge.world)){
    throw new Error('world_forge_runtime_sync_runtime_world_semantic_mismatch');
  }
  if(
    semanticAssetManifestDigest(input.runtimeAssets)!==
    semanticAssetManifestDigest(beforeBridge.assets)
  ){
    throw new Error('world_forge_runtime_sync_runtime_assets_semantic_mismatch');
  }

  const transaction=compileTransaction({
    beforeWorld:beforeBridge.world,
    afterWorld:afterBridge.world,
    beforeAssets:beforeBridge.assets,
    afterAssets:afterBridge.assets,
    changeSet:input.changeSet,
    runtimeWorld:input.runtimeWorld,
    runtimeAssets:input.runtimeAssets,
  });

  // World Engine owns the actual live edit application and receipt.
  const runtime=applyWorldEditTransaction(
    input.runtimeWorld,
    input.runtimeAssets,
    transaction,
  );

  const expectedWorldSemantic=semanticWorldDigest(afterBridge.world);
  const actualWorldSemantic=semanticWorldDigest(runtime.world);
  if(actualWorldSemantic!==expectedWorldSemantic){
    throw new Error(
      `world_forge_runtime_sync_after_world_mismatch:expected=${expectedWorldSemantic}:actual=${actualWorldSemantic}`,
    );
  }

  const expectedAssetSemantic=semanticAssetManifestDigest(afterBridge.assets);
  const actualAssetSemantic=semanticAssetManifestDigest(runtime.assets);
  if(actualAssetSemantic!==expectedAssetSemantic){
    throw new Error(
      `world_forge_runtime_sync_after_assets_mismatch:expected=${expectedAssetSemantic}:actual=${actualAssetSemantic}`,
    );
  }

  let geometryState=beforeBridge.geometries.map(item=>structuredClone(item));
  const geometryHotReloadReceipts:GeometryHotReloadReceipt[]=[];
  const beforeGeometryById=new Map(
    beforeBridge.geometries.map(item=>[item.id,item]),
  );
  const afterGeometryIds=new Set(afterBridge.geometries.map(item=>item.id));

  for(const geometry of afterBridge.geometries){
    const previous=beforeGeometryById.get(geometry.id);
    if(previous&&geometryAssetDigest(previous)===geometryAssetDigest(geometry)) continue;
    const reloaded=applyGeometryHotReload(geometryState,geometry);
    geometryState=reloaded.geometries;
    geometryHotReloadReceipts.push(reloaded.receipt);
  }

  const removedGeometryIds=beforeBridge.geometries
    .filter(item=>!afterGeometryIds.has(item.id))
    .map(item=>item.id)
    .sort();

  geometryState=geometryState
    .filter(item=>afterGeometryIds.has(item.id))
    .sort((a,b)=>a.id.localeCompare(b.id));

  const expectedGeometryDigests=afterBridge.geometries
    .map(item=>[item.id,geometryAssetDigest(item)] as const)
    .sort(([a],[b])=>a.localeCompare(b));
  const actualGeometryDigests=geometryState
    .map(item=>[item.id,geometryAssetDigest(item)] as const)
    .sort(([a],[b])=>a.localeCompare(b));
  if(!same(actualGeometryDigests,expectedGeometryDigests)){
    throw new Error('world_forge_runtime_sync_geometry_state_mismatch');
  }

  const projectDigestBefore=worldForgeDigest(input.project);
  const projectDigestAfter=worldForgeDigest(nextProject);
  const transactionDigest=worldEditTransactionDigest(transaction);

  const receiptCore:Omit<WorldForgeRuntimeSyncReceipt,'digest'>={
    schema:'evercraft.fallen.world-forge-runtime-sync-receipt.v1',
    changeSetId:input.changeSet.id,
    changeSetDigest:input.changeSet.digest,
    projectId:input.project.id,
    projectVersionBefore:input.project.version,
    projectVersionAfter:nextProject.version,
    projectDigestBefore,
    projectDigestAfter,
    worldId:runtime.world.id,
    worldVersionBefore:input.runtimeWorld.version,
    worldVersionAfter:runtime.world.version,
    worldDigestBefore:transaction.baseWorldDigest,
    worldDigestAfter:runtime.receipt.afterWorldDigest,
    assetManifestDigestBefore:input.runtimeAssets.digest,
    assetManifestDigestAfter:runtime.assets.digest,
    transactionId:transaction.id,
    transactionDigest,
    worldEditReceiptDigest:runtime.receipt.digest,
    operationCount:transaction.operations.length,
    operationKinds:transaction.operations.map(operation=>operation.kind),
    semanticWorldVerified:true,
    semanticAssetsVerified:true,
    geometryAssetCountBefore:beforeBridge.geometries.length,
    geometryAssetCountAfter:afterBridge.geometries.length,
    geometryHotReloadIds:geometryHotReloadReceipts.map(item=>item.geometryId),
    geometryRemovedIds:removedGeometryIds,
    webGpuReadyAfter:afterBridge.receipt.webGpuReady,
    visualParityAfter:afterBridge.receipt.visualParity,
    boundaries:{
      publicationAuthorityGranted:false,
      productionRenderAuthorityGranted:false,
      simulationAuthorityGranted:false,
      runtimeMutationUsesWorldEngineEditContract:true,
    },
  };

  return {
    schema:'evercraft.fallen.world-forge-runtime-sync.v1',
    nextProject,
    forgeMutationReceipt:forgeApply.mutation.receipt,
    transaction,
    runtime,
    geometries:afterBridge.geometries,
    geometryHotReloadReceipts,
    removedGeometryIds,
    bridgeReceiptAfter:afterBridge.receipt,
    receipt:{
      ...receiptCore,
      digest:receiptDigest(receiptCore),
    },
  };
}
