/**
 * RC05A evidence-only promotion gate. Never authorizes production or hardware.
 * A passing experiment is not sufficient to promote a policy with collision regressions.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyProgressTrial} from './progress-trial-rc05.mjs';
export const GATE_SCHEMA='evercraft.sim-to-real.policy-review-gate.rc05a';
const digest=obj=>crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
export function assessProgressGate({development,evaluation}){
  if(!verifyProgressTrial(development)||!verifyProgressTrial(evaluation))throw Error('rc05a_gate_invalid_trial_receipt');
  const a=development.firstSeed,b=evaluation.firstSeed;
  if(a+development.seeds>b)throw Error('rc05a_gate_cohorts_overlap_or_unsorted');
  const totals={development:development.seeds,evaluation:evaluation.seeds};
  const observedRegression=development.progressGated.collisions>development.baseline.collisions||
    evaluation.progressGated.collisions>evaluation.baseline.collisions||
    development.progressGated.geofence>development.baseline.geofence||
    evaluation.progressGated.geofence>evaluation.baseline.geofence;
  const nonregression=development.progressGated.arrived>=development.baseline.arrived&&
    evaluation.progressGated.arrived>=evaluation.baseline.arrived;
  const sufficientForReview=development.seeds>=8&&evaluation.seeds>=8;
  const candidateEligible=!observedRegression&&nonregression&&sufficientForReview;
  const reasons=[];
  if(observedRegression)reasons.push('collision_or_geofence_regression_observed');
  if(!nonregression)reasons.push('arrival_nonregression_not_met');
  if(!sufficientForReview)reasons.push('too_few_modeled_scenarios_for_internal_review');
  if(!reasons.length)reasons.push('model_only_candidate_for_independent_review_not_release');
  const core={schema:GATE_SCHEMA,evidence_state:'modeled',candidateEligible,
    promotion:'human_review_only',releaseAuthorized:false,hardwareAuthority:false,
    safetyCertified:false,developmentDigest:development.sha256,evaluationDigest:evaluation.sha256,
    totals,development:{baseline:development.baseline,progress:development.progressGated},
    evaluation:{baseline:evaluation.baseline,progress:evaluation.progressGated},
    reasons,limitations:['only two small synthetic cohorts','no real drivetrain or sensor calibration',
      'candidate eligibility is not production authorization','fail closed when collision risk increases']};
  return {...core,sha256:digest(core)};
}
export function verifyProgressGate(result){
  if(!result||result.schema!==GATE_SCHEMA||result.releaseAuthorized!==false||
      result.hardwareAuthority!==false||typeof result.sha256!=='string')return false;
  const {sha256,...core}=result;
  return digest(core)===sha256;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),at=name=>{const i=args.indexOf(name);if(i<0||!args[i+1])throw Error('rc05a_gate_missing_'+name);return args[i+1];};
  const result=assessProgressGate({development:JSON.parse(fs.readFileSync(at('--development'),'utf8')),
    evaluation:JSON.parse(fs.readFileSync(at('--evaluation'),'utf8'))});
  if(!verifyProgressGate(result))throw Error('rc05a_gate_receipt_invalid');
  const outIndex=args.indexOf('--out');
  if(outIndex>=0){const target=path.resolve(args[outIndex+1]);fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n');}
  console.log(JSON.stringify({schema:result.schema,candidateEligible:result.candidateEligible,
    releaseAuthorized:result.releaseAuthorized,hardwareAuthority:result.hardwareAuthority,
    reasons:result.reasons,sha256:result.sha256},null,2));
}
