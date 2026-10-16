// CI-only signed HTTP canary for Career Command preparation.
// All personal data is synthetic. Never performs or claims an external submission.
import assert from 'node:assert/strict';
import { signDurableJobRequest } from './systemia-admission.mjs';

const base = String(process.env.EVERCRAFT_BROWSER_PROOF_URL || 'http://127.0.0.1:18787');
const secret = String(process.env.EVERCRAFT_BROWSER_PROOF_SIGNING_KEY || '');
if (secret.length < 32) throw new Error('preflight_ci_signing_key_required');
const pathname = '/v1/job-applications/preflight';

const sample = {
  mission_key:'career-command-resume-full-team-2026-09-20',
  work_key:'career-command-application-synthetic-canary-001',
  job_url:'https://example.com/',
  employer:'Synthetic QA Employer',
  role:'AI Operations',
  profile_key:'synthetic-qa-browser-profile',
  document:{
    resume_sha256:'a'.repeat(64),
    artifact_ref:'synthetic:resume:qa-only',
    reviewed:true,
    review_receipt_ref:'synthetic:review:qa-only'
  },
  answers:[{field:'sample_non_sensitive',value:'synthetic-answer',verified:true}],
  approval:{scope:'prepare_only'}
};
async function request(body,{unsigned=false,headersOverride={}}={}){
  const raw=JSON.stringify(body);
  const headers=unsigned?{}:signDurableJobRequest(secret,{method:'POST',path:pathname,body:raw});
  const response=await fetch(base+pathname,{method:'POST',headers:{'content-type':'application/json',...headers,...headersOverride},body:raw});
  return {status:response.status,result:await response.json(),headers};
}
const unsigned=await request(sample,{unsigned:true});
assert.equal(unsigned.status,401);
assert.equal(unsigned.result.ok,false);

const prepared=await request(sample);
assert.equal(prepared.status,200,JSON.stringify(prepared.result));
assert.equal(prepared.result.schema,'evercraft.job_application.preflight.v1');
assert.equal(prepared.result.evidence_state,'preparation_ready_not_submitted');
assert.equal(prepared.result.submission_state,'not_attempted');
assert.equal(prepared.result.submission_enabled,false);
assert.equal(prepared.result.external_receipt,null);
assert.doesNotMatch(JSON.stringify(prepared.result),/synthetic-answer/);

const replayRaw=JSON.stringify(sample);
const replay=await fetch(base+pathname,{
  method:'POST',
  headers:{'content-type':'application/json',...prepared.headers},
  body:replayRaw
});
assert.equal(replay.status,401);
assert.equal((await replay.json()).error,'durable_job_request_replayed');

const rejected=await request({
  ...sample,
  approval:{scope:'submit_job_application'},
  requires_personal_attestation:true
});
assert.equal(rejected.status,409);
assert.equal(rejected.result.submission_enabled,false);
assert.ok(rejected.result.reasons.includes('personal_attestation_requires_user'));
assert.ok(rejected.result.reasons.includes('submission_authority_not_accepted_by_preflight'));

const privacy=await request({...sample,password:'SYNTHETIC_SECRET_DO_NOT_ECHO'});
assert.equal(privacy.status,409);
assert.ok(privacy.result.reasons.includes('secret_or_restricted_personal_data_in_payload'));
assert.doesNotMatch(JSON.stringify(privacy.result),/SYNTHETIC_SECRET_DO_NOT_ECHO/);

console.log(JSON.stringify({
 schema:'evercraft.job_application.preflight.http-canary.v1',
 execution_class:'github_actions_docker_only',
 signed_admission:'verified',
 replay_protection:'verified',
 reviewed_packet_validation:'synthetic_pass',
 personal_attestation_hold:'verified',
 secrets_hold:'verified',
 submitted_applications:0,
 external_submission_authority:false,
 production_profile_health:'not_verified',
 production_deployment:'not_verified'
}));
