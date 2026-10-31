/**
 * RC03: true native Evercraft World Engine trajectory replay of RC02 *modeled* telemetry.
 * The native runtime receives tick-bound TELEPORT inputs. This validates parsing,
 * snapshots, sampled collision contacts and reproducible replay, not controller
 * dynamics or real-world robotic safety. No hardware interface is imported.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EvercraftWorldRuntime, replayWorld, verifyWorldSnapshot } from '../engine.js';
import { challengeEpisode, verifyEpisode } from './rover-challenge.mjs';
import { projectEpisodeToWorldEngine, verifyWorldEngineHandoff } from './world-engine-handoff.mjs';

export const NATIVE_PROOF_SCHEMA='evercraft.sim-to-real.native-engine-proof.rc03';
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const assert=(valid,message)=>{if(!valid)throw Error(message);};

export function verifyNativeProof(receipt){
  if(!receipt||receipt.schema!==NATIVE_PROOF_SCHEMA||typeof receipt.sha256!=='string')return false;
  const {sha256,...body}=receipt;
  return digest(body)===sha256;
}

/** The input is verified against the exact RC02 episode; no synthetic origins are invented. */
export function runNativeEpisode(episode){
  assert(verifyEpisode(episode),'rc03_source_episode_invalid');
  const projection=projectEpisodeToWorldEngine(episode);
  assert(verifyWorldEngineHandoff(projection),'rc03_projection_invalid');
  assert(projection.sourceEpisodeDigest===episode.sha256,'rc03_source_digest_mismatch');
  assert(projection.projectionOnly===true&&projection.nativeEngineExecuted===false,'rc03_projection_authority_invalid');
  assert(projection.hardwareExecution===false,'rc03_hardware_not_permitted');
  const frames=episode.frames;
  assert(Array.isArray(frames)&&frames.length>0,'rc03_frames_required');
  let previous=0;
  const byTick=new Map();
  for(const frame of frames){
    assert(Number.isInteger(frame.tick)&&frame.tick>previous,'rc03_tick_order_invalid');
    assert(finite(frame.x)&&finite(frame.y),'rc03_pose_invalid');
    assert(Array.isArray(frame.obstacles),'rc03_obstacles_missing');
    previous=frame.tick;
    byTick.set(frame.tick,frame);
  }
  const lastTick=previous;
  const allowed=new Set(projection.world.entities.map(e=>e.id));
  for(const input of projection.inputs){
    assert(input.kind==='teleport'&&allowed.has(input.entityId),'rc03_invalid_input_kind_or_entity');
    assert(Number.isInteger(input.tick)&&input.tick>0&&input.tick<=lastTick,'rc03_invalid_input_tick');
  }
  const native=new EvercraftWorldRuntime(projection.world);
  assert(native.definitionDigest&&native.tick===0,'rc03_native_initialization_failed');
  const middle=Math.max(1,Math.floor(lastTick/2));
  let checkpoint=null, maxPoseDelta=0, sampleContactCount=0, sampleOverlapCount=0;
  let geometryContactAgreements=0;
  const contactEvidence=[];
  for(let tick=1;tick<=lastTick;tick++){
    const snapshot=native.step(projection.inputs);
    assert(snapshot.tick===tick&&verifyWorldSnapshot(snapshot),'rc03_native_snapshot_invalid');
    if(tick===middle)checkpoint=snapshot;
    const frame=byTick.get(tick);
    if(!frame)continue;
    const rover=snapshot.entities.find(e=>e.id==='rover');
    assert(rover,'rc03_rover_missing');
    const dx=rover.transform.position.x-frame.x,dz=rover.transform.position.z-frame.y;
    const delta=Math.hypot(dx,dz);
    maxPoseDelta=Math.max(maxPoseDelta,delta);
    assert(delta<=1e-9,'rc03_native_sample_pose_mismatch');
    const expectedContacts=frame.obstacles.filter(o=>Math.hypot(frame.x-o.x,frame.y-o.y)<episode.world.robotRadius+o.radius).map(o=>o.id).sort();
    const nativeContacts=snapshot.collisions.filter(c=>c.aId==='rover'||c.bId==='rover')
      .map(c=>c.aId==='rover'?c.bId:c.aId).sort();
    assert(JSON.stringify(expectedContacts)===JSON.stringify(nativeContacts),'rc03_sampled_contact_mismatch');
    geometryContactAgreements++;
    if(expectedContacts.length)sampleOverlapCount++;
    if(nativeContacts.length)sampleContactCount++;
    if(nativeContacts.length)contactEvidence.push({tick,obstacles:nativeContacts});
  }
  const final=native.snapshot();
  const replay=replayWorld(projection.world,lastTick,projection.inputs);
  assert(replay.deterministic&&replay.finalSnapshotDigest===final.digest,'rc03_native_replay_mismatch');
  assert(checkpoint,'rc03_checkpoint_missing');
  const restored=new EvercraftWorldRuntime(projection.world);
  const restoredSnapshot=restored.restoreSnapshot(checkpoint);
  assert(restoredSnapshot.digest===checkpoint.digest,'rc03_native_checkpoint_restore_failed');
  for(let tick=middle+1;tick<=lastTick;tick++)restored.step(projection.inputs);
  assert(restored.snapshot().digest===final.digest,'rc03_native_restored_replay_mismatch');
  const reverse=new EvercraftWorldRuntime(projection.world).run(lastTick,[...projection.inputs].reverse());
  assert(reverse.digest===final.digest,'rc03_native_input_order_mismatch');
  const core={schema:NATIVE_PROOF_SCHEMA,evidence_state:'modeled',experiment:'RC02 trajectory playback on the canonical World Engine runtime',
    seed:episode.seed,policy:episode.policy,sourceOutcome:episode.outcome.status,
    sourceEpisodeDigest:episode.sha256,projectionDigest:projection.sha256,
    nativeEngineExecuted:true,nativePhysicsSimulatedController:false,
    modeledTrajectoryTeleports:true,realSensorData:false,hardwareExecution:false,
    nativeSnapshotVerified:true,deterministicReplay:true,checkpointRestoreVerified:true,inputOrderInvariant:true,
    executedTicks:lastTick,recordedSampleFrames:frames.length,validatedCollisionSamples:geometryContactAgreements,
    maxRecordedPoseDifferenceMeters:maxPoseDelta,independentGeometryOverlapSamples:sampleOverlapCount,
    nativeContactSamples:sampleContactCount,contactEvidence,
    definitionDigest:native.definitionDigest,finalSnapshotDigest:final.digest,
    limitations:['teleport playback matches sampled modeled reference frames only',
      'unrecorded RC02 ticks do not contain independently observed rover poses',
      'native collision contacts at sampled poses are not continuous collision or stopping-distance guarantees',
      'no autonomous controller, command latency, motor or real sensor is exercised in World Engine',
      'SHA-256 digests show integrity/repeatability, not independent attestation or physical safety']};
  return {...core,sha256:digest(core)};
}

export function nativeBatch({seeds=4}={}){
  if(!Number.isInteger(seeds)||seeds<1||seeds>12)throw Error('rc03_invalid_seed_count');
  const runs=[];
  for(let seed=1;seed<=seeds;seed++){
    for(const policy of ['blind','safety-first'])runs.push(runNativeEpisode(challengeEpisode({seed,policy})));
  }
  const core={schema:'evercraft.sim-to-real.native-batch.rc03',evidence_state:'modeled',hardwareExecution:false,
    nativeWorldEngineUsed:true,allNativeReplaysVerified:runs.every(x=>x.deterministicReplay&&verifyNativeProof(x)),
    seeds,episodes:runs.length,runs};
  return {...core,sha256:digest(core)};
}

const main=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(main){
  const a=process.argv.slice(2),ix=a.indexOf('--seeds'),ox=a.indexOf('--out');
  const seeds=ix>=0?Number(a[ix+1]):4,out=ox>=0?a[ox+1]:null;
  const report=nativeBatch({seeds});
  if(out){fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify({schema:report.schema,episodes:report.episodes,allNativeReplaysVerified:report.allNativeReplaysVerified,
    contactSamples:report.runs.reduce((n,r)=>n+r.nativeContactSamples,0),sha256:report.sha256,output:out},null,2));
}