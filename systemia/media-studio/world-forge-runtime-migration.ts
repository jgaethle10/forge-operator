import crypto from 'node:crypto';

import type { WorldForgeChangeSet } from './world-forge-changeset.js';
import type { WorldForgeProject } from './world-forge.js';
import {
  syncWorldForgeChangeSetToRuntime,
  type WorldForgeRuntimeSyncResult,
} from './world-forge-runtime-sync.js';
import {
  verifyWorldSnapshot,
  worldDefinitionDigest,
  type WorldDefinition,
  type WorldSnapshot,
} from '../world-engine/engine.js';
import type { WorldAssetManifest } from '../world-engine/studio-edit.js';
import {
  migrateWorldRuntime,
  verifyWorldRuntimeMigrationReceipt,
  type WorldRuntimeMigrationReceipt,
} from '../world-engine/runtime-migration.js';

export interface WorldForgeLiveRuntimeMigrationReceipt {
  schema:'evercraft.fallen.world-forge-live-runtime-migration-receipt.v1';
  changeSetId:string;
  changeSetDigest:string;
  projectId:string;
  projectVersionBefore:number;
  projectVersionAfter:number;
  worldId:string;
  worldVersionBefore:number;
  worldVersionAfter:number;
  worldDefinitionDigestBefore:string;
  worldDefinitionDigestAfter:string;
  sourceSnapshotDigest:string;
  migratedSnapshotDigest:string;
  sourceTick:number;
  migratedTick:number;
  sourceTimeSec:number;
  migratedTimeSec:number;
  syncReceiptDigest:string;
  worldEngineMigrationReceiptDigest:string;
  addedEntityIds:string[];
  removedEntityIds:string[];
  preservedEntityState:Array<{
    entityId:string;
    preserved:string[];
    reset:string[];
  }>;
  cameraRuntimePreserved:boolean;
  audioSceneRuntimePreserved:boolean;
  collisionsReset:true;
  boundaries:{
    worldEngineOwnsMigrationPolicy:true;
    authoredDefinitionWinsOnContractChange:true;
    compatibleRuntimeStateMaySurvive:true;
    publicationAuthorityGranted:false;
    productionRenderAuthorityGranted:false;
    simulationAuthorityGranted:false;
  };
  digest:string;
}

export interface WorldForgeLiveRuntimeMigrationResult {
  schema:'evercraft.fallen.world-forge-live-runtime-migration.v1';
  sync:WorldForgeRuntimeSyncResult;
  snapshot:WorldSnapshot;
  migrationReceipt:WorldRuntimeMigrationReceipt;
  receipt:WorldForgeLiveRuntimeMigrationReceipt;
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
  receipt:
    | Omit<WorldForgeLiveRuntimeMigrationReceipt,'digest'>
    | WorldForgeLiveRuntimeMigrationReceipt,
){
  const copy={
    ...(receipt as WorldForgeLiveRuntimeMigrationReceipt),
  } as Record<string,unknown>;
  delete copy.digest;
  return hash(copy);
}

export function verifyWorldForgeLiveRuntimeMigrationReceipt(
  receipt:WorldForgeLiveRuntimeMigrationReceipt,
){
  if(
    receipt?.schema!==
    'evercraft.fallen.world-forge-live-runtime-migration-receipt.v1'
  ) return false;
  return receipt.digest===receiptDigest(receipt);
}

function assertSnapshotMatchesRuntime(
  runtimeWorld:WorldDefinition,
  snapshot:WorldSnapshot,
){
  if(!verifyWorldSnapshot(snapshot)){
    throw new Error('world_forge_live_migration_snapshot_digest_invalid');
  }
  if(snapshot.worldId!==runtimeWorld.id){
    throw new Error(
      `world_forge_live_migration_snapshot_world_mismatch:expected=${runtimeWorld.id}:actual=${snapshot.worldId}`,
    );
  }
  if(snapshot.worldVersion!==runtimeWorld.version){
    throw new Error(
      `world_forge_live_migration_snapshot_version_mismatch:expected=${runtimeWorld.version}:actual=${snapshot.worldVersion}`,
    );
  }
  const definitionDigest=worldDefinitionDigest(runtimeWorld);
  if(snapshot.definitionDigest!==definitionDigest){
    throw new Error(
      `world_forge_live_migration_snapshot_definition_mismatch:expected=${definitionDigest}:actual=${snapshot.definitionDigest}`,
    );
  }
}

export function syncWorldForgeChangeSetWithLiveRuntime(input:{
  project:WorldForgeProject;
  changeSet:WorldForgeChangeSet;
  runtimeWorld:WorldDefinition;
  runtimeAssets:WorldAssetManifest;
  runtimeSnapshot:WorldSnapshot;
  activateNewEntities?:boolean;
}):WorldForgeLiveRuntimeMigrationResult{
  assertSnapshotMatchesRuntime(input.runtimeWorld,input.runtimeSnapshot);

  const sync=syncWorldForgeChangeSetToRuntime({
    project:input.project,
    changeSet:input.changeSet,
    runtimeWorld:input.runtimeWorld,
    runtimeAssets:input.runtimeAssets,
  });

  const migration=migrateWorldRuntime({
    id:`wf-migrate:${input.changeSet.digest.slice(0,24)}`,
    previousDefinition:input.runtimeWorld,
    nextDefinition:sync.runtime.world,
    previousSnapshot:input.runtimeSnapshot,
    options:{
      activateNewEntities:input.activateNewEntities!==false,
    },
  });

  if(!verifyWorldRuntimeMigrationReceipt(migration.receipt)){
    throw new Error('world_forge_live_migration_engine_receipt_invalid');
  }
  if(!verifyWorldSnapshot(migration.snapshot)){
    throw new Error('world_forge_live_migration_result_snapshot_invalid');
  }
  if(migration.snapshot.worldId!==sync.runtime.world.id){
    throw new Error('world_forge_live_migration_result_world_mismatch');
  }
  if(migration.snapshot.worldVersion!==sync.runtime.world.version){
    throw new Error(
      `world_forge_live_migration_result_version_mismatch:expected=${sync.runtime.world.version}:actual=${migration.snapshot.worldVersion}`,
    );
  }
  if(
    migration.snapshot.definitionDigest!==
    worldDefinitionDigest(sync.runtime.world)
  ){
    throw new Error('world_forge_live_migration_result_definition_mismatch');
  }
  if(migration.snapshot.tick!==input.runtimeSnapshot.tick){
    throw new Error(
      `world_forge_live_migration_tick_changed:before=${input.runtimeSnapshot.tick}:after=${migration.snapshot.tick}`,
    );
  }

  const receiptCore:Omit<
    WorldForgeLiveRuntimeMigrationReceipt,
    'digest'
  >={
    schema:'evercraft.fallen.world-forge-live-runtime-migration-receipt.v1',
    changeSetId:input.changeSet.id,
    changeSetDigest:input.changeSet.digest,
    projectId:input.project.id,
    projectVersionBefore:input.project.version,
    projectVersionAfter:sync.nextProject.version,
    worldId:sync.runtime.world.id,
    worldVersionBefore:input.runtimeWorld.version,
    worldVersionAfter:sync.runtime.world.version,
    worldDefinitionDigestBefore:worldDefinitionDigest(input.runtimeWorld),
    worldDefinitionDigestAfter:worldDefinitionDigest(sync.runtime.world),
    sourceSnapshotDigest:input.runtimeSnapshot.digest,
    migratedSnapshotDigest:migration.snapshot.digest,
    sourceTick:input.runtimeSnapshot.tick,
    migratedTick:migration.snapshot.tick,
    sourceTimeSec:input.runtimeSnapshot.timeSec,
    migratedTimeSec:migration.snapshot.timeSec,
    syncReceiptDigest:sync.receipt.digest,
    worldEngineMigrationReceiptDigest:migration.receipt.digest,
    addedEntityIds:[...migration.receipt.addedEntityIds],
    removedEntityIds:[...migration.receipt.removedEntityIds],
    preservedEntityState:migration.receipt.entityNotes
      .filter(note=>note.status==='migrated')
      .map(note=>({
        entityId:note.entityId,
        preserved:[...note.preserved],
        reset:[...note.reset],
      }))
      .sort((a,b)=>a.entityId.localeCompare(b.entityId)),
    cameraRuntimePreserved:migration.receipt.cameraRuntimePreserved,
    audioSceneRuntimePreserved:migration.receipt.audioSceneRuntimePreserved,
    collisionsReset:true,
    boundaries:{
      worldEngineOwnsMigrationPolicy:true,
      authoredDefinitionWinsOnContractChange:true,
      compatibleRuntimeStateMaySurvive:true,
      publicationAuthorityGranted:false,
      productionRenderAuthorityGranted:false,
      simulationAuthorityGranted:false,
    },
  };

  return {
    schema:'evercraft.fallen.world-forge-live-runtime-migration.v1',
    sync,
    snapshot:migration.snapshot,
    migrationReceipt:migration.receipt,
    receipt:{
      ...receiptCore,
      digest:receiptDigest(receiptCore),
    },
  };
}
