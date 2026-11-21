/** RC05F synthetic cross-family A/B evidence, no hardware, deployment or safety authority. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runReactiveEpisode,verifyReactiveEpisode} from './native-reactive-rc05.mjs';
import {FAMILY_NAMES} from './adversarial-families-rc05f.mjs';
import {assessShieldEvidence} from './shield-trial-rc05b.mjs';

export const FAMILY_TRIAL_SCHEMA='evercraft.sim-to-real.family-benchmark.rc05f';
const sha=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const summarize=(runs,key)=>{
  const out={total:runs.length,arrived:0,collisions:0,geofence:0,timeouts:0,
    shieldedMoves:0,latchedHolds:0,modeledQueueCanceled:0};
  for(const r of runs){
    const x=r[key],field=x.status==='arrived'?'arrived':
      x.status==='collision'?'collisions':x.status==='geofence'?'geofence':'timeouts';
    out[field]++;
    out.shieldedMoves+=x.recoveryMoves||0;
    out.latchedHolds+=x.holdTicks||0;
    out.modeledQueueCanceled+=x.canceledCommands||0;
  }
  return out;
};
export function runFamilyTrial({family='crossing-lanes',firstSeed=101,seeds=8,maxTicks=350}={}){
  if(!FAMILY_NAMES.includes(family)||!Number.isSafeInteger(firstSeed)||firstSeed<1||
      !Number.isInteger(seeds)||seeds<1||seeds>16||
      !Number.isInteger(maxTicks)||maxTicks<1||maxTicks>650)
    throw Error('rc05f_trial_options_invalid');
  const pairs=[];
  for(let seed=firstSeed;seed<firstSeed+seeds;seed++){
    const pair={seed};
    for(const [key,controllerMode] of [['baseline','baseline'],['latched','observed-motion-latched']]){
      const r=runReactiveEpisode({seed,controllerMode,scenarioFamily:family,maxTicks});
      if(!verifyReactiveEpisode(r)||r.hardwareExecution!==false||r.noTeleportInputs!==true||
          r.scenarioFamily!==family)throw Error('rc05f_episode_evidence_invalid');
      const last=r.frames.at(-1);
      pair[key]={
        status:r.outcome.status,ticks:r.outcome.ticks,
        recoveryMoves:r.frames.filter(f=>f.requested==='latched_recovery_move'||
          f.requested==='observed_lateral_escape').length,
        holdTicks:r.outcome.latchedHoldTicks||0,canceledCommands:r.outcome.modeledCanceledCommands||0,
        nativeContacts:r.outcome.contactTicks,sweptContacts:r.outcome.sweepTicks,
        terminalPosition:last?.position,
        collisionObstacleIds:r.outcome.status==='collision'?[...new Set([
          ...(last?.nativeContacts||[]).flatMap(c=>[c.aId,c.bId]).filter(id=>id!=='rover'),
          ...(last?.sweptContacts||[]).map(c=>c.id)])].sort():[],
        // Stored for diagnostic review only; world-truth coordinates never reach controller.
        failureWindow:r.outcome.status==='arrived'?[]:r.frames.slice(-15).map(f=>({
          tick:f.tick,position:f.position,velocity:f.velocity,requested:f.requested,
          sensorFresh:f.sensorFresh,latched:f.latchDiagnostics??null,
          obstaclePositionsForDiagnosisOnly:f.obstacles,
          nativeContacts:f.nativeContacts,sweptContacts:f.sweptContacts
        })),
        sha256:r.sha256
      };
    }
    pairs.push(pair);
  }
  const scores={baseline:summarize(pairs,'baseline'),latched:summarize(pairs,'latched')};
  const review=assessShieldEvidence({baseline:scores.baseline,shield:scores.latched},
    pairs.map(p=>({baseline:p.baseline,shield:p.latched})));
  if(review.reviewEligible&&scores.latched.latchedHolds===0){
    review.reviewEligible=false;review.reasons.push('latch_not_exercised_on_family');
  }
  const core={schema:FAMILY_TRIAL_SCHEMA,evidence_state:'modeled',scenarioFamily:family,
    firstSeed,seeds,maxTicks,hardwareExecution:false,realSensorData:false,
    productionAuthorized:false,realEmergencyStop:false,defaultController:'baseline',
    source:'novel synthetic geometry generator and crossing velocity schedules, not real observations',
    limitations:['new layouts differ geometrically, but use the same simplified native sphere engine and sensing model',
      'no physical robot, hardware commands, independently calibrated braking or certified stopping',
      'even collision-free trials are inadequate to establish real-world safety'],
    scores,pairs,review};
  return {...core,sha256:sha(core)};
}
export function verifyFamilyTrial(report){
  if(!report||report.schema!==FAMILY_TRIAL_SCHEMA||typeof report.sha256!=='string'|| 
      report.hardwareExecution!==false||report.realSensorData!==false||
      report.productionAuthorized!==false||report.realEmergencyStop!==false||
      report.review?.productionAuthorized!==false||report.review?.hardwareAuthorized!==false||
      !FAMILY_NAMES.includes(report.scenarioFamily)||!Array.isArray(report.pairs)||
      report.pairs.length!==report.seeds)return false;
  const {sha256,...body}=report;
  if(sha(body)!==sha256)return false;
  return ['baseline','latched'].every(k=>report.scores[k]?.total===report.seeds&&
    report.scores[k].total===report.scores[k].arrived+report.scores[k].collisions+
      report.scores[k].geofence+report.scores[k].timeouts);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  const get=(flag,defaultValue)=>{const i=args.indexOf(flag);return i<0?defaultValue:args[i+1];};
  const result=runFamilyTrial({family:get('--family','crossing-lanes'),
    firstSeed:Number(get('--first-seed','101')),seeds:Number(get('--seeds','8')),
    maxTicks:Number(get('--max-ticks','350'))});
  const ix=args.indexOf('--out');
  if(ix>=0){const dest=path.resolve(args[ix+1]);fs.mkdirSync(path.dirname(dest),{recursive:true});
    fs.writeFileSync(dest,JSON.stringify(result,null,2)+'\n');}
  console.log('RC05F FAMILY RESULT',JSON.stringify({family:result.scenarioFamily,
    firstSeed:result.firstSeed,seeds:result.seeds,scores:result.scores,review:result.review,
    failures:result.pairs.filter(p=>p.latched.status!=='arrived').map(p=>({
      seed:p.seed,status:p.latched.status,collisionObstacleIds:p.latched.collisionObstacleIds,
      last:p.latched.terminalPosition,holds:p.latched.holdTicks})),
    verified:verifyFamilyTrial(result),sha256:result.sha256}));
}