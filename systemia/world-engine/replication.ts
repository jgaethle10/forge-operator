import crypto from 'node:crypto';
import {
  EvercraftWorldRuntime,
  verifyWorldSnapshot,
  type WorldDefinition,
  type WorldInput,
  type WorldSnapshot
} from './engine.js';

export interface ReplicationSessionDefinition {
  schema:'evercraft.world-engine.replication.v1';
  sessionId:string;
  worldId:string;
  authorityPeerId:string;
  rollbackWindowTicks:number;
  checkpointIntervalTicks:number;
}

export interface ReplicatedInputEnvelope {
  schema:'evercraft.world-engine.replication-input.v1';
  sessionId:string;
  peerId:string;
  sequence:number;
  input:WorldInput;
  digest:string;
}

export interface AuthoritativeCheckpoint {
  schema:'evercraft.world-engine.replication-checkpoint.v1';
  sessionId:string;
  authorityPeerId:string;
  tick:number;
  acknowledgedInputDigests:string[];
  snapshot:WorldSnapshot;
  digest:string;
}

export interface AuthoritativeStepReceipt {
  schema:'evercraft.world-engine.replication-step.v1';
  sessionId:string;
  tick:number;
  appliedInputDigests:string[];
  snapshotDigest:string;
}

export interface ReconciliationReceipt {
  schema:'evercraft.world-engine.reconciliation.v1';
  sessionId:string;
  checkpointTick:number;
  localTickBefore:number;
  localTickAfter:number;
  predictedDigestAtCheckpoint:string|null;
  authoritativeDigest:string;
  rolledBack:boolean;
  replayedTicks:number;
  replayedInputDigests:string[];
  acknowledgedInputDigests:string[];
  discardedPastPredictionDigests:string[];
  finalSnapshotDigest:string;
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

function packetCore<T extends {digest:string}>(value:T){
  const {digest:_claimed,...core}=value;
  return core;
}

function assertId(value:string,label:string){
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(String(value||''))){
    throw new Error(`replication_${label}_invalid`);
  }
}

export function validateReplicationSession(
  session:ReplicationSessionDefinition,
  world:WorldDefinition
){
  if(session?.schema!=='evercraft.world-engine.replication.v1'){
    throw new Error('replication_session_schema_invalid');
  }
  assertId(session.sessionId,'session_id');
  assertId(session.authorityPeerId,'authority_peer_id');
  if(session.worldId!==world.id) throw new Error('replication_session_world_mismatch');
  if(!Number.isInteger(session.rollbackWindowTicks) || session.rollbackWindowTicks<1 || session.rollbackWindowTicks>10_000){
    throw new Error('replication_rollback_window_invalid');
  }
  if(!Number.isInteger(session.checkpointIntervalTicks) || session.checkpointIntervalTicks<1 || session.checkpointIntervalTicks>10_000){
    throw new Error('replication_checkpoint_interval_invalid');
  }
  return true;
}

export function createReplicatedInput(
  session:ReplicationSessionDefinition,
  peerId:string,
  sequence:number,
  input:WorldInput
):ReplicatedInputEnvelope{
  assertId(peerId,'peer_id');
  if(!Number.isInteger(sequence) || sequence<0) throw new Error('replication_input_sequence_invalid');
  if(!Number.isInteger(input?.tick) || input.tick<1) throw new Error('replication_input_tick_invalid');
  const core={
    schema:'evercraft.world-engine.replication-input.v1' as const,
    sessionId:session.sessionId,
    peerId,
    sequence,
    input:clone(input)
  };
  return {...core,digest:digest(core)};
}

export function verifyReplicatedInput(packet:ReplicatedInputEnvelope){
  if(packet?.schema!=='evercraft.world-engine.replication-input.v1') return false;
  return packet.digest===digest(packetCore(packet));
}

export function canonicalReplicatedWorldInput(packet:ReplicatedInputEnvelope):WorldInput{
  if(!verifyReplicatedInput(packet)) throw new Error('replication_input_digest_invalid');
  return {
    ...clone(packet.input),
    id:`rep:${packet.peerId}:${packet.sequence}:${packet.input.id}`
  } as WorldInput;
}

export function createAuthoritativeCheckpoint(
  session:ReplicationSessionDefinition,
  snapshot:WorldSnapshot,
  acknowledgedInputDigests:string[]
):AuthoritativeCheckpoint{
  if(snapshot.worldId!==session.worldId) throw new Error('replication_checkpoint_world_mismatch');
  if(!verifyWorldSnapshot(snapshot)) throw new Error('replication_checkpoint_snapshot_invalid');
  const core={
    schema:'evercraft.world-engine.replication-checkpoint.v1' as const,
    sessionId:session.sessionId,
    authorityPeerId:session.authorityPeerId,
    tick:snapshot.tick,
    acknowledgedInputDigests:[...new Set(acknowledgedInputDigests)].sort(),
    snapshot:clone(snapshot)
  };
  return {...core,digest:digest(core)};
}

export function verifyAuthoritativeCheckpoint(checkpoint:AuthoritativeCheckpoint){
  if(checkpoint?.schema!=='evercraft.world-engine.replication-checkpoint.v1') return false;
  if(checkpoint.tick!==checkpoint.snapshot?.tick) return false;
  if(!verifyWorldSnapshot(checkpoint.snapshot)) return false;
  return checkpoint.digest===digest(packetCore(checkpoint));
}

class SnapshotRing {
  private rows=new Map<number,WorldSnapshot>();

  constructor(private readonly maxTicks:number){}

  put(snapshot:WorldSnapshot){
    this.rows.set(snapshot.tick,clone(snapshot));
    const minTick=snapshot.tick-this.maxTicks;
    for(const tick of [...this.rows.keys()]){
      if(tick<minTick) this.rows.delete(tick);
    }
  }

  get(tick:number){
    const row=this.rows.get(tick);
    return row?clone(row):null;
  }

  has(tick:number){
    return this.rows.has(tick);
  }

  oldestTick(){
    const ticks=[...this.rows.keys()].sort((a,b)=>a-b);
    return ticks.length?ticks[0]:null;
  }

  deleteThrough(tick:number){
    for(const key of [...this.rows.keys()]){
      if(key<=tick) this.rows.delete(key);
    }
  }
}

function packetSort(a:ReplicatedInputEnvelope,b:ReplicatedInputEnvelope){
  return a.input.tick-b.input.tick
    || a.peerId.localeCompare(b.peerId)
    || a.sequence-b.sequence
    || a.digest.localeCompare(b.digest);
}

function validatePacketForSession(
  session:ReplicationSessionDefinition,
  packet:ReplicatedInputEnvelope
){
  if(!verifyReplicatedInput(packet)) throw new Error('replication_input_digest_invalid');
  if(packet.sessionId!==session.sessionId) throw new Error('replication_input_session_mismatch');
  assertId(packet.peerId,'peer_id');
  return true;
}

export class AuthoritativeReplicationRuntime {
  readonly session:ReplicationSessionDefinition;
  readonly runtime:EvercraftWorldRuntime;
  private queued=new Map<number,ReplicatedInputEnvelope[]>();
  private seen=new Map<string,ReplicatedInputEnvelope>();
  private processed=new Set<string>();

  constructor(session:ReplicationSessionDefinition,world:WorldDefinition){
    validateReplicationSession(session,world);
    this.session=clone(session);
    this.runtime=new EvercraftWorldRuntime(world);
  }

  submitInput(packet:ReplicatedInputEnvelope){
    validatePacketForSession(this.session,packet);

    const identity=`${packet.peerId}:${packet.sequence}`;
    const existing=this.seen.get(identity);
    if(existing){
      if(existing.digest!==packet.digest) throw new Error('replication_input_sequence_conflict');
      return {accepted:false,duplicate:true,digest:packet.digest};
    }

    if(packet.input.tick<=this.runtime.tick){
      throw new Error('replication_authority_late_input_rejected');
    }

    this.seen.set(identity,clone(packet));
    const rows=this.queued.get(packet.input.tick) || [];
    rows.push(clone(packet));
    rows.sort(packetSort);
    this.queued.set(packet.input.tick,rows);
    return {accepted:true,duplicate:false,digest:packet.digest};
  }

  step():AuthoritativeStepReceipt{
    const targetTick=this.runtime.tick+1;
    const packets=[...(this.queued.get(targetTick) || [])].sort(packetSort);
    const inputs=packets.map(canonicalReplicatedWorldInput);
    const snapshot=this.runtime.step(inputs);

    for(const packet of packets) this.processed.add(packet.digest);
    this.queued.delete(targetTick);

    return {
      schema:'evercraft.world-engine.replication-step.v1',
      sessionId:this.session.sessionId,
      tick:snapshot.tick,
      appliedInputDigests:packets.map(packet=>packet.digest),
      snapshotDigest:snapshot.digest
    };
  }

  run(ticks:number){
    if(!Number.isInteger(ticks) || ticks<0) throw new Error('replication_run_ticks_invalid');
    const receipts:AuthoritativeStepReceipt[]=[];
    for(let i=0;i<ticks;i++) receipts.push(this.step());
    return receipts;
  }

  checkpoint(){
    return createAuthoritativeCheckpoint(
      this.session,
      this.runtime.snapshot(),
      [...this.processed].sort()
    );
  }

  shouldCheckpoint(){
    return this.runtime.tick%this.session.checkpointIntervalTicks===0;
  }
}

export class PredictiveReplicationRuntime {
  readonly session:ReplicationSessionDefinition;
  readonly localPeerId:string;
  readonly runtime:EvercraftWorldRuntime;
  private snapshots:SnapshotRing;
  private inputs=new Map<string,ReplicatedInputEnvelope>();

  constructor(
    session:ReplicationSessionDefinition,
    world:WorldDefinition,
    localPeerId:string
  ){
    validateReplicationSession(session,world);
    assertId(localPeerId,'local_peer_id');
    this.session=clone(session);
    this.localPeerId=localPeerId;
    this.runtime=new EvercraftWorldRuntime(world);
    this.snapshots=new SnapshotRing(session.rollbackWindowTicks);
    this.snapshots.put(this.runtime.snapshot());
  }

  queueInput(packet:ReplicatedInputEnvelope){
    validatePacketForSession(this.session,packet);
    const identity=`${packet.peerId}:${packet.sequence}`;
    const existing=this.inputs.get(identity);
    if(existing){
      if(existing.digest!==packet.digest) throw new Error('replication_input_sequence_conflict');
      return {accepted:false,duplicate:true,digest:packet.digest};
    }
    if(packet.input.tick<=this.runtime.tick){
      throw new Error('replication_prediction_late_input_rejected');
    }
    this.inputs.set(identity,clone(packet));
    return {accepted:true,duplicate:false,digest:packet.digest};
  }

  private packetsForTick(tick:number){
    return [...this.inputs.values()]
      .filter(packet=>packet.input.tick===tick)
      .sort(packetSort);
  }

  step(){
    const targetTick=this.runtime.tick+1;
    const packets=this.packetsForTick(targetTick);
    const snapshot=this.runtime.step(packets.map(canonicalReplicatedWorldInput));
    this.snapshots.put(snapshot);
    return snapshot;
  }

  run(ticks:number){
    if(!Number.isInteger(ticks) || ticks<0) throw new Error('replication_run_ticks_invalid');
    let snapshot=this.runtime.snapshot();
    for(let i=0;i<ticks;i++) snapshot=this.step();
    return snapshot;
  }

  reconcile(checkpoint:AuthoritativeCheckpoint):ReconciliationReceipt{
    if(!verifyAuthoritativeCheckpoint(checkpoint)){
      throw new Error('replication_checkpoint_digest_invalid');
    }
    if(checkpoint.sessionId!==this.session.sessionId){
      throw new Error('replication_checkpoint_session_mismatch');
    }
    if(checkpoint.authorityPeerId!==this.session.authorityPeerId){
      throw new Error('replication_checkpoint_authority_mismatch');
    }
    if(checkpoint.snapshot.worldId!==this.session.worldId){
      throw new Error('replication_checkpoint_world_mismatch');
    }

    const localTickBefore=this.runtime.tick;
    if(checkpoint.tick>localTickBefore){
      throw new Error('replication_checkpoint_from_future');
    }
    if(localTickBefore-checkpoint.tick>this.session.rollbackWindowTicks){
      throw new Error('replication_checkpoint_outside_rollback_window');
    }

    const predicted=this.snapshots.get(checkpoint.tick);
    const predictedDigestAtCheckpoint=predicted?.digest || null;
    const authoritativeDigest=checkpoint.snapshot.digest;
    const acknowledged=new Set(checkpoint.acknowledgedInputDigests);
    const rolledBack=predictedDigestAtCheckpoint!==authoritativeDigest;

    const discardedPastPredictionDigests=[...this.inputs.values()]
      .filter(packet=>packet.input.tick<=checkpoint.tick && !acknowledged.has(packet.digest))
      .map(packet=>packet.digest)
      .sort();

    for(const [identity,packet] of [...this.inputs.entries()]){
      if(acknowledged.has(packet.digest) || packet.input.tick<=checkpoint.tick){
        this.inputs.delete(identity);
      }
    }

    const replayPackets=[...this.inputs.values()]
      .filter(packet=>packet.input.tick>checkpoint.tick && packet.input.tick<=localTickBefore)
      .sort(packetSort);

    if(rolledBack){
      this.runtime.restoreSnapshot(checkpoint.snapshot);
      this.snapshots=new SnapshotRing(this.session.rollbackWindowTicks);
      this.snapshots.put(checkpoint.snapshot);

      for(let tick=checkpoint.tick+1;tick<=localTickBefore;tick++){
        const packets=replayPackets.filter(packet=>packet.input.tick===tick);
        const snapshot=this.runtime.step(packets.map(canonicalReplicatedWorldInput));
        this.snapshots.put(snapshot);
      }
    }else{
      this.snapshots.deleteThrough(checkpoint.tick);
      this.snapshots.put(checkpoint.snapshot);
    }

    return {
      schema:'evercraft.world-engine.reconciliation.v1',
      sessionId:this.session.sessionId,
      checkpointTick:checkpoint.tick,
      localTickBefore,
      localTickAfter:this.runtime.tick,
      predictedDigestAtCheckpoint,
      authoritativeDigest,
      rolledBack,
      replayedTicks:rolledBack?localTickBefore-checkpoint.tick:0,
      replayedInputDigests:rolledBack?replayPackets.map(packet=>packet.digest):[],
      acknowledgedInputDigests:[...acknowledged].sort(),
      discardedPastPredictionDigests,
      finalSnapshotDigest:this.runtime.snapshot().digest
    };
  }
}
