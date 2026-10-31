import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRng, hardwareCommand } from './rover-lab.mjs';

// Deliberately independent simulation, not an implementation of a robot safety controller.
export const CHALLENGE_SCHEMA = 'evercraft.sim-to-real.rover-challenge.rc02';
export const CHALLENGE_BENCHMARK_SCHEMA = 'evercraft.sim-to-real.challenge-benchmark.rc02';
export const DT = 0.1;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const round = v => Number(v.toFixed(5));
const wrap = v => Math.atan2(Math.sin(v),Math.cos(v));
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const sha = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const gauss = r => Math.sqrt(-2*Math.log(Math.max(r(),1e-12)))*Math.cos(2*Math.PI*r());

export function challengeWorld(seed) {
  const r=makeRng(seed);
  const params={
    traction:round(.68+r()*.38), steeringGain:round(.80+r()*.35), steeringBias:round((r()-.5)*.065),
    commandDelaySteps:1+Math.floor(r()*6), acceleration:round(.35+r()*.25), braking:round(.40+r()*.30),
    sensorNoiseMeters:round(.025+r()*.075), dropProbability:round(.02+r()*.15),
    sensorBlackoutStart:5+Math.floor(r()*95), sensorBlackoutLength:4+Math.floor(r()*18),
    movingSpeed:round(.18+r()*.25), initialHeading:round((r()-.5)*.4)
  };
  const obstacles=[
    {id:'static-a',x:3.0+(r()-.5)*.4,y:.10+(r()-.5)*.4,radius:.47+r()*.17},
    {id:'static-b',x:6.05+(r()-.5)*.5,y:-.45+(r()-.5)*.3,radius:.48+r()*.13},
    {id:'static-c',x:8.25+(r()-.5)*.35,y:.44+(r()-.5)*.3,radius:.42+r()*.14},
    {id:'moving',x:5.05+(r()-.5)*.3,y:-2.25,radius:.40+r()*.10,moving:true}
  ].map(o=>({...o,x:round(o.x),y:round(o.y),radius:round(o.radius)}));
  return {seed,dt:DT,params,obstacles,bounds:{xmin:-.7,xmax:10.8,ymin:-2.8,ymax:2.8},robotRadius:.22,
    goal:{x:10,y:0},goalRadius:.35,maxSpeed:1.0,maxYaw:1.7};
}
function worldObstacles(world,t){
  return world.obstacles.map(o=>o.moving?{...o,y:clamp(o.y+world.params.movingSpeed*t,-2.6,2.6)}:o);
}
function poseEstimate(pose,r,params){return {
  x:pose.x+gauss(r)*params.sensorNoiseMeters*.65,
  y:pose.y+gauss(r)*params.sensorNoiseMeters*.65,
  heading:wrap(pose.heading+gauss(r)*.025)
};}
// Anonymous range/bearing synthetic 2-D detection with limited range and FOV.
// This is NOT lidar ray tracing, occlusion, SLAM or real sensor data.
export function scanObstacles(pose,obstacles,r,noise=0){
  return obstacles.map(o=>{
    const center=distance(pose,o);
    const bearing=wrap(Math.atan2(o.y-pose.y,o.x-pose.x)-pose.heading);
    return {range:Math.max(0,center-o.radius+gauss(r)*noise),bearing:round(bearing),radius:o.radius};
  }).filter(s=>s.range<=2.8 && Math.abs(s.bearing)<=Math.PI*.49)
    .sort((a,b)=>a.range-b.range);
}
function nearestAhead(scan){return scan.find(s=>Math.abs(s.bearing)<.95)??null;}
function commandFor(policy,estimate,scan,nav,world,age){
  if(policy==='blind'){
    const e=wrap(Math.atan2(world.goal.y-estimate.y,world.goal.x-estimate.x)-estimate.heading);
    return {v:.94,yaw:clamp(2.8*e,-world.maxYaw,world.maxYaw),reason:'blind_goal'};
  }
  if(policy!=='safety-first')throw Error('unknown_policy');
  // Neither missing data nor an old scan is interpreted as an empty path.
  if(age>.25)return {v:0,yaw:0,reason:'sensor_stale_hold'};
  const front=nearestAhead(scan);
  if(front && front.range<2.5){
    // Choose an escape bearing away from the obstacle, and remember this side
    // until the frontal hazard is no longer visible to reduce oscillation.
    if(!nav.side)nav.side=front.bearing>=0?-1:1;
    nav.clearTicks=0;
  } else {
    nav.clearTicks++;
    if(nav.clearTicks>14)nav.side=0;
  }
  const headingGoal=wrap(Math.atan2(world.goal.y-estimate.y,world.goal.x-estimate.x)-estimate.heading);
  let target=headingGoal;
  if(front && front.range<2.5){
    const avoid=wrap(front.bearing+(nav.side||1)*1.34);
    const urgency=clamp((2.5-front.range)/1.7,0,1);
    target=wrap(headingGoal*(1-urgency)+avoid*urgency);
  }
  const yaw=clamp(3.0*target,-world.maxYaw,world.maxYaw);
  let v=clamp(.98-Math.abs(target)*.26,.22,.92);
  if(front){
    // Conservative assumed stop budget includes command pipeline and braking,
    // but can still be defeated by sensor loss and unmodeled conditions.
    const latency=(world.params.commandDelaySteps+1)*DT;
    const stopBudget=(nav.estimatedSpeed*latency)+nav.estimatedSpeed**2/(2*world.params.braking)+.28;
    if(front.range<stopBudget) v=0;
    else if(front.range<stopBudget+.8) v=Math.min(v,.35);
  }
  return {v,yaw,reason:front?'avoidance':'clear_scan'};
}
export function challengeEpisode({seed=1,policy='safety-first',maxSteps=650,recordFrames=true,forcedBlackout=null}={}){
  if(!['blind','safety-first'].includes(policy))throw Error('invalid_policy');
  if(!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>1500)throw Error('invalid_max_steps');
  const world=challengeWorld(seed),p=world.params,r=makeRng((seed^0xa1527e3b)>>>0);
  const pose={x:0,y:0,heading:p.initialHeading},nav={side:0,clearTicks:0,estimatedSpeed:0};
  const queue=[],frames=[];
  let lastScan=[],lastScanStep=-Infinity,speed=0,status='timeout',closest=Infinity;
  let totalDistance=0,holds=0,blindTicks=0,nearMissTicks=0,staleTicks=0,ticks=0;
  const blackout=forcedBlackout??{start:p.sensorBlackoutStart,length:p.sensorBlackoutLength};
  if(!Number.isInteger(blackout.start)||!Number.isInteger(blackout.length)||blackout.start<0||blackout.length<0)throw Error('invalid_blackout');
  for(let step=0;step<maxSteps;step++){
    ticks=step+1;
    const t=step*DT,obs=worldObstacles(world,t),estimate=poseEstimate(pose,r,p);
    const inBlackout=step>=blackout.start&&step<blackout.start+blackout.length;
    const sensorOk=!inBlackout&&r()>=p.dropProbability;
    if(sensorOk){lastScan=scanObstacles(pose,obs,r,p.sensorNoiseMeters);lastScanStep=step;}
    const age=(step-lastScanStep)*DT;
    if(!sensorOk)blindTicks++;
    if(age>.25)staleTicks++;
    nav.estimatedSpeed=Math.abs(speed);
    const requested=commandFor(policy,estimate,lastScan,nav,world,age);
    if(requested.reason==='sensor_stale_hold')holds++;
    queue.push(requested);
    const delayed=queue.length>p.commandDelaySteps?queue.shift():{v:0,yaw:0,reason:'startup_delay'};
    // Rate-limited speed models braking inertia. A stop request can arrive late.
    const delta=delayed.v-speed;
    const maxDelta=(delta>=0?p.acceleration:p.braking)*DT;
    speed+=clamp(delta,-maxDelta,maxDelta);
    const yaw=clamp(delayed.yaw,-world.maxYaw,world.maxYaw)*p.steeringGain+p.steeringBias;
    pose.heading=wrap(pose.heading+yaw*DT);
    const old={x:pose.x,y:pose.y};
    pose.x+=speed*p.traction*Math.cos(pose.heading)*DT+gauss(r)*.0007;
    pose.y+=speed*p.traction*Math.sin(pose.heading)*DT+gauss(r)*.0007;
    totalDistance+=distance(old,pose);
    const obsAfter=worldObstacles(world,t+DT);
    const gaps=obsAfter.map(o=>distance(pose,o)-world.robotRadius-o.radius);
    const gap=Math.min(...gaps);
    closest=Math.min(closest,gap);
    if(gap<.20)nearMissTicks++;
    if(recordFrames&&(step%3===0||gap<.25||requested.reason==='sensor_stale_hold')){
      frames.push({tick:ticks,t:round(t+DT),x:round(pose.x),y:round(pose.y),heading:round(pose.heading),speed:round(speed),
        command:requested.reason,commandedSpeed:round(requested.v),sensorFresh:sensorOk,age:round(age===Infinity?999:age),
        clearance:round(gap),obstacles:obsAfter.map(o=>({id:o.id,x:round(o.x),y:round(o.y),radius:o.radius}))});
    }
    if(gap<=0){status='collision';break;}
    if(pose.x<world.bounds.xmin||pose.x>world.bounds.xmax||pose.y<world.bounds.ymin||pose.y>world.bounds.ymax){status='geofence';break;}
    if(distance(pose,world.goal)<=world.goalRadius){status='arrived';break;}
  }
  const core={schema:CHALLENGE_SCHEMA,evidence_state:'modeled',hardware_execution:false,
    provenance:{source:'independent_kinematic_model',nativeWorldEngine:false,realSensorData:false,robotCommands:false},
    seed,policy,world,blackout,outcome:{status,success:status==='arrived',ticks,elapsedSeconds:round(ticks*DT),
    pathMeters:round(totalDistance),closestClearanceMeters:round(closest),sensorMissTicks:blindTicks,
    staleSensorTicks:staleTicks,holdRequests:holds,nearMissTicks},frames};
  return {...core,sha256:sha(core)};
}
export function verifyEpisode(receipt){
  if(!receipt||receipt.schema!==CHALLENGE_SCHEMA||typeof receipt.sha256!=='string')return false;
  const {sha256,...payload}=receipt;
  return sha(payload)===sha256;
}
export function challengeBenchmark({seeds=40}={}){
  if(!Number.isInteger(seeds)||seeds<1||seeds>300)throw Error('invalid_seed_count');
  const runs=[];
  for(let seed=1;seed<=seeds;seed++)for(const policy of ['blind','safety-first']){
    runs.push(challengeEpisode({seed,policy,recordFrames:seed<=4}));
  }
  const scores={};
  for(const policy of ['blind','safety-first']){
    const rr=runs.filter(r=>r.policy===policy);
    scores[policy]={total:rr.length,arrived:rr.filter(r=>r.outcome.status==='arrived').length,
      collisions:rr.filter(r=>r.outcome.status==='collision').length,
      geofence:rr.filter(r=>r.outcome.status==='geofence').length,
      timeouts:rr.filter(r=>r.outcome.status==='timeout').length,
      holdRequests:rr.reduce((a,r)=>a+r.outcome.holdRequests,0),
      nearMissTicks:rr.reduce((a,r)=>a+r.outcome.nearMissTicks,0)};
  }
  const core={schema:CHALLENGE_BENCHMARK_SCHEMA,evidence_state:'modeled',hardware_execution:false,
    contest:'partial-observation-multi-obstacle-kinematic-course',seeds,scores,runs};
  return {...core,sha256:sha(core)};
}
export function verifyBenchmark(receipt){
  if(!receipt||receipt.schema!==CHALLENGE_BENCHMARK_SCHEMA||typeof receipt.sha256!=='string')return false;
  const {sha256,...payload}=receipt;
  return sha(payload)===sha256&&payload.runs.every(verifyEpisode);
}
export const hardwareActuation=hardwareCommand;
const isMain=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isMain){
  const args=process.argv.slice(2),i=args.indexOf('--seeds'),j=args.indexOf('--out');
  const seeds=i>=0?Number(args[i+1]):40,out=j>=0?args[j+1]:null;
  const report=challengeBenchmark({seeds});
  if(out){fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify({schema:report.schema,sha256:report.sha256,scores:report.scores,output:out},null,2));
}