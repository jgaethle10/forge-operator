/** RC05: reactive rover inside canonical World Engine native dynamic simulation.
 * No teleports, physical commands, independent safety certification or live sensors.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {EvercraftWorldRuntime,replayWorld,verifyWorldSnapshot} from '../engine.js';
import {createMotionWorld,sweptCircleContact,runMotionEpisode} from './native-motion-rc04.mjs';
import {makeRng} from './rover-lab.mjs';
import {scanAnonymous,reactiveCommand} from './controller-rc05.mjs';
import {reactiveCommandProgress} from './controller-rc05-progress.mjs';
import {reactiveCommandShielded} from './controller-rc05-shield.mjs';
import {reactiveCommandEscape} from './controller-rc05-escape.mjs';
import {updateMotionMemory,reactiveCommandMotionWatch} from './controller-rc05-motion-watch.mjs';

export const RC05_SCHEMA='evercraft.sim-to-real.reactive-native.rc05';
export const RC05_BENCHMARK='evercraft.sim-to-real.reactive-holdout.rc05';
const DT=.1;
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const round=n=>Number(n.toFixed(6));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const xy=e=>({x:e.transform.position.x,z:e.transform.position.z});
const length=v=>Math.hypot(v.x,v.z);
const assert=(ok,msg)=>{if(!ok)throw Error(msg);};

export function runReactiveEpisode({seed=41,maxTicks=350,forcedBlackout=null,controllerMode='baseline'}={}){
  assert(Number.isSafeInteger(seed)&&seed>0,'rc05_invalid_seed');
  assert(['baseline','progress-gated','progress-shielded','observed-lateral-escape','observed-motion-watch'].includes(controllerMode),'rc05_invalid_controller_mode');
  assert(Number.isInteger(maxTicks)&&maxTicks>0&&maxTicks<=650,'rc05_invalid_max_ticks');
  const {course,world}=createMotionWorld(seed);
  const blackout=forcedBlackout??{start:course.params.sensorBlackoutStart,length:course.params.sensorBlackoutLength};
  assert(Number.isInteger(blackout.start)&&blackout.start>=0&&Number.isInteger(blackout.length)&&blackout.length>=0,'rc05_invalid_blackout');
  const rng=makeRng((seed^0x50916d2c)>>>0);
  const engine=new EvercraftWorldRuntime(world);
  const frames=[],inputs=[],queue=[];
  let status='timeout',previous=engine.snapshot(),lastScan=[],lastGoodTick=-Infinity;
  let preferredTurn=0,uncertainty=.055,orientation=0,holdRequests=0,holdsWhileMoving=0;
  let contactTicks=0,sweepTicks=0,geofenceTicks=0,sensorMissTicks=0;
  let checkpoint=null;
  let motionHistory=[];
  for(let tick=1;tick<=maxTicks;tick++){
    const robotBefore=previous.entities.find(e=>e.id==='rover');
    const obstaclesBefore=previous.entities.filter(e=>e.id!=='rover');
    const p0=xy(robotBefore),v0={x:robotBefore.rigidBody.velocity.x,z:robotBefore.rigidBody.velocity.z};
    if(length(v0)>.04)orientation=Math.atan2(v0.z,v0.x);
    const inBlackout=(tick-1)>=blackout.start&&(tick-1)<blackout.start+blackout.length;
    const observed=!inBlackout&&rng()>=course.params.dropProbability;
    if(observed){
      lastScan=scanAnonymous({pose:{...p0,heading:orientation},obstacles:obstaclesBefore.map(o=>({
        ...xy(o),radius:o.collider.radius})),rng,noise:course.params.sensorNoiseMeters});
      lastGoodTick=tick;uncertainty=Math.max(.045,uncertainty*.58);
    }else{sensorMissTicks++;uncertainty=Math.min(1,uncertainty+.027);}
    const age=Number.isFinite(lastGoodTick)?(tick-lastGoodTick)*DT:Infinity;
    const estimate={x:p0.x+(rng()-.5)*course.params.sensorNoiseMeters+uncertainty*.12,
      z:p0.z+(rng()-.5)*course.params.sensorNoiseMeters-uncertainty*.08,
      heading:orientation+(rng()-.5)*.03};
    let motionTracks=[];
    if(controllerMode==='observed-motion-watch'&&observed){
      const tracking=updateMotionMemory({history:motionHistory,scan:lastScan,estimate,tick,dt:DT});
      motionHistory=tracking.history;
      motionTracks=tracking.tracks;
    }
    const decide=controllerMode==='progress-gated'?reactiveCommandProgress:
      controllerMode==='progress-shielded'?reactiveCommandShielded:
      controllerMode==='observed-lateral-escape'?reactiveCommandEscape:
      controllerMode==='observed-motion-watch'?reactiveCommandMotionWatch:reactiveCommand;
    const decision=decide({estimate,goal:{x:course.goal.x,z:course.goal.y},
      bounds:course.bounds,scan:lastScan,scanAgeSec:age,velocity:v0,uncertainty,
      delaySeconds:course.params.commandDelaySteps*DT,braking:course.params.braking,
      maxSpeed:.82,robotRadius:course.robotRadius,state:{preferredTurn},tracks:motionTracks});
    preferredTurn=decision.state.preferredTurn;
    if(decision.reason.endsWith('_hold')||decision.reason==='goal_hold'){
      holdRequests++;if(length(v0)>.02)holdsWhileMoving++;
    }
    queue.push(decision.velocity);
    const delayed=queue.length>course.params.commandDelaySteps?queue.shift():{x:0,z:0};
    const delta={x:delayed.x-v0.x,z:delayed.z-v0.z};
    const dLength=length(delta);
    const braking=length(delayed)<length(v0);
    const maxDv=(braking?course.params.braking:course.params.acceleration)*DT;
    const ratio=dLength>maxDv?maxDv/dLength:1;
    const applied={x:v0.x+delta.x*ratio*course.params.traction,
      z:v0.z+delta.z*ratio*course.params.traction};
    const appliedLen=length(applied);
    if(appliedLen>course.maxSpeed){applied.x*=course.maxSpeed/appliedLen;applied.z*=course.maxSpeed/appliedLen;}
    const stepInputs=[{id:'rc05-rover-'+tick,tick,entityId:'rover',kind:'set_velocity',
      value:{x:applied.x,y:0,z:applied.z}}];
    const moving=obstaclesBefore.find(o=>o.id==='moving');
    if(moving)stepInputs.push({id:'rc05-moving-'+tick,tick,entityId:'moving',kind:'set_velocity',
      value:{x:0,y:0,z:moving.transform.position.z<2.45?course.params.movingSpeed:0}});
    inputs.push(...stepInputs);
    const next=engine.step(stepInputs);
    assert(next.tick===tick&&verifyWorldSnapshot(next),'rc05_native_snapshot_invalid');
    const roverAfter=next.entities.find(e=>e.id==='rover');
    const p1=xy(roverAfter);
    const contacts=next.collisions.filter(c=>c.aId==='rover'||c.bId==='rover');
    const sweeps=[];
    for(const o of next.entities.filter(e=>e.id!=='rover')){
      const before=obstaclesBefore.find(b=>b.id===o.id);
      const sweep=sweptCircleContact(p0,p1,course.robotRadius,xy(before),xy(o),o.collider.radius);
      if(sweep.contact)sweeps.push({id:o.id,clearance:sweep.clearance,fraction:sweep.fraction});
    }
    if(contacts.length)contactTicks++;
    if(sweeps.length)sweepTicks++;
    const out=p1.x<course.bounds.xmin||p1.x>course.bounds.xmax||p1.z<course.bounds.ymin||p1.z>course.bounds.ymax;
    if(out)geofenceTicks++;
    frames.push({tick,position:{x:round(p1.x),z:round(p1.z)},velocity:{x:round(roverAfter.rigidBody.velocity.x),
      z:round(roverAfter.rigidBody.velocity.z)},sensorFresh:observed,sensorAge:Number.isFinite(age)?round(age):null,
      uncertainty:round(uncertainty),observedObstacleCount:lastScan.length,requested:decision.reason,
      ...(decision.shield?{shieldDiagnostics:decision.shield}:{}),
      ...(decision.escape?{escapeDiagnostics:decision.escape}:{}),
      ...(decision.motionWatch?{motionWatchDiagnostics:decision.motionWatch}:{}),
      requestedSpeed:round(length(decision.velocity)),appliedSpeed:round(length(applied)),
      nativeContacts:contacts.map(c=>({aId:c.aId,bId:c.bId})),sweptContacts:sweeps,
      obstacles:next.entities.filter(e=>e.id!=='rover').map(e=>({id:e.id,...xy(e),radius:e.collider.radius}))});
    previous=next;
    if(tick===Math.max(1,Math.floor(maxTicks/2)))checkpoint=next;
    if(contacts.length||sweeps.length){status='collision';break;}
    if(out){status='geofence';break;}
    if(Math.hypot(p1.x-course.goal.x,p1.z-course.goal.y)<=course.goalRadius){status='arrived';break;}
  }
  const final=engine.snapshot(),replay=replayWorld(world,final.tick,inputs);
  assert(replay.deterministic&&replay.finalSnapshotDigest===final.digest,'rc05_native_replay_mismatch');
  let restored=false;
  if(checkpoint&&checkpoint.tick<final.tick){
    const other=new EvercraftWorldRuntime(world);
    assert(other.restoreSnapshot(checkpoint).digest===checkpoint.digest,'rc05_checkpoint_restore_failed');
    for(let tick=checkpoint.tick+1;tick<=final.tick;tick++)other.step(inputs);
    assert(other.snapshot().digest===final.digest,'rc05_checkpoint_replay_mismatch');
    restored=true;
  }
  const core={schema:RC05_SCHEMA,evidence_state:'modeled',nativeWorldEngineExecuted:true,
    hardwareExecution:false,realSensorData:false,autonomousHardwareControl:false,
    noTeleportInputs:true,robotPhysicsCalibrated:false,
    seed,controllerMode,model:'native planar sphere with velocity commands, synthetic noisy anonymous proximity scans',
    worldDigest:engine.definitionDigest,finalSnapshotDigest:final.digest,
    outcome:{status,ticks:final.tick,holdRequests,holdsWhileMoving,contactTicks,sweepTicks,geofenceTicks,sensorMissTicks},
    proof:{deterministicReplay:true,snapshotRestored:restored,allTicksRecorded:frames.length===final.tick},
    courseBounds:course.bounds,goal:course.goal,inputs,frames,
    limitations:['synthetic proximity scans are not physical lidar or robust localization',
      'controller uses global modeled pose with injected noise; no SLAM or sensor-fusion estimator',
      'holonomic velocity proxy and simplified obstacle kinetics are not a real rover model',
      'sensor occlusion and hold requests do not guarantee stopping or collision avoidance',
      'native discrete contacts and an independent line-segment sweep are both recorded, but neither is safety certification']};
  return {...core,sha256:hash(core)};
}
export function verifyReactiveEpisode(receipt){
  if(!receipt||receipt.schema!==RC05_SCHEMA||typeof receipt.sha256!=='string')return false;
  const {sha256,...core}=receipt;
  return hash(core)===sha256&&receipt.hardwareExecution===false&&receipt.realSensorData===false&&
    receipt.noTeleportInputs===true&&receipt.frames?.length===receipt.outcome?.ticks&&
    receipt.inputs?.every(i=>i.kind==='set_velocity');
}
export function runHeldOut({firstSeed=41,seeds=8,maxTicks=350}={}){
  assert(Number.isSafeInteger(firstSeed)&&firstSeed>=1&&Number.isInteger(seeds)&&seeds>0&&seeds<=16,'rc05_invalid_benchmark');
  const runs=[],baselines=[];
  for(let seed=firstSeed;seed<firstSeed+seeds;seed++){
    const reactive=runReactiveEpisode({seed,maxTicks});
    const base=runMotionEpisode({seed,policy:'known-corridor',maxTicks});
    runs.push(reactive);
    baselines.push({seed,status:base.outcome.status,ticks:base.outcome.ticks,sha256:base.sha256});
  }
  const counts=(items,selector)=>({total:items.length,arrived:items.filter(x=>selector(x)==='arrived').length,
    collisions:items.filter(x=>selector(x)==='collision').length,
    geofence:items.filter(x=>selector(x)==='geofence').length,
    timeouts:items.filter(x=>selector(x)==='timeout').length});
  const core={schema:RC05_BENCHMARK,evidence_state:'modeled',firstSeed,seeds,
    hardwareExecution:false,comparison:'paired course seed only; different simulated sensor/controller contracts',
    reactive:counts(runs,x=>x.outcome.status),priorKnownCorridor:counts(baselines,x=>x.status),
    runs,baselineOutcomes:baselines};
  return {...core,sha256:hash(core)};
}
export function verifyHeldOut(report){
  if(!report||report.schema!==RC05_BENCHMARK||typeof report.sha256!=='string')return false;
  const {sha256,...core}=report;
  return hash(core)===sha256&&report.hardwareExecution===false&&report.runs?.every(verifyReactiveEpisode);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),si=args.indexOf('--seeds'),fi=args.indexOf('--first-seed'),oi=args.indexOf('--out');
  const report=runHeldOut({firstSeed:fi>=0?Number(args[fi+1]):41,seeds:si>=0?Number(args[si+1]):8});
  const out=oi>=0?args[oi+1]:null;
  if(out){fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify({schema:report.schema,seeds:report.seeds,reactive:report.reactive,
    baseline:report.priorKnownCorridor,sha256:report.sha256,verified:verifyHeldOut(report),out},null,2));
}
