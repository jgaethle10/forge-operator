/** RC05B: exact native World Engine A/B/C modeled evidence. No actuation. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runReactiveEpisode,verifyReactiveEpisode} from './native-reactive-rc05.mjs';
export const RC05B_SCHEMA='evercraft.sim-to-real.shielded-review.rc05b';
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const summary=items=>({total:items.length,arrived:items.filter(x=>x.status==='arrived').length,
  collisions:items.filter(x=>x.status==='collision').length,geofence:items.filter(x=>x.status==='geofence').length,
  timeouts:items.filter(x=>x.status==='timeout').length,
  shieldedMoves:items.reduce((s,x)=>s+(x.shieldedMoves||0),0),
  shieldHolds:items.reduce((s,x)=>s+(x.shieldHolds||0),0)});

export function runShieldTrial({firstSeed=49,seeds=8,maxTicks=350}={}){
  if(!Number.isSafeInteger(firstSeed)||firstSeed<1||!Number.isInteger(seeds)||seeds<1||seeds>16||
    !Number.isInteger(maxTicks)||maxTicks<1||maxTicks>650)throw Error('rc05b_trial_invalid_options');
  const pairs=[];
  for(let seed=firstSeed;seed<firstSeed+seeds;seed++){
    const states={};
    for(const [key,controllerMode] of [['baseline','baseline'],['progress','progress-gated'],['shield','progress-shielded']]){
      const episode=runReactiveEpisode({seed,maxTicks,controllerMode});
      if(!verifyReactiveEpisode(episode)||episode.hardwareExecution!==false||episode.noTeleportInputs!==true){
        throw Error('rc05b_integrity_or_hardware_boundary_failed');
      }
      const frame=episode.frames.at(-1);
      states[key]={status:episode.outcome.status,ticks:episode.outcome.ticks,
        nativeContacts:episode.outcome.contactTicks,sweptContacts:episode.outcome.sweepTicks,
        shieldedMoves:episode.frames.filter(f=>f.requested==='shielded_progress').length,
        shieldHolds:episode.frames.filter(f=>f.requested?.startsWith('shield_')&&f.requested?.endsWith('_hold')).length,
        finalPosition:frame?.position,collisionObstacleIds:
          episode.outcome.status==='collision'?[...new Set([
            ...(frame?.nativeContacts??[]).flatMap(c=>[c.aId,c.bId]).filter(id=>id!=='rover'),
            ...(frame?.sweptContacts??[]).map(c=>c.id)])].sort():[],
        sha256:episode.sha256};
    }
    pairs.push({seed,...states});
  }
  const scores=Object.fromEntries(['baseline','progress','shield'].map(key=>[key,summary(pairs.map(p=>p[key]))]));
  // Review filter only. Never grants production, actuator or autonomous safety authority.
  const anyNewCollision=pairs.some(p=>p.shield.status==='collision'&&p.baseline.status!=='collision');
  const anyNewGeofence=pairs.some(p=>p.shield.status==='geofence'&&p.baseline.status!=='geofence');
  const nonRegression=scores.shield.arrived>=scores.baseline.arrived;
  const reviewEligible=!anyNewCollision&&!anyNewGeofence&&nonRegression;
  const reasons=[
    ...(anyNewCollision?['new_collision_relative_to_default']:[]),
    ...(anyNewGeofence?['new_geofence_relative_to_default']:[]),
    ...(!nonRegression?['lower_arrival_count_than_default']:[]),
    ...(!reviewEligible?[]:['simulation_review_only_more_validation_required'])];
  const core={schema:RC05B_SCHEMA,evidence_state:'modeled',
    noHardwareAuthority:true,productionAuthorized:false,defaultController:'baseline',
    firstSeed,seeds,maxTicks,source:'native EvercraftWorldRuntime synthetic sensor course',
    comparison:'same modeled course seeds; distinct controller policies; prior cohorts not independent held-out tests',
    scores,pairs,review:{reviewEligible,productionAuthorized:false,hardwareAuthorized:false,reasons}};
  return {...core,sha256:digest(core)};
}
export function verifyShieldTrial(result){
  if(!result||result.schema!==RC05B_SCHEMA||typeof result.sha256!=='string')return false;
  const {sha256,...rest}=result;
  if(digest(rest)!==sha256||result.productionAuthorized!==false||result.noHardwareAuthority!==true||
    result.review?.productionAuthorized!==false||result.review?.hardwareAuthorized!==false)return false;
  if(!Array.isArray(result.pairs)||result.pairs.length!==result.seeds)return false;
  return ['baseline','progress','shield'].every(k=>{
    const s=result.scores[k];return s?.total===result.seeds&&s.total===s.arrived+s.collisions+s.geofence+s.timeouts;
  });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  const get=(name,def)=>{const idx=args.indexOf(name);return idx<0?def:Number(args[idx+1]);};
  const report=runShieldTrial({firstSeed:get('--first-seed',49),seeds:get('--seeds',8),maxTicks:get('--max-ticks',350)});
  const i=args.indexOf('--out');
  if(i>=0){const outfile=path.resolve(args[i+1]);fs.mkdirSync(path.dirname(outfile),{recursive:true});fs.writeFileSync(outfile,JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify({firstSeed:report.firstSeed,seeds:report.seeds,scores:report.scores,
    review:report.review,perSeed:report.pairs.map(p=>({seed:p.seed,baseline:p.baseline.status,
      progress:p.progress.status,shield:p.shield.status,shieldHolds:p.shield.shieldHolds,
      shieldedMoves:p.shield.shieldedMoves,collisionObstacleIds:p.shield.collisionObstacleIds})),
    verified:verifyShieldTrial(report),sha256:report.sha256},null,2));
}