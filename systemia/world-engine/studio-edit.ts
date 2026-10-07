import crypto from 'node:crypto';
import {
  validateWorldDefinition,
  worldDefinitionDigest,
  type TransformComponent,
  type WorldDefinition,
  type WorldEntity
} from './engine.js';
import type { ColorRGB, MaterialDefinition } from './visual.js';

export type AssetKind='geometry'|'texture'|'audio'|'animation'|'image'|'video'|'other';
export type AssetRightsState='owned'|'licensed'|'public_domain'|'restricted'|'unknown';

export interface WorldAssetRecord {
  id:string;
  kind:AssetKind;
  revision:number;
  sha256:string;
  uri:string;
  contentType?:string;
  provenance:{
    sourceRef:string;
    rightsState:AssetRightsState;
    license:string;
    attribution?:string;
  };
  metadata?:Record<string,unknown>;
}

export interface WorldAssetManifest {
  schema:'evercraft.world-engine.asset-manifest.v1';
  worldId:string;
  revision:number;
  assets:WorldAssetRecord[];
  digest:string;
}

export type WorldEditActorKind='human'|'agent'|'code'|'system';

export type WorldEditOperation =
  | {
      id:string;
      kind:'upsert_entity';
      entity:WorldEntity;
    }
  | {
      id:string;
      kind:'remove_entity';
      entityId:string;
    }
  | {
      id:string;
      kind:'set_transform';
      entityId:string;
      value:TransformComponent;
    }
  | {
      id:string;
      kind:'set_property';
      entityId:string;
      key:string;
      value:unknown;
    }
  | {
      id:string;
      kind:'delete_property';
      entityId:string;
      key:string;
    }
  | {
      id:string;
      kind:'upsert_material';
      material:MaterialDefinition;
    }
  | {
      id:string;
      kind:'remove_material';
      materialId:string;
    }
  | {
      id:string;
      kind:'set_clear_color';
      value:ColorRGB|null;
    }
  | {
      id:string;
      kind:'upsert_asset';
      asset:WorldAssetRecord;
    }
  | {
      id:string;
      kind:'remove_asset';
      assetId:string;
    };

export interface WorldEditTransaction {
  schema:'evercraft.world-engine.edit-transaction.v1';
  id:string;
  worldId:string;
  baseWorldDigest:string;
  baseAssetManifestDigest:string;
  actor:{
    kind:WorldEditActorKind;
    id:string;
  };
  reason?:string;
  operations:WorldEditOperation[];
}

export interface WorldEditReceipt {
  schema:'evercraft.world-engine.edit-receipt.v1';
  transactionId:string;
  transactionDigest:string;
  worldId:string;
  beforeWorldDigest:string;
  afterWorldDigest:string;
  beforeWorldVersion:number;
  afterWorldVersion:number;
  beforeAssetManifestDigest:string;
  afterAssetManifestDigest:string;
  beforeAssetManifestRevision:number;
  afterAssetManifestRevision:number;
  operationIds:string[];
  changedEntityIds:string[];
  changedMaterialIds:string[];
  changedAssetIds:string[];
  hotReloadAssetIds:string[];
  inverseTransaction:WorldEditTransaction;
  digest:string;
}

export interface WorldEditResult {
  world:WorldDefinition;
  assets:WorldAssetManifest;
  receipt:WorldEditReceipt;
}

function clone<T>(value:T):T{
  return structuredClone(value);
}

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value && typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,val])=>[key,stable(val)])
    );
  }
  return value;
}

function digest(value:unknown){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function safeId(value:string,label:string){
  const id=String(value||'').trim();
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(id)){
    throw new Error(`world_edit_${label}_invalid`);
  }
  return id;
}

function validateSha256(value:string,label:string){
  if(!/^[a-f0-9]{64}$/i.test(String(value||''))){
    throw new Error(`world_edit_${label}_sha256_invalid`);
  }
}

function assertPlainKey(value:string){
  const key=String(value||'').trim();
  if(!key || key.length>160 || key==='__proto__' || key==='prototype' || key==='constructor'){
    throw new Error('world_edit_property_key_invalid');
  }
  return key;
}

export function validateWorldAssetRecord(asset:WorldAssetRecord){
  safeId(asset?.id,'asset_id');
  if(!['geometry','texture','audio','animation','image','video','other'].includes(asset.kind)){
    throw new Error(`world_edit_asset_kind_invalid:${asset.id}`);
  }
  if(!Number.isInteger(asset.revision) || asset.revision<1){
    throw new Error(`world_edit_asset_revision_invalid:${asset.id}`);
  }
  validateSha256(asset.sha256,`asset_${asset.id}`);
  if(!String(asset.uri||'').trim()) throw new Error(`world_edit_asset_uri_missing:${asset.id}`);
  if(!String(asset.provenance?.sourceRef||'').trim()){
    throw new Error(`world_edit_asset_source_missing:${asset.id}`);
  }
  if(!['owned','licensed','public_domain','restricted','unknown'].includes(asset.provenance?.rightsState)){
    throw new Error(`world_edit_asset_rights_invalid:${asset.id}`);
  }
  if(!String(asset.provenance?.license||'').trim()){
    throw new Error(`world_edit_asset_license_missing:${asset.id}`);
  }
  return true;
}

function manifestCore(
  worldId:string,
  revision:number,
  assets:WorldAssetRecord[]
){
  return {
    schema:'evercraft.world-engine.asset-manifest.v1' as const,
    worldId,
    revision,
    assets:[...assets]
      .sort((a,b)=>a.id.localeCompare(b.id))
      .map(clone)
  };
}

export function createWorldAssetManifest(
  worldId:string,
  assets:WorldAssetRecord[]=[],
  revision=1
):WorldAssetManifest{
  safeId(worldId,'manifest_world_id');
  if(!Number.isInteger(revision)||revision<1) throw new Error('world_edit_manifest_revision_invalid');
  const ids=new Set<string>();
  for(const asset of assets){
    validateWorldAssetRecord(asset);
    if(ids.has(asset.id)) throw new Error(`world_edit_asset_duplicate:${asset.id}`);
    ids.add(asset.id);
  }
  const core=manifestCore(worldId,revision,assets);
  return {...core,digest:digest(core)};
}

export function verifyWorldAssetManifest(manifest:WorldAssetManifest){
  if(manifest?.schema!=='evercraft.world-engine.asset-manifest.v1') return false;
  try{
    const rebuilt=createWorldAssetManifest(manifest.worldId,manifest.assets,manifest.revision);
    return rebuilt.digest===manifest.digest;
  }catch{
    return false;
  }
}

function transactionCore(transaction:WorldEditTransaction){
  return {
    schema:transaction.schema,
    id:transaction.id,
    worldId:transaction.worldId,
    baseWorldDigest:transaction.baseWorldDigest,
    baseAssetManifestDigest:transaction.baseAssetManifestDigest,
    actor:clone(transaction.actor),
    reason:transaction.reason || null,
    operations:clone(transaction.operations)
  };
}

export function worldEditTransactionDigest(transaction:WorldEditTransaction){
  if(transaction?.schema!=='evercraft.world-engine.edit-transaction.v1'){
    throw new Error('world_edit_transaction_schema_invalid');
  }
  return digest(transactionCore(transaction));
}

function validateTransaction(transaction:WorldEditTransaction){
  if(transaction?.schema!=='evercraft.world-engine.edit-transaction.v1'){
    throw new Error('world_edit_transaction_schema_invalid');
  }
  safeId(transaction.id,'transaction_id');
  safeId(transaction.worldId,'transaction_world_id');
  validateSha256(transaction.baseWorldDigest,'base_world_digest');
  validateSha256(transaction.baseAssetManifestDigest,'base_asset_manifest_digest');
  if(!['human','agent','code','system'].includes(transaction.actor?.kind)){
    throw new Error('world_edit_actor_kind_invalid');
  }
  safeId(transaction.actor?.id,'actor_id');
  if(!Array.isArray(transaction.operations)||transaction.operations.length<1){
    throw new Error('world_edit_operations_missing');
  }
  if(transaction.operations.length>10_000) throw new Error('world_edit_operation_limit_exceeded');
  const ids=new Set<string>();
  for(const operation of transaction.operations){
    safeId(operation?.id,'operation_id');
    if(ids.has(operation.id)) throw new Error(`world_edit_operation_duplicate:${operation.id}`);
    ids.add(operation.id);
  }
  return true;
}

function entityIndex(world:WorldDefinition){
  return new Map(world.entities.map((entity,index)=>[entity.id,index]));
}

function materialIndex(world:WorldDefinition){
  return new Map(
    (world.visualScene?.materials || []).map((material,index)=>[material.id,index])
  );
}

function assetIndex(manifest:WorldAssetManifest){
  return new Map(manifest.assets.map((asset,index)=>[asset.id,index]));
}

function cloneWithoutRuntime<T>(value:T){
  return clone(value);
}

function assertEntityExists(world:WorldDefinition,entityId:string){
  const entity=world.entities.find(item=>item.id===entityId);
  if(!entity) throw new Error(`world_edit_entity_missing:${entityId}`);
  return entity;
}

function assertMaterialExists(world:WorldDefinition,materialId:string){
  const material=world.visualScene?.materials.find(item=>item.id===materialId);
  if(!material) throw new Error(`world_edit_material_missing:${materialId}`);
  return material;
}

function assertAssetExists(manifest:WorldAssetManifest,assetId:string){
  const asset=manifest.assets.find(item=>item.id===assetId);
  if(!asset) throw new Error(`world_edit_asset_missing:${assetId}`);
  return asset;
}

function referencedMaterialIds(world:WorldDefinition){
  return new Set(
    world.entities
      .map(entity=>entity.renderable?.materialId)
      .filter((value):value is string=>Boolean(value))
  );
}

function reverseOperationId(transactionId:string,index:number){
  return `undo:${transactionId}:${String(index).padStart(5,'0')}`;
}

export function applyWorldEditTransaction(
  sourceWorld:WorldDefinition,
  sourceManifest:WorldAssetManifest,
  transaction:WorldEditTransaction
):WorldEditResult{
  validateWorldDefinition(sourceWorld);
  if(!verifyWorldAssetManifest(sourceManifest)){
    throw new Error('world_edit_asset_manifest_digest_invalid');
  }
  validateTransaction(transaction);

  if(sourceManifest.worldId!==sourceWorld.id){
    throw new Error('world_edit_manifest_world_mismatch');
  }
  if(transaction.worldId!==sourceWorld.id){
    throw new Error('world_edit_transaction_world_mismatch');
  }

  const beforeWorldDigest=worldDefinitionDigest(sourceWorld);
  if(transaction.baseWorldDigest!==beforeWorldDigest){
    throw new Error('world_edit_base_world_digest_mismatch');
  }
  if(transaction.baseAssetManifestDigest!==sourceManifest.digest){
    throw new Error('world_edit_base_asset_manifest_digest_mismatch');
  }

  const world=cloneWithoutRuntime(sourceWorld);
  const assets=sourceManifest.assets.map(clone);
  const inverse:WorldEditOperation[]=[];
  const changedEntities=new Set<string>();
  const changedMaterials=new Set<string>();
  const changedAssets=new Set<string>();
  const hotReloadAssets=new Set<string>();
  let worldChanged=false;
  let assetsChanged=false;

  for(const operation of transaction.operations){
    if(operation.kind==='upsert_entity'){
      safeId(operation.entity?.id,'entity_id');
      const indexes=entityIndex(world);
      const existingIndex=indexes.get(operation.entity.id);
      if(existingIndex===undefined){
        world.entities.push(clone(operation.entity));
        inverse.push({
          id:'',
          kind:'remove_entity',
          entityId:operation.entity.id
        });
      }else{
        const previous=clone(world.entities[existingIndex]);
        world.entities[existingIndex]=clone(operation.entity);
        inverse.push({
          id:'',
          kind:'upsert_entity',
          entity:previous
        });
      }
      changedEntities.add(operation.entity.id);
      worldChanged=true;
      continue;
    }

    if(operation.kind==='remove_entity'){
      const indexes=entityIndex(world);
      const existingIndex=indexes.get(operation.entityId);
      if(existingIndex===undefined) throw new Error(`world_edit_entity_missing:${operation.entityId}`);
      const previous=clone(world.entities[existingIndex]);
      world.entities.splice(existingIndex,1);
      inverse.push({
        id:'',
        kind:'upsert_entity',
        entity:previous
      });
      changedEntities.add(operation.entityId);
      worldChanged=true;
      continue;
    }

    if(operation.kind==='set_transform'){
      const entity=assertEntityExists(world,operation.entityId);
      const previous=clone(entity.transform);
      entity.transform=clone(operation.value);
      inverse.push({
        id:'',
        kind:'set_transform',
        entityId:operation.entityId,
        value:previous
      });
      changedEntities.add(operation.entityId);
      worldChanged=true;
      continue;
    }

    if(operation.kind==='set_property'){
      const key=assertPlainKey(operation.key);
      const entity=assertEntityExists(world,operation.entityId);
      entity.properties ||= {};
      const existed=Object.prototype.hasOwnProperty.call(entity.properties,key);
      const previous=clone(entity.properties[key]);
      entity.properties[key]=clone(operation.value);
      inverse.push(existed
        ? {
            id:'',
            kind:'set_property',
            entityId:operation.entityId,
            key,
            value:previous
          }
        : {
            id:'',
            kind:'delete_property',
            entityId:operation.entityId,
            key
          }
      );
      changedEntities.add(operation.entityId);
      worldChanged=true;
      continue;
    }

    if(operation.kind==='delete_property'){
      const key=assertPlainKey(operation.key);
      const entity=assertEntityExists(world,operation.entityId);
      if(!entity.properties || !Object.prototype.hasOwnProperty.call(entity.properties,key)){
        throw new Error(`world_edit_property_missing:${operation.entityId}:${key}`);
      }
      const previous=clone(entity.properties[key]);
      delete entity.properties[key];
      inverse.push({
        id:'',
        kind:'set_property',
        entityId:operation.entityId,
        key,
        value:previous
      });
      changedEntities.add(operation.entityId);
      worldChanged=true;
      continue;
    }

    if(operation.kind==='upsert_material'){
      if(!world.visualScene) throw new Error('world_edit_visual_scene_missing');
      safeId(operation.material?.id,'material_id');
      const indexes=materialIndex(world);
      const existingIndex=indexes.get(operation.material.id);
      if(existingIndex===undefined){
        world.visualScene.materials.push(clone(operation.material));
        inverse.push({
          id:'',
          kind:'remove_material',
          materialId:operation.material.id
        });
      }else{
        const previous=clone(world.visualScene.materials[existingIndex]);
        world.visualScene.materials[existingIndex]=clone(operation.material);
        inverse.push({
          id:'',
          kind:'upsert_material',
          material:previous
        });
      }
      changedMaterials.add(operation.material.id);
      worldChanged=true;
      continue;
    }

    if(operation.kind==='remove_material'){
      if(!world.visualScene) throw new Error('world_edit_visual_scene_missing');
      const referenced=referencedMaterialIds(world);
      if(referenced.has(operation.materialId)){
        throw new Error(`world_edit_material_still_referenced:${operation.materialId}`);
      }
      const indexes=materialIndex(world);
      const existingIndex=indexes.get(operation.materialId);
      if(existingIndex===undefined) throw new Error(`world_edit_material_missing:${operation.materialId}`);
      const previous=clone(world.visualScene.materials[existingIndex]);
      world.visualScene.materials.splice(existingIndex,1);
      inverse.push({
        id:'',
        kind:'upsert_material',
        material:previous
      });
      changedMaterials.add(operation.materialId);
      worldChanged=true;
      continue;
    }

    if(operation.kind==='set_clear_color'){
      if(!world.visualScene) throw new Error('world_edit_visual_scene_missing');
      const previous=world.visualScene.clearColor?clone(world.visualScene.clearColor):null;
      if(operation.value){
        world.visualScene.clearColor=clone(operation.value);
      }else{
        delete world.visualScene.clearColor;
      }
      inverse.push({
        id:'',
        kind:'set_clear_color',
        value:previous
      });
      worldChanged=true;
      continue;
    }

    if(operation.kind==='upsert_asset'){
      validateWorldAssetRecord(operation.asset);
      const indexes=assetIndex({...sourceManifest,assets});
      const existingIndex=indexes.get(operation.asset.id);
      if(existingIndex===undefined){
        assets.push(clone(operation.asset));
        inverse.push({
          id:'',
          kind:'remove_asset',
          assetId:operation.asset.id
        });
      }else{
        const previous=clone(assets[existingIndex]);
        if(operation.asset.revision<=previous.revision && operation.asset.sha256!==previous.sha256){
          throw new Error(`world_edit_asset_revision_not_advanced:${operation.asset.id}`);
        }
        assets[existingIndex]=clone(operation.asset);
        inverse.push({
          id:'',
          kind:'upsert_asset',
          asset:{
            ...previous,
            revision:Math.max(previous.revision,operation.asset.revision)+1
          }
        });
        if(previous.sha256!==operation.asset.sha256){
          hotReloadAssets.add(operation.asset.id);
        }
      }
      changedAssets.add(operation.asset.id);
      assetsChanged=true;
      continue;
    }

    if(operation.kind==='remove_asset'){
      const indexes=assetIndex({...sourceManifest,assets});
      const existingIndex=indexes.get(operation.assetId);
      if(existingIndex===undefined) throw new Error(`world_edit_asset_missing:${operation.assetId}`);
      const previous=clone(assets[existingIndex]);
      assets.splice(existingIndex,1);
      inverse.push({
        id:'',
        kind:'upsert_asset',
        asset:{
          ...previous,
          revision:previous.revision+1
        }
      });
      changedAssets.add(operation.assetId);
      assetsChanged=true;
      continue;
    }

    const exhaustive:never=operation;
    throw new Error(`world_edit_operation_unsupported:${String((exhaustive as any)?.kind)}`);
  }

  if(!worldChanged && !assetsChanged) throw new Error('world_edit_no_effect');

  if(worldChanged){
    world.version=sourceWorld.version+1;
    world.entities=[...world.entities].sort((a,b)=>a.id.localeCompare(b.id));
    if(world.visualScene){
      world.visualScene.materials=[...world.visualScene.materials]
        .sort((a,b)=>a.id.localeCompare(b.id));
    }
  }

  validateWorldDefinition(world);

  const nextManifest=createWorldAssetManifest(
    sourceManifest.worldId,
    assets,
    sourceManifest.revision+(assetsChanged?1:0)
  );

  const afterWorldDigest=worldDefinitionDigest(world);
  const transactionDigest=worldEditTransactionDigest(transaction);
  const inverseOperations=[...inverse]
    .reverse()
    .map((operation,index)=>({
      ...operation,
      id:reverseOperationId(transaction.id,index)
    })) as WorldEditOperation[];

  const inverseTransaction:WorldEditTransaction={
    schema:'evercraft.world-engine.edit-transaction.v1',
    id:`undo:${transaction.id}`,
    worldId:world.id,
    baseWorldDigest:afterWorldDigest,
    baseAssetManifestDigest:nextManifest.digest,
    actor:{
      kind:'system',
      id:'world-engine-undo'
    },
    reason:`Inverse of ${transaction.id}`,
    operations:inverseOperations
  };

  const receiptCore={
    schema:'evercraft.world-engine.edit-receipt.v1' as const,
    transactionId:transaction.id,
    transactionDigest,
    worldId:world.id,
    beforeWorldDigest,
    afterWorldDigest,
    beforeWorldVersion:sourceWorld.version,
    afterWorldVersion:world.version,
    beforeAssetManifestDigest:sourceManifest.digest,
    afterAssetManifestDigest:nextManifest.digest,
    beforeAssetManifestRevision:sourceManifest.revision,
    afterAssetManifestRevision:nextManifest.revision,
    operationIds:transaction.operations.map(operation=>operation.id),
    changedEntityIds:[...changedEntities].sort(),
    changedMaterialIds:[...changedMaterials].sort(),
    changedAssetIds:[...changedAssets].sort(),
    hotReloadAssetIds:[...hotReloadAssets].sort(),
    inverseTransaction
  };

  return {
    world,
    assets:nextManifest,
    receipt:{...receiptCore,digest:digest(receiptCore)}
  };
}

export function verifyWorldEditReceipt(receipt:WorldEditReceipt){
  if(receipt?.schema!=='evercraft.world-engine.edit-receipt.v1') return false;
  const {digest:claimed,...core}=receipt;
  return typeof claimed==='string' && claimed===digest(core);
}

export function semanticWorldDigest(world:WorldDefinition){
  const copy=clone(world);
  copy.version=1;
  return digest(copy);
}

export function semanticAssetManifestDigest(manifest:WorldAssetManifest){
  const normalized=manifest.assets.map(asset=>({
    ...clone(asset),
    revision:1
  }));
  const core=manifestCore(manifest.worldId,1,normalized);
  return digest(core);
}

export class LiveWorldAuthoringSession {
  private _world:WorldDefinition;
  private _assets:WorldAssetManifest;
  private _history:WorldEditReceipt[]=[];

  constructor(world:WorldDefinition,manifest?:WorldAssetManifest){
    validateWorldDefinition(world);
    const assets=manifest || createWorldAssetManifest(world.id,[]);
    if(!verifyWorldAssetManifest(assets)) throw new Error('world_edit_asset_manifest_digest_invalid');
    if(assets.worldId!==world.id) throw new Error('world_edit_manifest_world_mismatch');
    this._world=clone(world);
    this._assets=clone(assets);
  }

  get world(){
    return clone(this._world);
  }

  get assets(){
    return clone(this._assets);
  }

  get history(){
    return this._history.map(clone);
  }

  apply(transaction:WorldEditTransaction){
    const result=applyWorldEditTransaction(this._world,this._assets,transaction);
    this._world=result.world;
    this._assets=result.assets;
    this._history.push(clone(result.receipt));
    return clone(result);
  }

  undoLast(){
    const last=this._history[this._history.length-1];
    if(!last) throw new Error('world_edit_history_empty');
    const result=applyWorldEditTransaction(this._world,this._assets,last.inverseTransaction);
    this._world=result.world;
    this._assets=result.assets;
    this._history.push(clone(result.receipt));
    return clone(result);
  }
}
