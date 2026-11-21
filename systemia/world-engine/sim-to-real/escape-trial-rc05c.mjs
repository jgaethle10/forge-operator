/** RC05C modeled-only four-way review: default, progress, old shield, lateral escape.
 * Results are simulator diagnostics, never real-world safety or release proof.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runReactiveEpisode,verifyReactiveEpisode} from './native-reactive-rc05.mjs';
import {assessShieldEvidence} from './shield-trial-rc05b.mjs';
export const ESCAPE_TRIAL_SCHEMA='evercraft.sim-to-real.lateral-escape-review.rc05c';
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const modes={baseline:'baseline',progress:'progress-gated',shield:'progress-shielded',escape:'observed-lateral-escape'};
function count(items,key){
  const s={total:items.length,arrived:0,collisions:0,geofence:0,timeouts:0,shieldedMoves:0,shieldHolds:0};
  for(const p of items){
    const x=p[key];s[x.status==='arrived'?'arrived':x.status==='collision'?'collisions':
      x.status==='geofence'?'geofence':'timeouts']++;
    s.shieldedMoves+=x.escapeMoves||0;
    s.shieldHolds+=x.escapeHolds||0;
  }
  return s;
}
export function runEscapeTrial({firstSeed=65,seeds=8,maxTicks=350}={}){
  if(!Number.isSafeInteger(firstSeed)||firstSeed<1||!Number.isInteger(seeds)||seeds<1||seeds>16||
    !Number.isInteger(maxTicks)||maxTicks<1||maxTicks>650)throw Error('rc05c_invalid_trial_options');
  const pairs=[];
  for(let seed=firstSeed;seed<firstSeed+seeds;seed++){
    const item={seed};
    for(const [key,mode] of Object.entries(modes)){
      const episode=runReactiveEpisode({seed,maxTicks,controllerMode:mode});
      if(!verifyReactiveEpisode(episode)||episode.hardwareExecution!==false||
        episode.noTeleportInputs!==true)throw Error('rc05c_episode_integrity_failed');
      const last=episode.frames.at(-1);
      item[key]={
        status:episode.outcome.status,ticks:episode.outcome.ticks,
        nativeContactTicks:episode.outcome.contactTicks,sweepContactTicks:episode.outcome.sweepTicks,
        escapeMoves:episode.frames.filter(f=>f.requested==='observed_lateral_escape').length,
        escapeHolds:episode.frames.filter(f=>f.requested==='escape_no_observed_clearance_hold').length,
        finalPosition:last?.position,
        collisionObstacleIds:episode.outcome.status==='collision'?[...new Set([
          ...(last?.nativeContacts||[]).flatMap(c=>[c.aId,c.bId]).filter(id=>id!=='rover'),
          ...(last?.sweptContacts||[]).map(c=>c.id)])].sort():[],
        failureWindow:episode.outcome.status==='collision'||episode.outcome.status==='geofence'
          ?episode.frames.slice(-20).map(f=>({tick:f.tick,position:f.position,velocity:f.velocity,
            requested:f.requested,sensorFresh:f.sensorFresh,uncertainty:f.uncertainty,
            nativeContacts:f.nativeContacts,sweptContacts:f.sweptContacts,
            obstaclePositionsForDiagnosisOnly:f.obstacles})) :[],
        sha256:episode.sha256
      };
    }
    pairs.push(item);
  }
  const scores=Object.fromEntries(Object.keys(modes).map(key=>[key,count(pairs,key)]));
  const review=assessShieldEvidence({baseline:scores.baseline,shield:scores.escape},
    pairs.map(p=>({baseline:p.baseline,shield:p.escape})));
  const core={schema:ESCAPE_TRIAL_SCHEMA,evidence_state:'modeled',hardwareExecution:false,
    realSensorData:false,noProductionAuthority:true,firstSeed,seeds,maxTicks,
    cohorts:'same synthetic course generator; later seeds are not independent physical environments',
    defaultController:'baseline',scores,pairs,review};
  return {...core,sha256:hash(core)};
}
export function verifyEscapeTrial(r){
  if(!r||r.schema!==ESCAPE_TRIAL_SCHEMA||typeof r.sha256!=='string')return false;
  const {sha256,...core}=r;
  return r.hardwareExecution===false&&r.noProductionAuthority===true&&
    r.review?.productionAuthorized===false&&r.review?.hardwareAuthorized===false&&
    hash(core)===sha256&&Array.isArray(r.pairs)&&r.pairs.length===r.seeds&&
    Object.keys(modes).every(k=>r.scores[k]?.total===r.seeds&&
      r.scores[k].total===r.scores[k].arrived+r.scores[k].collisions+
        r.scores[k].geofence+r.scores[k].timeouts);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  const get=(name,def)=>{const i=args.indexOf(name);return i===-1?def:Number(args[i+1]);};
  const r=runEscapeTrial({firstSeed:get('--first-seed',65),seeds:get('--seeds',8),
    maxTicks:get('--max-ticks',350)});
  const at=args.indexOf('--out');
  if(at>=0){const dest=path.resolve(args[at+1]);fs.mkdirSync(path.dirname(dest),{recursive:true});
    fs.writeFileSync(dest,JSON.stringify(r,null,2)+'\n');}
  console.log('RC05C RESULT',JSON.stringify({firstSeed:r.firstSeed,seeds:r.seeds,scores:r.scores,
    review:r.review,digest:r.sha256,
    perSeed:r.pairs.map(p=>({seed:p.seed,baseline:p.baseline.status,progress:p.progress.status,
      shield:p.shield.status,escape:p.escape.status,moves:p.escape.escapeMoves,
      collisionObstacleIds:p.escape.collisionObstacleIds}))}));
}
