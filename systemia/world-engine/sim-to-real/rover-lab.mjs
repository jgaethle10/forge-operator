import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Evercraft Sim-to-Real Lab RC01. Simulation only: no network, motor, GPIO, or actuator APIs.
export const CONTRACT = 'evercraft.sim-to-real.rover-lab.rc01';
export const SCENE = Object.freeze({
  dt: 0.1, maxSteps: 550, robotRadius: 0.23, goal: { x: 10, y: 0 },
  obstacle: { x: 5, y: 0, radius: 0.95 },
  bounds: { xmin: -1, xmax: 11, ymin: -4.5, ymax: 4.5 },
  safeMargin: 0.30, maxSpeed: 0.94, maxYawRate: 1.7,
});
const clamp = (x,lo,hi) => Math.max(lo,Math.min(hi,x));
const wrapAngle = x => Math.atan2(Math.sin(x),Math.cos(x));
const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const fixed = x => Number(x.toFixed(5));
export function makeRng(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw Error('invalid_seed');
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15),t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7),t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(rng){
  const u = Math.max(rng(),1e-12);
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rng());
}
function parameters(seed){
  const rng = makeRng(seed);
  const p = {
    traction: fixed(0.72 + rng()*0.33),
    steeringGain: fixed(0.78 + rng()*0.35),
    steeringBias: fixed((rng()-.5)*0.11),
    commandDelaySteps: Math.floor(rng()*5),
    poseNoiseMeters: fixed(0.025 + rng()*0.075),
    compassNoiseRadians: fixed(0.01 + rng()*0.035),
    obstacleOffset: {x: fixed((rng()-.5)*.3),y:fixed((rng()-.5)*.50)},
    initialHeading: fixed((rng()-.5)*.55),
  };
  return {rng,p};
}
export function safetyGate(command,estimate,scene=SCENE){
  if (!command || !Number.isFinite(command.v) || !Number.isFinite(command.yaw)) {
    return {v:0,yaw:0,blocked:true,reason:'invalid_command'};
  }
  if(!estimate || ![estimate.x,estimate.y,estimate.heading].every(Number.isFinite)) {
    return {v:0,yaw:0,blocked:true,reason:'invalid_estimate'};
  }
  const obstacle = scene.obstacle;
  const clearance = dist(estimate,obstacle) - obstacle.radius - scene.robotRadius;
  const toward = Math.cos(Math.atan2(obstacle.y-estimate.y,obstacle.x-estimate.x)-estimate.heading);
  if (clearance < scene.safeMargin && toward > 0.25 && command.v > 0) {
    return {v:0,yaw:0,blocked:true,reason:'obstacle_proximity'};
  }
  if(estimate.x < scene.bounds.xmin+.25 || estimate.x > scene.bounds.xmax-.25 ||
     estimate.y < scene.bounds.ymin+.25 || estimate.y > scene.bounds.ymax-.25) {
    return {v:0,yaw:0,blocked:true,reason:'geofence_proximity'};
  }
  return {v:clamp(command.v,0,scene.maxSpeed),yaw:clamp(command.yaw,-scene.maxYawRate,scene.maxYawRate),blocked:false,reason:null};
}
function plan(policy){
  if(policy==='baseline') return [SCENE.goal];
  if(policy==='guarded') return [{x:3.05,y:-2.05},{x:7.05,y:-2.05},SCENE.goal];
  throw Error('invalid_policy');
}
export function simulate({seed=1,policy='guarded',recordFrames=true,maxSteps=SCENE.maxSteps}={}){
  if(!Number.isInteger(maxSteps) || maxSteps<1 || maxSteps>5000) throw Error('invalid_max_steps');
  const {rng,p} = parameters(seed);
  const obstacle = {...SCENE.obstacle,x:SCENE.obstacle.x+p.obstacleOffset.x,y:SCENE.obstacle.y+p.obstacleOffset.y};
  const scene = {...SCENE,obstacle};
  const waypoints = plan(policy);
  const pose = {x:0,y:0,heading:p.initialHeading};
  const bias={x:(rng()-.5)*.045,y:(rng()-.5)*.045};
  const frames=[];
  const commandQueue=[];
  let waypoint=0,pathLength=0,shieldCount=0,closestClearance=Infinity,status='timeout';
  let ticks=0;
  for(let step=0;step<maxSteps;step++){
    ticks=step+1;
    const estimate={
      x:pose.x + bias.x + gaussian(rng)*p.poseNoiseMeters,
      y:pose.y + bias.y + gaussian(rng)*p.poseNoiseMeters,
      heading:wrapAngle(pose.heading+gaussian(rng)*p.compassNoiseRadians),
    };
    if(dist(estimate,waypoints[waypoint]) < (waypoint===waypoints.length-1?.33:.4)) {
      if(waypoint===waypoints.length-1 && dist(pose,SCENE.goal)<.42){status='arrived';break;}
      if(waypoint < waypoints.length-1) waypoint++;
    }
    const target=waypoints[waypoint];
    const headingError=wrapAngle(Math.atan2(target.y-estimate.y,target.x-estimate.x)-estimate.heading);
    const targetDistance=dist(estimate,target);
    const v=clamp(1-Math.abs(headingError)/1.7,0,.99)*clamp(targetDistance/.7,.22,1)*SCENE.maxSpeed;
    const yaw=clamp(3.2*headingError,-SCENE.maxYawRate,SCENE.maxYawRate);
    // A separate policy class: baseline can navigate but has no obstacle waypoint plan.
    const command=safetyGate({v,yaw},estimate,scene);
    if(command.blocked) shieldCount++;
    commandQueue.push(command);
    const actuated=commandQueue.length>p.commandDelaySteps?commandQueue.shift():{v:0,yaw:0};
    const old={x:pose.x,y:pose.y};
    const yawRate=actuated.yaw*p.steeringGain+p.steeringBias;
    pose.heading=wrapAngle(pose.heading+yawRate*SCENE.dt);
    const speed=actuated.v*p.traction;
    pose.x+=speed*Math.cos(pose.heading)*SCENE.dt + gaussian(rng)*.0012;
    pose.y+=speed*Math.sin(pose.heading)*SCENE.dt + gaussian(rng)*.0012;
    pathLength+=dist(old,pose);
    const clearance=dist(pose,obstacle)-obstacle.radius-SCENE.robotRadius;
    closestClearance=Math.min(closestClearance,clearance);
    if(recordFrames && (step%2===0 || clearance<0.15)) frames.push({t:fixed((step+1)*SCENE.dt),x:fixed(pose.x),y:fixed(pose.y),heading:fixed(pose.heading),estimateX:fixed(estimate.x),estimateY:fixed(estimate.y),speed:fixed(speed),shielded:command.blocked,waypoint});
    if(clearance<=0){status='collision';break;}
    if(pose.x < scene.bounds.xmin || pose.x > scene.bounds.xmax || pose.y < scene.bounds.ymin || pose.y > scene.bounds.ymax){status='geofence';break;}
    if(dist(pose,scene.goal)<.31 && waypoint===waypoints.length-1){status='arrived';break;}
  }
  const core={
    schema:CONTRACT, evidence_state:'modeled', hardware_execution:false,
    seed,policy,parameters:p,scene:{...SCENE,obstacle},waypoints,
    outcome:{status,success:status==='arrived',steps:ticks,elapsedSeconds:fixed(ticks*SCENE.dt),
      pathLengthMeters:fixed(pathLength),closestClearanceMeters:fixed(closestClearance),shieldInterventions:shieldCount},
    frames
  };
  return {...core,sha256:crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex')};
}
export function benchmark({seeds=40}={}){
  if(!Number.isInteger(seeds)||seeds<1||seeds>300)throw Error('invalid_seed_count');
  const runs=[];
  for (let seed=1;seed<=seeds;seed++) {
    for (const policy of ['baseline','guarded']) {
      // Retain four visual examples per policy; every scenario retains full outcome metrics.
      const result=simulate({seed,policy,recordFrames:seed<=4});
      runs.push(result);
    }
  }
  const scores={};
  for (const policy of ['baseline','guarded']){
    const subset=runs.filter(r=>r.policy===policy);
    scores[policy]={
      total:subset.length,arrived:subset.filter(r=>r.outcome.status==='arrived').length,
      collisions:subset.filter(r=>r.outcome.status==='collision').length,
      timeouts:subset.filter(r=>r.outcome.status==='timeout').length,
      geofenceViolations:subset.filter(r=>r.outcome.status==='geofence').length,
      successRate:fixed(subset.filter(r=>r.outcome.success).length/subset.length),
      averagePathMeters:fixed(subset.reduce((a,r)=>a+r.outcome.pathLengthMeters,0)/subset.length),
    };
  }
  const body={schema:'evercraft.sim-to-real.benchmark.rc01',evidence_state:'modeled',hardware_execution:false,
    issuedBy:'local-simulation-not-a-device',description:'Unicycle-approximation rover with randomized actuator/sensor conditions. Not a validated physics engine or real robot.',seeds,scene:SCENE,scores,runs};
  return {...body,sha256:crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')};
}
// Deliberate fail-closed hardware boundary. A physical adapter requires a separate reviewed component.
export function hardwareCommand(){throw Error('hardware_actuation_not_implemented_requires_independent_safety_validation');}
const isMain=process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if (isMain){
  const args=process.argv.slice(2);
  const argValue=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
  const seeds=Number(argValue('--seeds','40'));
  const out=argValue('--out','');
  const report=benchmark({seeds});
  if(out){fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');}
  process.stdout.write(JSON.stringify({sha256:report.sha256,score:report.scores,output:out||null},null,2)+'\n');
}