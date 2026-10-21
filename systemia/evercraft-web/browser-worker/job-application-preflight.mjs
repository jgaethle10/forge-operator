import crypto from 'node:crypto';
import { assertPublicHttpUrl } from './policy.mjs';

const KEY = /^[A-Za-z0-9._:-]{3,160}$/;
const SHA = /^[a-f0-9]{64}$/i;
const MAX_ANSWERS = 80;
const MAX_URL = 4096;
const BLOCKED_KEYS = new Set(['password','cookie','cookies','session','storage_state','session_token','access_token','refresh_token','api_key','ssn','social_security_number','credit_card','cvv']);

function clean(value,max=400) {
  return typeof value === 'string' ? value.trim().slice(0,max) : '';
}
function forbiddenKeys(value,depth=0) {
  if (depth>8 || value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(x=>forbiddenKeys(x,depth+1));
  return Object.entries(value).some(([k,v])=>BLOCKED_KEYS.has(k.toLowerCase()) || forbiddenKeys(v,depth+1));
}
function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
/**
 * Preflight only. Never fills, uploads, signs, or submits anything.
 * External writes must use a SEPARATE, explicitly admitted and receipt-verified capability.
 */
export async function jobApplicationPreflight(raw, opts={}) {
  const b=raw && typeof raw==='object' && !Array.isArray(raw) ? raw : {};
  const reasons=[];
  const missionKey=clean(b.mission_key,160);
  const workKey=clean(b.work_key,160);
  const jobUrl=clean(b.job_url,MAX_URL);
  const employer=clean(b.employer,200);
  const role=clean(b.role,200);
  const profileKey=clean(b.profile_key,160);
  if (!KEY.test(missionKey)) reasons.push('mission_key_required');
  if (!KEY.test(workKey)) reasons.push('work_key_required');
  if (!employer || !role) reasons.push('employer_and_role_required');
  if (!KEY.test(profileKey)) reasons.push('named_browser_profile_required');
  let origin='';
  try {
    const u=new URL(jobUrl);
    if (u.protocol!=='https:' || u.username || u.password || u.port && u.port!=='443') throw Error('invalid_origin');
    origin=u.origin;
    // No DNS, private IP, or internal-network assumptions are trusted from the caller.
    const checker=opts.validateTarget || assertPublicHttpUrl;
    await checker(jobUrl);
  } catch {
    reasons.push('public_https_job_url_not_verified');
  }
  const doc=b.document && typeof b.document==='object' ? b.document : {};
  const resumeSha=clean(doc.resume_sha256,80);
  const resumeRef=clean(doc.artifact_ref,300);
  const reviewRef=clean(doc.review_receipt_ref,300);
  if (!SHA.test(resumeSha) || !resumeRef) reasons.push('exact_resume_artifact_required');
  if (!doc.reviewed || !reviewRef) reasons.push('resume_review_receipt_required');
  const answers=Array.isArray(b.answers) ? b.answers : [];
  if (answers.length>MAX_ANSWERS) reasons.push('too_many_application_answers');
  if (answers.some(a=>!a || typeof a!=='object' || !clean(a.field,120) || typeof a.value!=='string' || a.value.length>20000 || a.verified!==true)) reasons.push('unverified_or_malformed_application_answers');
  if (forbiddenKeys(b)) reasons.push('secret_or_restricted_personal_data_in_payload');
  const attestation=b.requires_personal_attestation===true;
  if (attestation) reasons.push('personal_attestation_requires_user');
  if (b.requires_captcha===true || b.requires_mfa===true) reasons.push('interactive_authentication_requires_user');
  const approval=b.approval && typeof b.approval==='object' ? b.approval : {};
  const approvalScope=clean(approval.scope,80);
  if (approvalScope && approvalScope!=='prepare_only') reasons.push('submission_authority_not_accepted_by_preflight');
  // Deliberately exclude answer contents, direct personal details, and credentials from the receipt.
  const fingerprint=digest({missionKey,workKey,jobUrl,employer,role,profileKey,resumeSha,answer_fields:answers.map(a=>clean(a?.field,120)).sort()});
  const uniqueReasons=[...new Set(reasons)];
  return {
    ok:uniqueReasons.length===0,
    schema:'evercraft.job_application.preflight.v1',
    mission_key:missionKey||null,
    work_key:workKey||null,
    job_origin:origin||null,
    employer:employer||null,
    role:role||null,
    resume_sha256:SHA.test(resumeSha)?resumeSha:null,
    answer_count:answers.length,
    packet_sha256:fingerprint,
    evidence_state:uniqueReasons.length ? 'preflight_held' : 'preparation_ready_not_submitted',
    reasons:uniqueReasons,
    submission_enabled:false,
    submission_state:'not_attempted',
    external_receipt:null,
    next_action:uniqueReasons.length ? 'Correct preflight holds and separately verify the authenticated browser profile and Systemia admission.' : 'Route to a separately admitted authenticated-write capability with explicit single-use approval and confirmed external readback; this endpoint never submits.',
  };
}