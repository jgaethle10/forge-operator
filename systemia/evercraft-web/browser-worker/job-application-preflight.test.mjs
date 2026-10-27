import test from 'node:test';
import assert from 'node:assert/strict';
import { jobApplicationPreflight } from './job-application-preflight.mjs';

const safeUrl=async url=>{if(!new URL(url).hostname.endsWith('.example')) throw Error('not fixture');return url;};
function packet() {
 return {
   mission_key:'career-command-resume-full-team-2026-09-20',
   work_key:'career-command-full-team-resume-review-v1',
   job_url:'https://jobs.example/apply/123',
   employer:'Example Employer',
   role:'AI Solutions Consultant',
   profile_key:'founder-jobs-example',
   document:{resume_sha256:'a'.repeat(64),artifact_ref:'career:resume:approved-rev',reviewed:true,review_receipt_ref:'shipping:verified-review'},
   answers:[{field:'work_authorization',value:'Authorized',verified:true}],
   approval:{scope:'prepare_only'}
 };
}
test('valid reviewed packet passes preparation but never claims submission',async()=>{
 const x=await jobApplicationPreflight(packet(),{validateTarget:safeUrl});
 assert.equal(x.ok,true);
 assert.equal(x.evidence_state,'preparation_ready_not_submitted');
 assert.equal(x.submission_enabled,false);
 assert.equal(x.submission_state,'not_attempted');
 assert.equal(x.external_receipt,null);
 assert.ok(!JSON.stringify(x).includes('Authorized'));
});
test('rejects incomplete review and resume artifact',async()=>{
 const p=packet();p.document={resume_sha256:'invalid',reviewed:false};
 const x=await jobApplicationPreflight(p,{validateTarget:safeUrl});
 assert.equal(x.ok,false);assert.ok(x.reasons.includes('exact_resume_artifact_required'));assert.ok(x.reasons.includes('resume_review_receipt_required'));
});
test('rejects personal legal attestation and approval escalation',async()=>{
 const p=packet();p.requires_personal_attestation=true;p.approval.scope='submit_job_application';
 const x=await jobApplicationPreflight(p,{validateTarget:safeUrl});
 assert.ok(x.reasons.includes('personal_attestation_requires_user'));
 assert.ok(x.reasons.includes('submission_authority_not_accepted_by_preflight'));
 assert.equal(x.submission_enabled,false);
});
test('rejects credentials, unverified answers, and MFA bypass assumptions',async()=>{
 const p=packet();p.answers[0].verified=false;p.password='do-not-persist';p.requires_mfa=true;
 const x=await jobApplicationPreflight(p,{validateTarget:safeUrl});
 assert.ok(x.reasons.includes('secret_or_restricted_personal_data_in_payload'));
 assert.ok(x.reasons.includes('unverified_or_malformed_application_answers'));
 assert.ok(x.reasons.includes('interactive_authentication_requires_user'));
 assert.ok(!JSON.stringify(x).includes('do-not-persist'));
});
test('rejects non-https targets and URL credentials before browser execution',async()=>{
 for(const url of ['http://jobs.example/apply','https://me:secret@jobs.example/apply','https://127.0.0.1/']) {
  const x=await jobApplicationPreflight({...packet(),job_url:url},{validateTarget:safeUrl});
  assert.ok(x.reasons.includes('public_https_job_url_not_verified'));
 }
});
test('does not accept missing mission/work lineage or unnamed profiles',async()=>{
 const p=packet();p.work_key='';p.mission_key='';p.profile_key='';
 const x=await jobApplicationPreflight(p,{validateTarget:safeUrl});
 assert.ok(x.reasons.includes('mission_key_required'));
 assert.ok(x.reasons.includes('work_key_required'));
 assert.ok(x.reasons.includes('named_browser_profile_required'));
});