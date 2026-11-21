/** RC05E A/B/C/D native Engine diagnostics: modeled physics and synthetic data only. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runReactiveEpisode,verifyReactiveEpisode} from './native-reactive-rc05.mjs';
import {assessShieldEvidence} from './shield-trial-rc05b.mjs';
export const LATCH_TRIAL_SCHEMA='evercraft.sim-to-real.persistent-motion-watch-review.rc05e';
const sha=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const modes={baseline:'baseline',escape:'observed-lateral-escape',motionWatch:'observed-motion-watch',latched:'observed-motion-latched'};
const score=(rows,k)=>{
  const r={total:rows.length,arrived:0,collisions:0,geofence:0,timeouts:0,shieldedMoves:0,
    latchedHolds:0,modeledCanceledCommands:0};
  for(const row of rows){const e=row[k];const name=e.status==='collision'?'collisions':e.status==='geofence'?'geofence':
    e.status==='arrived'?'arrived':'timeouts';r[name]++;
    r.shieldedMoves+=e.detourRequests;
    r.latchedHolds+=e.latchedHolds;
    r.modeledCanceledCommands+=e.modeledCanceledCommands;
  }
  return r;
};
export function runLatchTrial({firstSeed=49,seeds=8,maxTicks=350}={}){
  if(!Number.isSafeInteger(firstSeed)||firstSeed<1||!Number.isInteger(seeds)||seeds<1||seeds>16||
    !Number.isInteger(maxTicks)||maxTicks<1||maxTicks>650)throw Error('rc05e_invalid_trial');
  const pairs=[];
  for(let seed=firstSeed;seed<firstSeed+seeds;seed++){
    const row={seed};
    for(const [key,mode] of Object.entries(modes)){
      const e=runReactiveEpisode({seed,maxTicks,controllerMode:mode});
      if(!verifyReactiveEpisode(e)||e.hardwareExecution!==false||e.noTeleportInputs!==true)
        throw Error('rc05e_unverified_simulated_episode');
      const terminal=e.frames.at(-1);
      row[key]={status:e.outcome.status,ticks:e.outcome.ticks,
        detourRequests:e.frames.filter(f=>f.requested==='observed_lateral_escape'||
          f.requested==='latched_recovery_move').length,
        latchedHolds:e.outcome.latchedHoldTicks||0,
        modeledCanceledCommands:e.outcome.modeledCanceledCommands||0,
        nativeContacts:e.outcome.contactTicks,sweptContacts:e.outcome.sweepTicks,
        collisionObstacleIds:e.outcome.status==='collision'?[...new Set([
          ...(terminal?.nativeContacts||[]).flatMap(c=>[c.aId,c.bId]).filter(id=>id!=='rover'),
          ...(terminal?.sweptContacts||[]).map(c=>c.id)])].sort():[],
        failureWindow:e.outcome.status==='collision'||e.outcome.status==='geofence'?
          e.frames.slice(-24).map(f=>({tick:f.tick,position:f.position,velocity:f.velocity,
            requested:f.requested,latched:f.latchDiagnostics||null,
            watched:f.motionWatchDiagnostics||null,obstaclesForDiagnosisOnly:f.obstacles,
            nativeContacts:f.nativeContacts,sweptContacts:f.sweptContacts})):[],
        sha256:e.sha256};
    }
    pairs.push(row);
  }
  const scores=Object.fromEntries(Object.keys(modes).map(k=>[k,score(pairs,k)]));
  const review=assessShieldEvidence({baseline:scores.baseline,shield:scores.latched},
    pairs.map(p=>({baseline:p.baseline,shield:p.latched})));
  // Require that the latch has actually been exercised; no passive placebo approval.
  if(review.reviewEligible&&scores.latched.latchedHolds===0){
    review.reviewEligible=false;review.reasons.push('persistent_latch_not_exercised');
  }
  const core={schema:LATCH_TRIAL_SCHEMA,evidence_state:'modeled',firstSeed,seeds,maxTicks,
    source:'native Evercraft World Engine, synthetic range returns; all courses share one generator',
    hardwareExecution:false,realSensorData:false,productionAuthorized:false,defaultController:'baseline',
    modeledQueueCancellationOnly:true,realEmergencyStop:false,
    limitations:['canceling pending software commands assumes the toy simulator can bypass delay; no physical command cancellation is modeled',
      'the rover continues to slow under rate-limited modeled braking; zero request is not zero velocity',
      'held-out seed ranges are from the SAME course family and not independent robot or safety evidence',
      'collision and geofence regressions always block research promotion regardless of arrival count'],
    scores,pairs,review};
  return {...core,sha256:sha(core)};
}
export function verifyLatchTrial(r){
  if(!r||r.schema!==LATCH_TRIAL_SCHEMA||typeof r.sha256!=='string')return false;
  const {sha256,...core}=r;
  return sha(core)===sha256&&r.hardwareExecution===false&&r.productionAuthorized===false&&
    r.modeledQueueCancellationOnly===true&&r.realEmergencyStop===false&&
    r.review?.productionAuthorized===false&&r.review?.hardwareAuthorized===false&&
    Array.isArray(r.pairs)&&r.pairs.length===r.seeds&&
    Object.keys(modes).every(k=>r.scores[k]?.total===r.seeds&&r.scores[k].total===
      r.scores[k].arrived+r.scores[k].collisions+r.scores[k].geofence+r.scores[k].timeouts);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const a=process.argv.slice(2),get=(flag,defaultValue)=>{
    const i=a.indexOf(flag);return i===-1?defaultValue:Number(a[i+1]);};
  const result=runLatchTrial({firstSeed:get('--first-seed',49),seeds:get('--seeds',8),maxTicks:get('--max-ticks',350)});
  const index=a.indexOf('--out');
  if(index>=0){const dest=path.resolve(a[index+1]);fs.mkdirSync(path.dirname(dest),{recursive:true});
    fs.writeFileSync(dest,JSON.stringify(result,null,2)+'\n');}
  console.log('RC05E REVIEW',JSON.stringify({firstSeed:result.firstSeed,seeds:result.seeds,
    scores:result.scores,review:result.review,
    perSeed:result.pairs.map(p=>({seed:p.seed,original:p.baseline.status,rc05c:p.escape.status,
      rc05d:p.motionWatch.status,rc05e:p.latched.status,modeledQueueCancelled:p.latched.modeledCanceledCommands,
      latchedHolds:p.latched.latchedHolds,collisions:p.latched.collisionObstacleIds})),sha256:result.sha256}));
}