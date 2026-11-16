/** RC05F cross-family integrity gate. Synthetic evidence ONLY: never deployment approval. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {FAMILY_NAMES} from './adversarial-families-rc05f.mjs';
import {verifyFamilyTrial} from './family-trial-rc05f.mjs';
export const FAMILY_GATE_SCHEMA='evercraft.sim-to-real.cross-family-gate.rc05f';
const sha=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
export function evaluateFamilyGate(reports){
  assert(Array.isArray(reports)&&reports.length===FAMILY_NAMES.length,'rc05f_gate_requires_both_families');
  const keyed=new Map();
  for(const r of reports){
    assert(verifyFamilyTrial(r),'rc05f_gate_invalid_input_report');
    assert(!keyed.has(r.scenarioFamily),'rc05f_gate_duplicate_family');
    keyed.set(r.scenarioFamily,r);
  }
  const familyReviews=[];
  for(const family of FAMILY_NAMES){
    const r=keyed.get(family);
    assert(r,'rc05f_gate_missing_family');
    const enoughSamples=r.seeds>=8;
    const noModeledCollisions=r.scores.latched.collisions===0&&r.scores.latched.geofence===0;
    const noRegression=r.scores.latched.collisions<=r.scores.baseline.collisions&&
      r.scores.latched.geofence<=r.scores.baseline.geofence;
    const progress=r.review.reviewEligible===true&&
      r.scores.latched.arrived-r.scores.baseline.arrived>=Math.ceil(r.seeds*.25)&&
      r.scores.latched.shieldedMoves>0;
    const researchCriteriaMet=enoughSamples&&noModeledCollisions&&noRegression&&progress;
    familyReviews.push({family,sourceDigest:r.sha256,cohortSize:r.seeds,
      baseArrivals:r.scores.baseline.arrived,candidateArrivals:r.scores.latched.arrived,
      candidateCollisions:r.scores.latched.collisions,candidateGeofence:r.scores.latched.geofence,
      candidateTimeouts:r.scores.latched.timeouts,latchedHoldTicks:r.scores.latched.latchedHolds,
      researchCriteriaMet,reasons:[
        ...(!enoughSamples?['insufficient_synthetic_trial_count']:[]),
        ...(!noModeledCollisions?['candidate_contact_or_bounds_failure']:[]),
        ...(!noRegression?['safety_regression_relative_to_original']:[]),
        ...(!progress?['insufficient_route_completion_improvement']:[])
      ]});
  }
  const overallResearchEligible=familyReviews.every(f=>f.researchCriteriaMet);
  const body={schema:FAMILY_GATE_SCHEMA,evidence_state:'modeled',
    defaultController:'baseline',noHardwareAuthority:true,
    productionAuthorized:false,hardwareAuthorized:false,realWorldSafe:false,
    overallResearchEligible,
    decision:overallResearchEligible?'FURTHER_SYNTHETIC_REVIEW_ONLY':'HOLD',
    families:familyReviews,
    limitations:['both families use simplified native sphere and synthetic sensor models',
      'research gate is never a hardware, deployment, certification, or safety gate']};
  return {...body,sha256:sha(body)};
}
export function verifyFamilyGate(r){
  if(!r||r.schema!==FAMILY_GATE_SCHEMA||typeof r.sha256!=='string'||
    r.hardwareAuthorized!==false||r.productionAuthorized!==false||
    r.noHardwareAuthority!==true||r.realWorldSafe!==false)return false;
  const {sha256,...body}=r;
  return sha(body)===sha256&&Array.isArray(r.families)&&
    r.families.length===FAMILY_NAMES.length&&r.families.every((x,i)=>x.family===FAMILY_NAMES[i])&&
    (r.decision==='HOLD'||r.decision==='FURTHER_SYNTHETIC_REVIEW_ONLY')&&
    r.overallResearchEligible===r.families.every(x=>x.researchCriteriaMet);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),arg=(flag)=>{const i=args.indexOf(flag);return i<0?null:args[i+1];};
  const c=arg('--crossing'),s=arg('--slalom');
  if(!c||!s)throw Error('rc05f_crossing_and_slalom_report_paths_required');
  const reports=[c,s].map(f=>JSON.parse(fs.readFileSync(f,'utf8')));
  const gate=evaluateFamilyGate(reports);
  const out=arg('--out');
  if(out){fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});
    fs.writeFileSync(out,JSON.stringify(gate,null,2)+'\n');}
  console.log('RC05F CROSS-FAMILY GATE',JSON.stringify(gate));
}
