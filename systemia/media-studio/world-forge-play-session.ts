import crypto from 'node:crypto';

import type { WorldForgeProject } from './world-forge.js';
import {
  compileWorldForgeToWorldEngine,
  worldEngineEulerToWorldForge,
  worldEngineVectorToWorldForge,
  type WorldForgeWorldEngineBridgeResult,
} from './world-forge-world-engine.js';
import {
  applyWorldForgeLiveSyncToRuntime,
  type WorldForgeLiveRuntimeSyncResult,
} from './world-forge-live-sync.js';
import {
  EvercraftWorldRuntime,
  type WorldInput,
  type WorldSnapshot,
} from '../world-engine/engine.js';
import type { GeometryAsset } from '../world-engine/webgpu.js';

export interface WorldForgePlaySessionSummary {
  schema:'evercraft.fallen.world-forge-play-session-summary.v1';
  sessionId:string;
  projectId:string;
  projectVersion:number;
  worldId:string;
  worldVersion:number;
  worldDefinitionDigest:string;
  projectDigest:string;
  tick:number;
  timeSec:number;
  geometryCount:number;
  bridgeDigest:string;
  runtimeReady:true;
  webGpuReady:boolean;
  visualParity:string;
  createdAt:string;
  lastAccessAt:string;
  boundaries:{
    ephemeralSession:true;
    publicationAuthorityGranted:false;
    productionRenderAuthorityGranted:false;
    autonomousExternalActionAuthorityGranted:false;
  };
}

export interface WorldForgePlayStepReceipt {
  schema:'evercraft.fallen.world-forge-play-step-receipt.v1';
  sessionId:string;
  worldId:string;
  fromTick:number;
  toTick:number;
  tickCount:number;
  inputCount:number;
  beforeSnapshotDigest:string;
  afterSnapshotDigest:string;
  deterministicRuntime:true;
  createdAt:string;
  digest:string;
}

export interface WorldForgePlayStepResult {
  snapshot:WorldSnapshot;
  receipt:WorldForgePlayStepReceipt;
}

export interface WorldForgePlayRuntimeProjection {
  schema:'evercraft.fallen.world-forge-play-runtime-projection.v1';
  sessionId:string;
  projectId:string;
  projectVersion:number;
  worldId:string;
  worldVersion:number;
  tick:number;
  timeSec:number;
  snapshotDigest:string;
  nodeTransforms:Array<{
    nodeId:string;
    entityId:string;
    transform:{
      position:{x:number;y:number;z:number};
      rotationDeg:{x:number;y:number;z:number};
      scale:{x:number;y:number;z:number};
    };
  }>;
  source:'world-engine-runtime';
  canonicalAuthoringMutation:false;
}

export interface WorldForgePlaySyncResult {
  session:WorldForgePlaySessionSummary;
  runtimeSync:WorldForgeLiveRuntimeSyncResult;
}

function clone<T>(value:T):T{
  return structuredClone(value);
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

function safeSessionId(value:string){
  const id=String(value||'').trim();
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,90}$/.test(id)){
    throw new Error('world_forge_play_session_id_invalid');
  }
  return id;
}

function validateInputs(
  inputs:WorldInput[],
  currentTick:number,
  ticks:number,
){
  if(inputs.length>1000) throw new Error('world_forge_play_input_limit');
  const maxTick=currentTick+ticks;
  const ids=new Set<string>();
  for(const input of inputs){
    if(!input?.id) throw new Error('world_forge_play_input_id_missing');
    if(ids.has(input.id)) throw new Error(`world_forge_play_input_duplicate:${input.id}`);
    ids.add(input.id);
    if(!Number.isInteger(input.tick)||input.tick<=currentTick||input.tick>maxTick){
      throw new Error(
        `world_forge_play_input_tick_out_of_window:${input.id}:${input.tick}:${currentTick+1}-${maxTick}`,
      );
    }
  }
}

function stepReceiptDigest(
  receipt:Omit<WorldForgePlayStepReceipt,'digest'>|WorldForgePlayStepReceipt,
){
  return digest(receipt);
}

export function verifyWorldForgePlayStepReceipt(receipt:WorldForgePlayStepReceipt){
  if(receipt?.schema!=='evercraft.fallen.world-forge-play-step-receipt.v1') return false;
  return receipt.digest===stepReceiptDigest(receipt);
}

export class WorldForgePlaySession {
  readonly id:string;
  readonly createdAt:string;

  private _project:WorldForgeProject;
  private _bridge:WorldForgeWorldEngineBridgeResult;
  private _runtime:EvercraftWorldRuntime;
  private _geometries:GeometryAsset[];
  private _lastAccessAt:string;

  constructor(input:{
    sessionId:string;
    project:WorldForgeProject;
    tickRateHz?:number;
  }){
    this.id=safeSessionId(input.sessionId);
    this.createdAt=new Date().toISOString();
    this._lastAccessAt=this.createdAt;
    this._project=clone(input.project);
    this._bridge=compileWorldForgeToWorldEngine({
      project:this._project,
      tickRateHz:input.tickRateHz,
    });
    this._runtime=new EvercraftWorldRuntime(this._bridge.world);
    this._geometries=clone(this._bridge.geometries);
  }

  private touch(){
    this._lastAccessAt=new Date().toISOString();
  }

  get project(){
    return clone(this._project);
  }

  get geometries(){
    return clone(this._geometries);
  }

  snapshot(){
    this.touch();
    return this._runtime.snapshot();
  }

  runtimeProjection():WorldForgePlayRuntimeProjection{
    const snapshot=this._runtime.snapshot();
    const entities=new Map(snapshot.entities.map(entity=>[entity.id,entity]));
    const nodeTransforms=this._bridge.receipt.nodeEntityMap
      .map(mapping=>{
        const entity=entities.get(mapping.entityId);
        if(!entity) return null;
        const rotation=entity.transform.rotationDeg??{x:0,y:0,z:0};
        const scale=entity.transform.scale??{x:1,y:1,z:1};
        return {
          nodeId:mapping.nodeId,
          entityId:mapping.entityId,
          transform:{
            position:worldEngineVectorToWorldForge(
              entity.transform.position,
              this._project.unitScaleMeters,
            ),
            rotationDeg:worldEngineEulerToWorldForge(rotation),
            scale:{
              x:scale.x,
              y:scale.z,
              z:scale.y,
            },
          },
        };
      })
      .filter((item):item is NonNullable<typeof item>=>Boolean(item))
      .sort((a,b)=>a.nodeId.localeCompare(b.nodeId));

    this.touch();
    return {
      schema:'evercraft.fallen.world-forge-play-runtime-projection.v1',
      sessionId:this.id,
      projectId:this._project.id,
      projectVersion:this._project.version,
      worldId:snapshot.worldId,
      worldVersion:snapshot.worldVersion,
      tick:snapshot.tick,
      timeSec:snapshot.timeSec,
      snapshotDigest:snapshot.digest,
      nodeTransforms,
      source:'world-engine-runtime',
      canonicalAuthoringMutation:false,
    };
  }

  summary():WorldForgePlaySessionSummary{
    const snapshot=this._runtime.snapshot();
    this.touch();
    return {
      schema:'evercraft.fallen.world-forge-play-session-summary.v1',
      sessionId:this.id,
      projectId:this._project.id,
      projectVersion:this._project.version,
      worldId:this._bridge.world.id,
      worldVersion:this._runtime.definition.version,
      worldDefinitionDigest:this._runtime.definitionDigest,
      projectDigest:this._bridge.receipt.projectDigest,
      tick:snapshot.tick,
      timeSec:snapshot.timeSec,
      geometryCount:this._geometries.length,
      bridgeDigest:this._bridge.receipt.digest,
      runtimeReady:true,
      webGpuReady:this._bridge.receipt.webGpuReady,
      visualParity:this._bridge.receipt.visualParity,
      createdAt:this.createdAt,
      lastAccessAt:this._lastAccessAt,
      boundaries:{
        ephemeralSession:true,
        publicationAuthorityGranted:false,
        productionRenderAuthorityGranted:false,
        autonomousExternalActionAuthorityGranted:false,
      },
    };
  }

  step(input:{
    ticks:number;
    inputs?:WorldInput[];
  }):WorldForgePlayStepResult{
    const ticks=input.ticks;
    if(!Number.isInteger(ticks)||ticks<1||ticks>600){
      throw new Error('world_forge_play_tick_count_invalid');
    }
    const inputs=clone(input.inputs??[]);
    const before=this._runtime.snapshot();
    validateInputs(inputs,before.tick,ticks);
    const after=this._runtime.run(ticks,inputs);
    this.touch();

    const receiptCore:Omit<WorldForgePlayStepReceipt,'digest'>={
      schema:'evercraft.fallen.world-forge-play-step-receipt.v1',
      sessionId:this.id,
      worldId:after.worldId,
      fromTick:before.tick,
      toTick:after.tick,
      tickCount:ticks,
      inputCount:inputs.length,
      beforeSnapshotDigest:before.digest,
      afterSnapshotDigest:after.digest,
      deterministicRuntime:true,
      createdAt:new Date().toISOString(),
    };
    const receipt:WorldForgePlayStepReceipt={
      ...receiptCore,
      digest:stepReceiptDigest(receiptCore),
    };

    return {
      snapshot:after,
      receipt,
    };
  }

  syncProject(input:{
    afterProject:WorldForgeProject;
    actor:{kind:'human'|'agent'|'code'|'system';id:string};
    reason?:string;
  }):WorldForgePlaySyncResult{
    const beforeSnapshot=this._runtime.snapshot();
    const runtimeSync=applyWorldForgeLiveSyncToRuntime({
      syncId:`${this.id}:v${this._project.version}-v${input.afterProject.version}`,
      beforeProject:this._project,
      afterProject:input.afterProject,
      actor:input.actor,
      reason:input.reason,
      previousSnapshot:beforeSnapshot,
      currentGeometries:this._geometries,
      tickRateHz:this._runtime.definition.tickRateHz,
    });

    const nextRuntime=new EvercraftWorldRuntime(runtimeSync.sync.applied.world);
    nextRuntime.restoreSnapshot(runtimeSync.snapshot);

    this._project=clone(input.afterProject);
    this._runtime=nextRuntime;
    this._geometries=clone(runtimeSync.geometries);
    this._bridge=runtimeSync.sync.target;
    this.touch();

    return {
      session:this.summary(),
      runtimeSync,
    };
  }
}

interface RegistryEntry {
  session:WorldForgePlaySession;
  lastAccessMs:number;
}

export class WorldForgePlaySessionRegistry {
  private readonly sessions=new Map<string,RegistryEntry>();

  constructor(
    readonly maxSessions=16,
    readonly ttlMs=2*60*60*1000,
  ){
    if(!Number.isInteger(maxSessions)||maxSessions<1||maxSessions>256){
      throw new Error('world_forge_play_registry_capacity_invalid');
    }
    if(!Number.isFinite(ttlMs)||ttlMs<60_000){
      throw new Error('world_forge_play_registry_ttl_invalid');
    }
  }

  private prune(now=Date.now()){
    for(const [id,entry] of this.sessions){
      if(now-entry.lastAccessMs>this.ttlMs) this.sessions.delete(id);
    }
  }

  start(input:{
    sessionId:string;
    project:WorldForgeProject;
    tickRateHz?:number;
  }){
    this.prune();
    const id=safeSessionId(input.sessionId);
    if(this.sessions.has(id)) throw new Error(`world_forge_play_session_exists:${id}`);
    if(this.sessions.size>=this.maxSessions){
      throw new Error('world_forge_play_session_capacity_reached');
    }
    const session=new WorldForgePlaySession({...input,sessionId:id});
    this.sessions.set(id,{session,lastAccessMs:Date.now()});
    return session;
  }

  get(sessionId:string){
    this.prune();
    const id=safeSessionId(sessionId);
    const entry=this.sessions.get(id);
    if(!entry) throw new Error(`world_forge_play_session_missing:${id}`);
    entry.lastAccessMs=Date.now();
    return entry.session;
  }

  stop(sessionId:string){
    const id=safeSessionId(sessionId);
    const existed=this.sessions.delete(id);
    if(!existed) throw new Error(`world_forge_play_session_missing:${id}`);
    return id;
  }

  list(){
    this.prune();
    return [...this.sessions.values()]
      .map(entry=>entry.session.summary())
      .sort((a,b)=>a.sessionId.localeCompare(b.sessionId));
  }
}
