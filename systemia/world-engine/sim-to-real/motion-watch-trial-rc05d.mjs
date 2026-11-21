/** RC05D synthetic-only moving-hazard-monitor A/B/C in native World Engine. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runReactiveEpisode,verifyReactiveEpisode} from './native-reactive-rc05.mjs';
import {assessShieldEvidence} from './shield-trial-rc05b.mjs';
export const MOTION_WATCH_TRIAL_SCHEMA='evercraft.sim-to-real.motion-watch-review.rc05d';
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const modes={baseline:'baseline',escape:'observed-lateral-escape',motionWatch:'observed-motion-watch'};
function summary(rows,key){
  const ret={total:rows.length,arrived:0,collisions:0,geofence:0,timeouts:0,
    shieldedMoves:0,motionHolds:0};
  for(const row of rows){
    const r=row[key];
    const label=r.status==='arrived'?'arrived':r.status==='collision'?'collisions':
      r.status==='geofence'?'geofence':'timeouts';
    ret[label]++;ret.shieldedMoves+=r.detourRequests;ret.motionHolds+=r.motionHolds;
  }
  return ret;
}
export function runMotionWatchTrial({firstSeed=49,seeds=8,maxTicks=350}={}){
  if(!Number.isSafeInteger(firstSeed)||firstSeed<1||!Number.isInteger(seeds)||seeds<1||seeds>16||
    !Number.isInteger(maxTicks)||maxTicks<1||maxTicks>650)throw Error('rc05d_invalid_cohort');
  const pairs=[];
  for(let seed=firstSeed;seed<firstSeed+seeds;seed++){
    const item={seed};
    for(const [key,controllerMode] of Object.entries(modes)){
      const ep=runReactiveEpisode({seed,maxTicks,controllerMode});
      if(!verifyReactiveEpisode(ep)||ep.hardwareExecution!==false||ep.noTeleportInputs!==true)
        throw Error('rc05d_native_evidence_invalid');
      const last=ep.frames.at(-1);
      const status=ep.outcome.status;
      item[key]={status,ticks:ep.outcome.ticks,
        detourRequests:ep.frames.filter(x=>x.requested==='observed_lateral_escape').length,
        motionHolds:ep.frames.filter(x=>x.requested==='moving_hazard_hold').length,
        watchedTicks:ep.frames.filter(x=>x.motionWatchDiagnostics?.trackedObjects>0).length,
        collisionObstacleIds:status==='collision'?[...new Set([
          ...(last?.nativeContacts||[]).flatMap(c=>[c.aId,c.bId]).filter(id=>id!=='rover'),
          ...(last?.sweptContacts||[]).map(c=>c.id)])].sort():[],
        finalPosition:last?.position,
        // Ground truth only in diagnostic terminal window, never fed to controller.
        failureWindow:status==='collision'||status==='geofence'?
          ep.frames.slice(-16).map(f=>({tick:f.tick,position:f.position,velocity:f.velocity,
            requested:f.requested,watch:f.motionWatchDiagnostics||null,
            nativeContacts:f.nativeContacts,sweptContacts:f.sweptContacts,
            obstaclePositionsForDiagnosisOnly:f.obstacles})) :[],
        digest:ep.sha256};
    }
    pairs.push(item);
  }
  const scores=Object.fromEntries(Object.keys(modes).map(key=>[key,summary(pairs,key)]));
  const review=assessShieldEvidence({baseline:scores.baseline,shield:scores.motionWatch},
    pairs.map(p=>({baseline:p.baseline,shield:p.motionWatch})));
  // Additional requirement: a moving-hazard monitor must actually observe hazards.
  const observed=scoreObservedHazards(pairs);
  if(review.reviewEligible&&!observed){
    review.reviewEligible=false;review.reasons.push('moving_hazard_monitor_no_observations');
  }
  const core={schema:MOTION_WATCH_TRIAL_SCHEMA,evidence_state:'modeled',
    firstSeed,seeds,maxTicks,hardwareExecution:false,realSensorData:false,
    productionAuthorized:false,defaultController:'baseline',
    source:'native World Engine, synthetic anonymous scan histories only',
    limitations:['simple estimated obstacle velocity and constant-velocity prediction',
      'sensor occlusion and missing observations can hide moving objects',
      'no guaranteed braking or physical-world collision avoidance',
      'all development/evaluation cohorts use same synthetic map generator'],
    scores,pairs,review};
  return {...core,sha256:hash(core)};
}
function scoreObservedHazards(pairs){return pairs.some(p=>p.motionWatch.watchedTicks>0);}
export function verifyMotionWatchTrial(r){
  if(!r||r.schema!==MOTION_WATCH_TRIAL_SCHEMA||typeof r.sha256!=='string')return false;
  const {sha256,...core}=r;
  return hash(core)===sha256&&r.hardwareExecution===false&&r.productionAuthorized===false&&
    r.review?.productionAuthorized===false&&r.review?.hardwareAuthorized===false&&
    Array.isArray(r.pairs)&&r.pairs.length===r.seeds&&Object.keys(modes).every(key=>{
      const s=r.scores[key];return s?.total===r.seeds&&
        s.total===s.arrived+s.collisions+s.geofence+s.timeouts;
    });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const a=process.argv.slice(2),get=(key,otherwise)=>{
    const i=a.indexOf(key);return i<0?otherwise:Number(a[i+1]);};
  const r=runMotionWatchTrial({firstSeed:get('--first-seed',49),seeds:get('--seeds',8)});
  const at=a.indexOf('--out');if(at>=0){const dest=path.resolve(a[at+1]);
    fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(r,null,2)+'\n');}
  console.log('RC05D REVIEW',JSON.stringify({seedRange:[r.firstSeed,r.firstSeed+r.seeds-1],
    scores:r.scores,review:r.review,perSeed:r.pairs.map(p=>({seed:p.seed,
      baseline:p.baseline.status,escape:p.escape.status,motionWatch:p.motionWatch.status,
      holds:p.motionWatch.motionHolds,observed:p.motionWatch.watchedTicks,
      collisionObstacleIds:p.motionWatch.collisionObstacleIds})),digest:r.sha256}));
}
