/** RC05A paired comparison on native World Engine; modeled evidence only.
 * Does not deploy or control hardware. Re-uses fixed course seeds, records failure modes.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runReactiveEpisode,verifyReactiveEpisode} from './native-reactive-rc05.mjs';
export const PROGRESS_TRIAL_SCHEMA='evercraft.sim-to-real.progress-gated-trial.rc05a';
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const count=runs=>({total:runs.length,arrived:runs.filter(r=>r.status==='arrived').length,
  collisions:runs.filter(r=>r.status==='collision').length,
  geofence:runs.filter(r=>r.status==='geofence').length,
  timeouts:runs.filter(r=>r.status==='timeout').length});
export function runProgressTrial({firstSeed=41,seeds=8,maxTicks=350}={}){
  if(!Number.isSafeInteger(firstSeed)||firstSeed<1||!Number.isInteger(seeds)||seeds<1||seeds>16||
      !Number.isInteger(maxTicks)||maxTicks<1||maxTicks>650)throw Error('rc05a_invalid_trial_options');
  const pairs=[];
  for(let seed=firstSeed;seed<firstSeed+seeds;seed++){
    const baseline=runReactiveEpisode({seed,maxTicks,controllerMode:'baseline'});
    const progress=runReactiveEpisode({seed,maxTicks,controllerMode:'progress-gated'});
    if(!verifyReactiveEpisode(baseline)||!verifyReactiveEpisode(progress))throw Error('rc05a_episode_integrity_failed');
    pairs.push({seed,baseline:{status:baseline.outcome.status,ticks:baseline.outcome.ticks,
        nativeContactTicks:baseline.outcome.contactTicks,sweepTicks:baseline.outcome.sweepTicks,
        digest:baseline.sha256},
      progress:{status:progress.outcome.status,ticks:progress.outcome.ticks,
        nativeContactTicks:progress.outcome.contactTicks,sweepTicks:progress.outcome.sweepTicks,
        detourRequests:progress.frames.filter(f=>f.requested==='progress_detour').length,
        zeroVelocityHeadings:progress.frames.filter(f=>f.requested==='reactive_heading'&&f.requestedSpeed<.01).length,
        digest:progress.sha256}});
  }
  const before=count(pairs.map(p=>p.baseline)),after=count(pairs.map(p=>p.progress));
  const core={schema:PROGRESS_TRIAL_SCHEMA,evidence_state:'modeled',hardwareExecution:false,
    firstSeed,seeds,maxTicks,scope:'internal A/B diagnostic, not physical safety or generalized autonomy',
    baseline:before,progressGated:after,pairs};
  return {...core,sha256:hash(core)};
}
export function verifyProgressTrial(r){
  if(!r||r.schema!==PROGRESS_TRIAL_SCHEMA||typeof r.sha256!=='string'||r.hardwareExecution!==false)return false;
  const {sha256,...core}=r;
  return hash(core)===sha256 && Array.isArray(r.pairs)&&r.pairs.length===r.seeds&&
    r.baseline.total===r.seeds&&r.progressGated.total===r.seeds&&
    [r.baseline,r.progressGated].every(s=>s.total===s.arrived+s.collisions+s.geofence+s.timeouts);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),get=(name,def)=>{const i=args.indexOf(name);return i===-1?def:Number(args[i+1]);};
  const result=runProgressTrial({firstSeed:get('--first-seed',41),seeds:get('--seeds',8),maxTicks:get('--max-ticks',350)});
  const i=args.indexOf('--out');
  if(i>=0){const dest=path.resolve(args[i+1]);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(result,null,2)+'\n');}
  console.log(JSON.stringify({schema:result.schema,seeds:result.seeds,firstSeed:result.firstSeed,
    baseline:result.baseline,progressGated:result.progressGated,
    perSeed:result.pairs.map(x=>({seed:x.seed,baseline:x.baseline.status,progress:x.progress.status,detours:x.progress.detourRequests})),
    verified:verifyProgressTrial(result),sha256:result.sha256},null,2));
}
