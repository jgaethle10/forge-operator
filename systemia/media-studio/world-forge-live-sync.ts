import crypto from 'node:crypto';

import {
  compileWorldForgeToWorldEngine,
  type WorldForgeWorldEngineBridgeResult,
} from './world-forge-world-engine.js';
import type { WorldForgeProject } from './world-forge.js';
import {
  applyWorldEditTransaction,
  semanticAssetManifestDigest,
  semanticWorldDigest,
  verifyWorldEditReceipt,
  type WorldAssetRecord,
  type WorldEditOperation,
  type WorldEditResult,
  type WorldEditTransaction,
} from '../world-engine/studio-edit.js';
import type { GeometryAsset } from '../world-engine/webgpu.js';
import type { MaterialDefinition } from '../world-engine/visual.js';
import type { WorldEntity } from '../world-engine/engine.js';

export interface WorldForgeLiveSyncGeometryDelta {
  added:string[];
  removed:string[];
  changed:string[];
  targetAssets:GeometryAsset[];
}

export interface WorldForgeLiveSyncReceipt {
  schema:'evercraft.fallen.world-forge-live-sync-receipt.v1';
  syncId:string;
  projectId:string;
  fromProjectVersion:number;
  toProjectVersion:number;
  beforeProjectDigest:string;
  afterProjectDigest:string;
  beforeWorldDigest:string;
  targetWorldDigest:string;
  appliedWorldDigest:string;
  beforeAssetManifestDigest:string;
  targetAssetManifestDigest:string;
  appliedAssetManifestDigest:string;
  transactionId:string;
  transactionDigest:string;
  worldEditReceiptDigest:string;
  operationCount:number;
  operationKinds:Record<string,number>;
  changedEntityIds:string[];
  changedMaterialIds:string[];
  changedAssetIds:string[];
  geometryDelta:Omit<WorldForgeLiveSyncGeometryDelta,'targetAssets'>;
  semanticWorldVerified:true;
  semanticAssetsVerified:true;
  geometryPayloadVerified:true;
  boundaries:{
    publicationAuthorityGranted:false;
    productionRenderAuthorityGranted:false;
    simulationAuthorityGranted:false;
    runtimeMigrationRequired:true;
    geometryCacheMutationRequired:boolean;
  };
  digest:string;
}

export interface WorldForgeLiveSyncResult {
  schema:'evercraft.fallen.world-forge-live-sync.v1';
  before:WorldForgeWorldEngineBridgeResult;
  target:WorldForgeWorldEngineBridgeResult;
  transaction:WorldEditTransaction;
  applied:WorldEditResult;
  geometryDelta:WorldForgeLiveSyncGeometryDelta;
  receipt:WorldForgeLiveSyncReceipt;
}

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .filter(([key])=>key!=='digest')
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,item])=>[key,stable(item)])
    );
  }
  return value;
}

function digest(value:unknown){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function same(a:unknown,b:unknown){
  return digest(a)===digest(b);
}

function opId(syncId:string,index:number,kind:string){
  return `wf-sync:${syncId}:${String(index).padStart(4,'0')}:${kind}`.slice(0,159);
}

function mapById<T extends {id:string}>(values:T[]){
  return new Map(values.map(value=>[value.id,value]));
}

function topLevelWorldContract(world:WorldForgeWorldEngineBridgeResult['world']){
  return {
    schema:world.schema,
    id:world.id,
    tickRateHz:world.tickRateHz,
    gravity:world.gravity,
    ground:world.ground??null,
    navigationMeshes:world.navigationMeshes??[],
    visualScene:world.visualScene?{
      schema:world.visualScene.schema,
      initialCameraEntityId:world.visualScene.initialCameraEntityId,
      cameraTransitions:world.visualScene.cameraTransitions??[],
      clearColor:world.visualScene.clearColor??null,
    }:null,
    audioScene:world.audioScene??null,
    metadata:world.metadata??{},
  };
}

function entityOperations(
  before:WorldEntity[],
  target:WorldEntity[],
  startIndex:number,
  syncId:string,
){
  const operations:WorldEditOperation[]=[];
  let index=startIndex;
  const beforeById=mapById(before);
  const targetById=mapById(target);

  for(const entityId of [...new Set([...beforeById.keys(),...targetById.keys()])].sort()){
    const oldEntity=beforeById.get(entityId);
    const nextEntity=targetById.get(entityId);

    if(!oldEntity&&nextEntity){
      operations.push({
        id:opId(syncId,index++,'add-entity'),
        kind:'upsert_entity',
        entity:structuredClone(nextEntity),
      });
      continue;
    }
    if(oldEntity&&!nextEntity){
      operations.push({
        id:opId(syncId,index++,'remove-entity'),
        kind:'remove_entity',
        entityId,
      });
      continue;
    }
    if(!oldEntity||!nextEntity||same(oldEntity,nextEntity)) continue;

    const oldWithoutTransform={...structuredClone(oldEntity),transform:undefined};
    const nextWithoutTransform={...structuredClone(nextEntity),transform:undefined};
    if(same(oldWithoutTransform,nextWithoutTransform)){
      operations.push({
        id:opId(syncId,index++,'transform'),
        kind:'set_transform',
        entityId,
        value:structuredClone(nextEntity.transform),
      });
    }else{
      operations.push({
        id:opId(syncId,index++,'upsert-entity'),
        kind:'upsert_entity',
        entity:structuredClone(nextEntity),
      });
    }
  }
  return {operations,nextIndex:index};
}

function materialOperations(
  before:MaterialDefinition[],
  target:MaterialDefinition[],
  startIndex:number,
  syncId:string,
){
  const upserts:WorldEditOperation[]=[];
  const removals:WorldEditOperation[]=[];
  let index=startIndex;
  const beforeById=mapById(before);
  const targetById=mapById(target);

  for(const materialId of [...new Set([...beforeById.keys(),...targetById.keys()])].sort()){
    const oldMaterial=beforeById.get(materialId);
    const nextMaterial=targetById.get(materialId);
    if(!oldMaterial&&nextMaterial){
      upserts.push({
        id:opId(syncId,index++,'add-material'),
        kind:'upsert_material',
        material:structuredClone(nextMaterial),
      });
    }else if(oldMaterial&&!nextMaterial){
      removals.push({
        id:opId(syncId,index++,'remove-material'),
        kind:'remove_material',
        materialId,
      });
    }else if(oldMaterial&&nextMaterial&&!same(oldMaterial,nextMaterial)){
      upserts.push({
        id:opId(syncId,index++,'upsert-material'),
        kind:'upsert_material',
        material:structuredClone(nextMaterial),
      });
    }
  }
  return {upserts,removals,nextIndex:index};
}

function assetOperations(
  before:WorldAssetRecord[],
  target:WorldAssetRecord[],
  startIndex:number,
  syncId:string,
){
  const operations:WorldEditOperation[]=[];
  let index=startIndex;
  const beforeById=mapById(before);
  const targetById=mapById(target);

  for(const assetId of [...new Set([...beforeById.keys(),...targetById.keys()])].sort()){
    const oldAsset=beforeById.get(assetId);
    const nextAsset=targetById.get(assetId);

    if(!oldAsset&&nextAsset){
      operations.push({
        id:opId(syncId,index++,'add-asset'),
        kind:'upsert_asset',
        asset:structuredClone(nextAsset),
      });
      continue;
    }
    if(oldAsset&&!nextAsset){
      operations.push({
        id:opId(syncId,index++,'remove-asset'),
        kind:'remove_asset',
        assetId,
      });
      continue;
    }
    if(!oldAsset||!nextAsset) continue;

    const oldSemantic={...structuredClone(oldAsset),revision:1};
    const nextSemantic={...structuredClone(nextAsset),revision:1};
    if(!same(oldSemantic,nextSemantic)){
      operations.push({
        id:opId(syncId,index++,'upsert-asset'),
        kind:'upsert_asset',
        asset:{
          ...structuredClone(nextAsset),
          revision:Math.max(oldAsset.revision+1,nextAsset.revision),
        },
      });
    }
  }
  return {operations,nextIndex:index};
}

function geometryDelta(
  before:GeometryAsset[],
  target:GeometryAsset[],
):WorldForgeLiveSyncGeometryDelta{
  const beforeById=mapById(before);
  const targetById=mapById(target);
  const added:string[]=[];
  const removed:string[]=[];
  const changed:string[]=[];

  for(const id of [...new Set([...beforeById.keys(),...targetById.keys()])].sort()){
    const oldGeometry=beforeById.get(id);
    const nextGeometry=targetById.get(id);
    if(!oldGeometry&&nextGeometry) added.push(id);
    else if(oldGeometry&&!nextGeometry) removed.push(id);
    else if(oldGeometry&&nextGeometry&&!same(oldGeometry,nextGeometry)) changed.push(id);
  }

  return {
    added,
    removed,
    changed,
    targetAssets:structuredClone(target),
  };
}

function operationKindCounts(operations:WorldEditOperation[]){
  const counts:Record<string,number>={};
  for(const operation of operations){
    counts[operation.kind]=(counts[operation.kind]??0)+1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a],[b])=>a.localeCompare(b)));
}

function receiptDigest(
  receipt:Omit<WorldForgeLiveSyncReceipt,'digest'>|WorldForgeLiveSyncReceipt,
){
  return digest(receipt);
}

export function verifyWorldForgeLiveSyncReceipt(receipt:WorldForgeLiveSyncReceipt){
  if(receipt?.schema!=='evercraft.fallen.world-forge-live-sync-receipt.v1') return false;
  return receipt.digest===receiptDigest(receipt);
}

export function compileWorldForgeLiveSync(input:{
  syncId:string;
  beforeProject:WorldForgeProject;
  afterProject:WorldForgeProject;
  actor:{kind:'human'|'agent'|'code'|'system';id:string};
  reason?:string;
  tickRateHz?:number;
}):WorldForgeLiveSyncResult{
  const syncId=String(input.syncId||'').trim();
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,90}$/.test(syncId)){
    throw new Error('world_forge_live_sync_id_invalid');
  }
  if(input.beforeProject.id!==input.afterProject.id){
    throw new Error('world_forge_live_sync_project_id_mismatch');
  }
  if(input.afterProject.version<=input.beforeProject.version){
    throw new Error('world_forge_live_sync_version_not_advanced');
  }
  if(input.afterProject.version!==input.beforeProject.version+1){
    throw new Error('world_forge_live_sync_revision_gap_requires_full_recompile');
  }

  const before=compileWorldForgeToWorldEngine({
    project:input.beforeProject,
    tickRateHz:input.tickRateHz,
  });
  const target=compileWorldForgeToWorldEngine({
    project:input.afterProject,
    tickRateHz:input.tickRateHz,
  });

  if(before.world.id!==target.world.id){
    throw new Error('world_forge_live_sync_world_id_mismatch');
  }
  if(!same(topLevelWorldContract(before.world),topLevelWorldContract(target.world))){
    throw new Error('world_forge_live_sync_top_level_contract_change_requires_full_recompile');
  }

  let index=0;
  const materials=materialOperations(
    before.world.visualScene?.materials??[],
    target.world.visualScene?.materials??[],
    index,
    syncId,
  );
  index=materials.nextIndex;

  const entities=entityOperations(
    before.world.entities,
    target.world.entities,
    index,
    syncId,
  );
  index=entities.nextIndex;

  const assets=assetOperations(
    before.assets.assets,
    target.assets.assets,
    index,
    syncId,
  );

  const operations=[
    ...materials.upserts,
    ...assets.operations.filter(operation=>operation.kind==='upsert_asset'),
    ...entities.operations,
    ...materials.removals,
    ...assets.operations.filter(operation=>operation.kind==='remove_asset'),
  ];

  if(!operations.length){
    throw new Error('world_forge_live_sync_no_runtime_effect');
  }

  const transaction:WorldEditTransaction={
    schema:'evercraft.world-engine.edit-transaction.v1',
    id:`wf-sync:${syncId}`,
    worldId:before.world.id,
    baseWorldDigest:before.receipt.worldDigest,
    baseAssetManifestDigest:before.assets.digest,
    actor:structuredClone(input.actor),
    reason:input.reason??`World Forge live sync ${input.beforeProject.version} → ${input.afterProject.version}`,
    operations,
  };

  const applied=applyWorldEditTransaction(
    before.world,
    before.assets,
    transaction,
  );

  if(!verifyWorldEditReceipt(applied.receipt)){
    throw new Error('world_forge_live_sync_world_edit_receipt_invalid');
  }

  const targetWorldSemantic=semanticWorldDigest(target.world);
  const appliedWorldSemantic=semanticWorldDigest(applied.world);
  if(targetWorldSemantic!==appliedWorldSemantic){
    throw new Error(
      `world_forge_live_sync_semantic_world_mismatch:target=${targetWorldSemantic}:actual=${appliedWorldSemantic}`,
    );
  }

  const targetAssetsSemantic=semanticAssetManifestDigest(target.assets);
  const appliedAssetsSemantic=semanticAssetManifestDigest(applied.assets);
  if(targetAssetsSemantic!==appliedAssetsSemantic){
    throw new Error(
      `world_forge_live_sync_semantic_assets_mismatch:target=${targetAssetsSemantic}:actual=${appliedAssetsSemantic}`,
    );
  }

  const geometry=geometryDelta(before.geometries,target.geometries);
  for(const geometryId of [...geometry.added,...geometry.changed]){
    if(!geometry.targetAssets.some(asset=>asset.id===geometryId)){
      throw new Error(`world_forge_live_sync_geometry_payload_missing:${geometryId}`);
    }
  }

  const receiptCore:Omit<WorldForgeLiveSyncReceipt,'digest'>={
    schema:'evercraft.fallen.world-forge-live-sync-receipt.v1',
    syncId,
    projectId:input.beforeProject.id,
    fromProjectVersion:input.beforeProject.version,
    toProjectVersion:input.afterProject.version,
    beforeProjectDigest:before.receipt.projectDigest,
    afterProjectDigest:target.receipt.projectDigest,
    beforeWorldDigest:before.receipt.worldDigest,
    targetWorldDigest:target.receipt.worldDigest,
    appliedWorldDigest:applied.receipt.afterWorldDigest,
    beforeAssetManifestDigest:before.assets.digest,
    targetAssetManifestDigest:target.assets.digest,
    appliedAssetManifestDigest:applied.assets.digest,
    transactionId:transaction.id,
    transactionDigest:applied.receipt.transactionDigest,
    worldEditReceiptDigest:applied.receipt.digest,
    operationCount:operations.length,
    operationKinds:operationKindCounts(operations),
    changedEntityIds:[...applied.receipt.changedEntityIds],
    changedMaterialIds:[...applied.receipt.changedMaterialIds],
    changedAssetIds:[...applied.receipt.changedAssetIds],
    geometryDelta:{
      added:[...geometry.added],
      removed:[...geometry.removed],
      changed:[...geometry.changed],
    },
    semanticWorldVerified:true,
    semanticAssetsVerified:true,
    geometryPayloadVerified:true,
    boundaries:{
      publicationAuthorityGranted:false,
      productionRenderAuthorityGranted:false,
      simulationAuthorityGranted:false,
      runtimeMigrationRequired:true,
      geometryCacheMutationRequired:
        geometry.added.length>0||
        geometry.removed.length>0||
        geometry.changed.length>0,
    },
  };

  const receipt:WorldForgeLiveSyncReceipt={
    ...receiptCore,
    digest:receiptDigest(receiptCore),
  };

  return {
    schema:'evercraft.fallen.world-forge-live-sync.v1',
    before,
    target,
    transaction,
    applied,
    geometryDelta:geometry,
    receipt,
  };
}
