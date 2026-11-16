/** RC05G native A/B/C: original baseline, RC05E latch, and opt-in inward goal recovery.
 * All source geometry and sensor observations remain synthetic and model-only.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runReactiveEpisode,verifyReactiveEpisode} from './native-reactive-rc05.mjs';
import {FAMILY_NAMES} from './adversarial-families-rc05f.mjs';

export const RC05G_TRIAL_SCHEMA='evercraft.sim-to-real.goal-recovery-trial.rc05g';
const sha=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const modes={baseline:'baseline',latched:'observed-motion-latched',
  recovery:'observed-goal-recovery'};
const score=(runs,key)=>{
  const score={total:runs.length,arrived:0,collisions:0,geofence:0,timeouts:0,
    modeledInwardTicks:0,latchedHoldTicks:0,modeledQueueCanceled:0};
  for(const row of runs){
    const r=row[key],status=r.status==='arrived'?'arrived':
      r.status==='collision'?'collisions':r.status==='geofence'?'geofence':'timeouts';
    score[status]++;
    score.modeledInwardTicks+=r.inwardRecoveryTicks;
    score.latchedHoldTicks+=r.latchedHolds;
    score.modeledQueueCanceled+=r.queueCanceled;
  }
  return score;
};
export function runRecoveryTrial({scenarioFamily='legacy',firstSeed=49,seeds=8,maxTicks=350}={}){
  if(!['legacy',...FAMILY_NAMES].includes(scenarioFamily)||
    !Number.isSafeInteger(firstSeed)||firstSeed<1||
    !Number.isInteger(seeds)||seeds<1||seeds>16||
    !Number.isInteger(maxTicks)||maxTicks<1||maxTicks>650)
    throw Error('rc05g_invalid_trial_options');
  const pairs=[];
  for(let seed=firstSeed;seed<firstSeed+seeds;seed++){
    const row={seed};
    for(const [label,controllerMode] of Object.entries(modes)){
      const episode=runReactiveEpisode({seed,scenarioFamily,controllerMode,maxTicks});
      if(!verifyReactiveEpisode(episode)||episode.noTeleportInputs!==true||
        episode.hardwareExecution!==false)
        throw Error('rc05g_invalid_native_evidence');
      const terminal=episode.frames.at(-1);
      const status=episode.outcome.status;
      row[label]={status,ticks:episode.outcome.ticks,
        inwardRecoveryTicks:episode.frames.filter(f=>f.requested==='goal_inward_recovery').length,
        latchedHolds:episode.outcome.latchedHoldTicks||0,
        queueCanceled:episode.outcome.modeledCanceledCommands||0,
        finalPosition:terminal?.position,
        collisionObstacleIds:status==='collision'?[...new Set([
          ...(terminal.nativeContacts||[]).flatMap(c=>[c.aId,c.bId]).filter(id=>id!=='rover'),
          ...(terminal.sweptContacts||[]).map(c=>c.id)])].sort():[],
        // Last frames are diagnostics only; never given to controllers.
        failureWindow:status==='arrived'?[]:episode.frames.slice(-15).map(f=>({
          tick:f.tick,position:f.position,velocity:f.velocity,
          requested:f.requested,scanAge:f.sensorAge,
          goalRecovery:f.latchDiagnostics?.goalRecovery??null,
          nativeContacts:f.nativeContacts,sweptContacts:f.sweptContacts,
          obstacleTruthForDiagnosisOnly:f.obstacles
        })),
        sha256:episode.sha256};
    }
    pairs.push(row);
  }
  const scores=Object.fromEntries(Object.keys(modes).map(k=>[k,score(pairs,k)]));
  const newCollision=pairs.filter(p=>p.recovery.status==='collision'&&p.latched.status!=='collision').map(p=>p.seed);
  const newGeofence=pairs.filter(p=>p.recovery.status==='geofence'&&p.latched.status!=='geofence').map(p=>p.seed);
  const lostArrivals=pairs.filter(p=>p.latched.status==='arrived'&&p.recovery.status!=='arrived').map(p=>p.seed);
  const improvedArrivals=pairs.filter(p=>p.latched.status!=='arrived'&&p.recovery.status==='arrived').map(p=>p.seed);
  const researchReviewEligible=newCollision.length===0&&newGeofence.length===0&&
    lostArrivals.length===0&&improvedArrivals.length>=1;
  const review={researchReviewEligible,improvedArrivals,lostArrivals,newCollision,newGeofence,
    reasons:[...(newCollision.length?['new_collision_against_rc05e']:[]),
      ...(newGeofence.length?['new_geofence_against_rc05e']:[]),
      ...(lostArrivals.length?['lost_arrival_against_rc05e']:[]),
      ...(!improvedArrivals.length?['no_new_arrival_improvement']:[]),
      ...(researchReviewEligible?['further_simulated_review_only']:[])],
    productionAuthorized:false,hardwareAuthorized:false};
  const core={schema:RC05G_TRIAL_SCHEMA,evidence_state:'modeled',
    scenarioFamily,firstSeed,seeds,maxTicks,defaultController:'baseline',
    hardwareExecution:false,realSensorData:false,productionAuthorized:false,
    calibratedRobotPhysics:false,realEmergencyStop:false,
    modes,scores,pairs,review,
    limitations:['synthetic planar sphere body and anonymous noisy range observations',
      'near-goal inward exception uses noisy modeled global position, not verified physical localization',
      'software queue cancellation is simulator-only and cannot physically override momentum',
      'a collision-free cohort is not evidence of real-world safety certification']};
  return {...core,sha256:sha(core)};
}
export function verifyRecoveryTrial(r){
  if(!r||r.schema!==RC05G_TRIAL_SCHEMA||typeof r.sha256!=='string'||r.hardwareExecution!==false||
    r.productionAuthorized!==false||r.realEmergencyStop!==false||
    r.review?.productionAuthorized!==false||r.review?.hardwareAuthorized!==false||
    !['legacy',...FAMILY_NAMES].includes(r.scenarioFamily)||
    !Array.isArray(r.pairs)||r.pairs.length!==r.seeds)return false;
  const {sha256,...body}=r;
  if(sha(body)!==sha256)return false;
  return Object.keys(modes).every(k=>r.scores[k]?.total===r.seeds&&
    r.scores[k].total===r.scores[k].arrived+r.scores[k].collisions+
      r.scores[k].geofence+r.scores[k].timeouts);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),opt=(flag,def)=>{const ix=args.indexOf(flag);return ix<0?def:args[ix+1];};
  const result=runRecoveryTrial({scenarioFamily:opt('--family','legacy'),
    firstSeed:Number(opt('--first-seed','49')),seeds:Number(opt('--seeds','8')),
    maxTicks:Number(opt('--max-ticks','350'))});
  const out=opt('--out',null);
  if(out){fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});
    fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');}
  console.log('RC05G TRIAL',JSON.stringify({family:result.scenarioFamily,
    seeds:[result.firstSeed,result.firstSeed+result.seeds-1],scores:result.scores,
    review:result.review,perSeed:result.pairs.map(p=>({
      seed:p.seed,latched:p.latched.status,recovery:p.recovery.status,
      recoveries:p.recovery.inwardRecoveryTicks,last:p.recovery.finalPosition})),
    sha256:result.sha256,verified:verifyRecoveryTrial(result)}));
}