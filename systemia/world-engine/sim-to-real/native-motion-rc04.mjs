/**
 * RC04: velocity-controlled rover proxy driven by the canonical World Engine.
 * All pose integration and rigid-body contacts happen in EvercraftWorldRuntime.
 * No teleports, hardware adapter, real sensor input, or safety authority.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {EvercraftWorldRuntime,replayWorld,verifyWorldSnapshot} from '../engine.js';
import {challengeWorld} from './rover-challenge.mjs';
import {makeRng} from './rover-lab.mjs';

export const MOTION_SCHEMA='evercraft.sim-to-real.native-motion.rc04';
export const MOTION_BATCH_SCHEMA='evercraft.sim-to-real.native-motion-batch.rc04';
const DT=.1,ROVER='rover';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const round=v=>Number(v.toFixed(6));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const finite=n=>Number.isFinite(n);
const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
const clampVec=(v,max)=>{
  const len=Math.hypot(v.x,v.z);
  return len>max?{x:v.x*max/len,z:v.z*max/len}:{...v};
};
const scaled=(v,k)=>({x:v.x*k,z:v.z*k});
const roundedVec=v=>({x:round(v.x),z:round(v.z)});
const poseOf=entity=>({x:entity.transform.position.x,z:entity.transform.position.z});

/**
 * Independent continuous-time circle overlap oracle for a linear sweep.
 * Interpolates BOTH objects between tick boundaries, and can detect tunneling
 * missed by endpoint-only native discrete collision contacts.
 */
export function sweptCircleContact(a0,a1,ra,b0,b1,rb){
  for(const v of [a0.x,a0.z,a1.x,a1.z,ra,b0.x,b0.z,b1.x,b1.z,rb]){
    assert(finite(v),'rc04_invalid_sweep_value');
  }
  assert(ra>0&&rb>0,'rc04_invalid_sweep_radius');
  const rx=a0.x-b0.x, rz=a0.z-b0.z;
  const vx=(a1.x-a0.x)-(b1.x-b0.x);
  const vz=(a1.z-a0.z)-(b1.z-b0.z);
  const v2=vx*vx+vz*vz;
  const t=v2>0?clamp(-(rx*vx+rz*vz)/v2,0,1):0;
  const separation=Math.hypot(rx+vx*t,rz+vz*t);
  return {contact:separation<=ra+rb,clearance:round(separation-ra-rb),fraction:round(t)};
}
function validateBounds(p,b){return p.x>=b.xmin&&p.x<=b.xmax&&p.z>=b.ymin&&p.z<=b.ymax;}

export function createMotionWorld(seed){
  assert(Number.isSafeInteger(seed)&&seed>0,'rc04_invalid_seed');
  const course=challengeWorld(seed);
  assert(course.dt===DT,'rc04_tick_rate_mismatch');
  const world={schema:'evercraft.world-engine.world.v1',id:'sim-to-real-rc04-'+seed,version:1,tickRateHz:10,
    gravity:{x:0,y:0,z:0},ground:{enabled:false,height:0},
    entities:[
      {id:ROVER,transform:{position:{x:0,y:0,z:0}},collider:{type:'sphere',radius:course.robotRadius},
        rigidBody:{mass:1,gravityScale:0,linearDamping:0,restitution:0},
        tags:['modeled','controlled-by-tick-input'],properties:{source:'rc04',hardware_execution:false}},
      ...course.obstacles.map(o=>({id:o.id,transform:{position:{x:o.x,y:0,z:o.y}},
        collider:{type:'sphere',radius:o.radius},
        ...(o.moving?{rigidBody:{mass:1e8,gravityScale:0,linearDamping:0,restitution:0}}:{}),
        tags:['modeled','obstacle'],properties:{moving:!!o.moving}}))
    ],metadata:{evidence_state:'modeled',no_hardware_authority:true,
      movement:'native_dynamic_body_set_velocity',modeled_planar_proxy:true,
      collision:'native_discrete_contacts_plus_independent_segment_oracle'}};
  return {course,world};
}

function controllerCommand(policy,position,course,scanAge,observed,velocity,waypointIndex){
  if(!['blind','known-corridor'].includes(policy))throw Error('rc04_invalid_policy');
  const goal={x:course.goal.x,z:course.goal.y};
  const waypoints=[{x:1.4,z:1.9},{x:8.9,z:1.9},goal];
  let index=waypointIndex;
  if(policy==='known-corridor'){
    while(index<waypoints.length-1&&dist(position,waypoints[index])<.32)index++;
  }
  const target=policy==='blind'?goal:waypoints[index];
  const delta={x:target.x-position.x,z:target.z-position.z};
  const norm=Math.hypot(delta.x,delta.z);
  const speed=policy==='blind'?.95:.82;
  let command=norm<.08?{x:0,z:0}:scaled(delta,speed/Math.max(norm,1e-9));
  let reason=policy==='blind'?'blind_goal':'known_corridor';
  if(policy==='known-corridor'){
    if(scanAge>.25){command={x:0,z:0};reason='stale_sensor_hold';}
    else{
      const nearest=observed.reduce((a,b)=>Math.min(a,b),Infinity);
      const currentSpeed=Math.hypot(velocity.x,velocity.z);
      const latency=(course.params.commandDelaySteps+1)*DT;
      const budget=currentSpeed*latency+currentSpeed*currentSpeed/(2*course.params.braking)+.28;
      if(nearest<budget){command={x:0,z:0};reason='safety_hold';}
      else if(nearest<budget+.45){command=scaled(command,.4);reason='slow_near_hazard';}
    }
  }
  return {command:clampVec(command,course.maxSpeed),waypointIndex:index,reason};
}
function observeRanges(position,course,obstacles,rng){
  const noise=course.params.sensorNoiseMeters;
  return obstacles.map(o=>{
    const p=poseOf(o);
    return Math.max(0,dist(position,p)-course.robotRadius-o.collider.radius+(rng()-.5)*noise);
  }).filter(x=>x<3.0);
}

export function runMotionEpisode({seed=1,policy='known-corridor',maxTicks=300,forcedBlackout=null}={}){
  assert(['blind','known-corridor'].includes(policy),'rc04_invalid_policy');
  assert(Number.isInteger(maxTicks)&&maxTicks>0&&maxTicks<=600,'rc04_invalid_max_ticks');
  const {course,world}=createMotionWorld(seed);
  const blackout=forcedBlackout??{start:course.params.sensorBlackoutStart,length:course.params.sensorBlackoutLength};
  assert(Number.isInteger(blackout.start)&&Number.isInteger(blackout.length)&&blackout.start>=0&&blackout.length>=0,'rc04_invalid_blackout');
  const rng=makeRng((seed^0x4f137fcd)>>>0);
  const runtime=new EvercraftWorldRuntime(world);
  const velocityLedger=[],frames=[],queue=[];
  let lastObserved=[],lastSensorTick=-Infinity,waypointIndex=0,holdRequests=0;
  let nativeContacts=0,sweptContacts=0,geofenceViolations=0;
  let outcome='timeout',maxSpeedObserved=0,checkpoint=null;
  let previous=runtime.snapshot();
  for(let tick=1;tick<=maxTicks;tick++){
    const beforeRover=previous.entities.find(e=>e.id===ROVER);
    const oldPosition=poseOf(beforeRover);
    const oldVelocity={x:beforeRover.rigidBody.velocity.x,z:beforeRover.rigidBody.velocity.z};
    const obstaclesBefore=previous.entities.filter(e=>e.id!==ROVER);
    const inBlackout=(tick-1)>=blackout.start&&(tick-1)<blackout.start+blackout.length;
    const sensorFresh=!inBlackout&&rng()>=course.params.dropProbability;
    if(sensorFresh){
      lastObserved=observeRanges(oldPosition,course,obstaclesBefore,rng);
      lastSensorTick=tick;
    }
    const scanAge=(tick-lastSensorTick)*DT;
    const modeledPosition={x:oldPosition.x+(rng()-.5)*course.params.sensorNoiseMeters,
      z:oldPosition.z+(rng()-.5)*course.params.sensorNoiseMeters};
    const requested=controllerCommand(policy,modeledPosition,course,scanAge,lastObserved,oldVelocity,waypointIndex);
    waypointIndex=requested.waypointIndex;
    if(requested.reason.endsWith('_hold'))holdRequests++;
    queue.push(requested.command);
    const delayed=queue.length>course.params.commandDelaySteps?queue.shift():{x:0,z:0};
    const currentSpeed=Math.hypot(oldVelocity.x,oldVelocity.z);
    const targetSpeed=Math.hypot(delayed.x,delayed.z);
    const maxDelta=(targetSpeed<currentSpeed?course.params.braking:course.params.acceleration)*DT;
    const delta={x:delayed.x-oldVelocity.x,z:delayed.z-oldVelocity.z};
    const limited=clampVec(delta,maxDelta);
    const traction=course.params.traction;
    const applied=clampVec({x:oldVelocity.x+limited.x*traction,z:oldVelocity.z+limited.z*traction},course.maxSpeed);
    const inputs=[{id:'rc04-rover-velocity-'+tick,tick,entityId:ROVER,kind:'set_velocity',
      value:{x:applied.x,y:0,z:applied.z}}];
    const moving=obstaclesBefore.find(o=>o.id==='moving');
    if(moving){
      const movingVelocity=moving.transform.position.z<2.45?course.params.movingSpeed:0;
      inputs.push({id:'rc04-moving-velocity-'+tick,tick,entityId:'moving',kind:'set_velocity',
        value:{x:0,y:0,z:movingVelocity}});
    }
    velocityLedger.push(...inputs);
    const current=runtime.step(inputs);
    assert(current.tick===tick&&verifyWorldSnapshot(current),'rc04_native_snapshot_invalid');
    const afterRover=current.entities.find(e=>e.id===ROVER);
    const position=poseOf(afterRover),vel=afterRover.rigidBody.velocity;
    maxSpeedObserved=Math.max(maxSpeedObserved,Math.hypot(vel.x,vel.z));
    const collisions=current.collisions.filter(c=>c.aId===ROVER||c.bId===ROVER);
    if(collisions.length)nativeContacts++;
    const obstaclesAfter=current.entities.filter(e=>e.id!==ROVER);
    const swept=[];
    for(const obstacle of obstaclesAfter){
      const b0=obstaclesBefore.find(o=>o.id===obstacle.id);
      const result=sweptCircleContact(oldPosition,position,course.robotRadius,
        poseOf(b0),poseOf(obstacle),obstacle.collider.radius);
      if(result.contact)swept.push({id:obstacle.id,clearance:result.clearance,fraction:result.fraction});
    }
    if(swept.length)sweptContacts++;
    if(!validateBounds(position,course.bounds))geofenceViolations++;
    frames.push({tick,position:roundedVec(position),velocity:roundedVec({x:vel.x,z:vel.z}),
      requested:requested.reason,requestedSpeed:round(Math.hypot(requested.command.x,requested.command.z)),
      commandDelaySteps:course.params.commandDelaySteps,scanAgeSec:finite(scanAge)?round(scanAge):null,
      sensorFresh, nativeContacts:collisions.map(c=>({aId:c.aId,bId:c.bId,kind:c.kind})),
      sweptContacts:swept,obstacles:obstaclesAfter.map(o=>({id:o.id,...roundedVec(poseOf(o)),radius:o.collider.radius}))});
    previous=current;
    if(tick===Math.floor(maxTicks/2))checkpoint=current;
    if(collisions.length||swept.length){outcome='collision';break;}
    if(!validateBounds(position,course.bounds)){outcome='geofence';break;}
    if(dist(position,{x:course.goal.x,z:course.goal.y})<=course.goalRadius){outcome='arrived';break;}
  }
  const final=runtime.snapshot();
  const replay=replayWorld(world,final.tick,velocityLedger);
  assert(replay.deterministic&&replay.finalSnapshotDigest===final.digest,'rc04_native_replay_mismatch');
  if(checkpoint&&checkpoint.tick<final.tick){
    const restored=new EvercraftWorldRuntime(world);
    assert(restored.restoreSnapshot(checkpoint).digest===checkpoint.digest,'rc04_restore_failed');
    for(let tick=checkpoint.tick+1;tick<=final.tick;tick++)restored.step(velocityLedger);
    assert(restored.snapshot().digest===final.digest,'rc04_checkpoint_replay_mismatch');
  }
  const core={schema:MOTION_SCHEMA,evidence_state:'modeled',
    nativeWorldEngineExecuted:true,physicsDrivenMovement:true,teleportInputs:false,
    hardwareExecution:false,realSensors:false,realWorldSafetyVerified:false,
    surrogateModel:'planar velocity-controlled dynamic body; no tires, wheel slip, motor model or verified robot dynamics',
    seed,policy,worldDefinitionDigest:runtime.definitionDigest,finalSnapshotDigest:final.digest,
    course,blackout,outcome:{status:outcome,ticks:final.tick,
      arrived:outcome==='arrived',nativeContactTicks:nativeContacts,sweptContactTicks:sweptContacts,
      geofenceViolationTicks:geofenceViolations,holdRequests,
      maxSpeedObserved:round(maxSpeedObserved),recordedFrames:frames.length},
    integrity:{deterministicReplay:true,checkpointRestored:checkpoint?checkpoint.tick<final.tick:null,
      nativeSnapshotsVerified:true,fullTickRecording:true},
    velocityLedger,frames,
    limitations:['collision sweep is a relative line-segment oracle between tick endpoints, not a certified safety system',
      'native physics uses simple spheres, immediate set_velocity inputs and a planar proxy, not physical rover actuation',
      'queued control commands and stale sensors may still lead to collision',
      'controller follows an explicitly known waypoint corridor or direct-to-goal baseline; no SLAM or learned autonomy',
      'SHA-256 receipts indicate repeatability, not third-party attestation']};
  return {...core,sha256:hash(core)};
}

export function verifyMotionEpisode(episode){
  if(!episode||episode.schema!==MOTION_SCHEMA||typeof episode.sha256!=='string')return false;
  const {sha256,...core}=episode;
  if(hash(core)!==sha256||episode.hardwareExecution!==false||episode.realWorldSafetyVerified!==false)return false;
  if(!episode.frames||episode.frames.length!==episode.outcome?.ticks)return false;
  if(!Array.isArray(episode.velocityLedger)||!episode.velocityLedger.every(i=>i.kind==='set_velocity'))return false;
  return true;
}
export function motionBatch({seeds=4,maxTicks=300}={}){
  assert(Number.isInteger(seeds)&&seeds>0&&seeds<=12,'rc04_invalid_seed_count');
  const runs=[];
  for(let seed=1;seed<=seeds;seed++)for(const policy of ['blind','known-corridor']){
    runs.push(runMotionEpisode({seed,policy,maxTicks}));
  }
  const scores={};
  for(const policy of ['blind','known-corridor']){
    const filtered=runs.filter(r=>r.policy===policy);
    scores[policy]={total:filtered.length,arrived:filtered.filter(r=>r.outcome.status==='arrived').length,
      collisions:filtered.filter(r=>r.outcome.status==='collision').length,
      geofence:filtered.filter(r=>r.outcome.status==='geofence').length,
      timeouts:filtered.filter(r=>r.outcome.status==='timeout').length,
      nativeContactTicks:filtered.reduce((a,r)=>a+r.outcome.nativeContactTicks,0),
      sweptContactTicks:filtered.reduce((a,r)=>a+r.outcome.sweptContactTicks,0)};
  }
  const core={schema:MOTION_BATCH_SCHEMA,evidence_state:'modeled',hardwareExecution:false,
    nativeWorldEngineExecuted:true,seeds,scores,runs};
  return {...core,sha256:hash(core)};
}
export function verifyMotionBatch(batch){
  if(!batch||batch.schema!==MOTION_BATCH_SCHEMA||typeof batch.sha256!=='string')return false;
  const {sha256,...core}=batch;
  return hash(core)===sha256&&Array.isArray(batch.runs)&&batch.runs.every(verifyMotionEpisode);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),n=args.indexOf('--seeds'),o=args.indexOf('--out');
  const seeds=n>=0?Number(args[n+1]):4,output=o>=0?args[o+1]:null;
  const report=motionBatch({seeds});
  if(output){fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify({schema:report.schema,scores:report.scores,
    verified:verifyMotionBatch(report),sha256:report.sha256,output},null,2));
}