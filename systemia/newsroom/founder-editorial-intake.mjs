// Systemia -> Harbor founder creator editorial REVIEW pickup over the existing
// Passport-protected Intake Fabric. No second queue, transport, publisher or
// private founder-copy duplication. Intended for the authorized owner machine.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {EvercraftIntakeFabric} from '../intake-fabric/intake.mjs';
import {EvercraftPassport} from '../passport/passport.mjs';
import {prepareSystemiaFounderCreatorReview} from './systemia-harbor-upstream.mjs';

export const FOUNDER_INTAKE_SCHEMA='evercraft.systemia.harbor.founder-editorial-intake.v1';
export const FOUNDER_PICKUP_SCHEMA='evercraft.systemia.harbor.founder-editorial-pickup.v1';
const HEX=/^sha256:[a-f0-9]{64}$/i;
const ACTOR=/^adapter:[a-z0-9][a-z0-9-]{2,71}$/;
const hash=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
const deny=reason=>Object.freeze({
 schema:FOUNDER_INTAKE_SCHEMA,status:'HOLD',reason,
 candidateId:null,intakeReceiptHash:null,publicationAuthority:false,
 personalProfileAccess:false,providerPostCreated:false,harborPickupConfirmed:false
});
function privateDir(dir){
 if(typeof dir!=='string'||!path.isAbsolute(dir))throw Error('private_absolute_dir_required');
 const resolved=path.resolve(dir),real=fs.realpathSync(resolved),stat=fs.lstatSync(resolved);
 if(real!==resolved||!stat.isDirectory()||stat.isSymbolicLink()||
    (stat.mode&0o077)!==0||
    (typeof process.getuid==='function'&&stat.uid!==process.getuid()))
  throw Error('owner_private_dir_required');
 return resolved;
}
function localContext({intakeStateDir,passportStateDir,adapterActorRef,at}){
 const stateDir=privateDir(intakeStateDir),passportDir=privateDir(passportStateDir);
 if(!ACTOR.test(adapterActorRef||'')||!Number.isFinite(Date.parse(at||'')))
  throw Error('owner_adapter_or_clock_invalid');
 return {stateDir,passportDir,adapterActorRef,at:new Date(at).toISOString()};
}
function assertPassportWrite(c){
 const passport=new EvercraftPassport({stateDir:c.passportDir});
 const auth=passport.authorize({
  subject_ref:c.adapterActorRef,product:'evercraft-intake',
  scope:'intake.write.agent',at:c.at
 });
 // Authorize even a duplicate replay. Existing Intake Fabric returns
 // duplicate before its own adapter scope check.
 return auth.decision==='allow';
}
function bindingFor(review){
 const source=review?.candidate?.upstream_source;
 const sha=review?.candidate?.exact_copy_sha256;
 const policies=review?.candidate?.policy_source_hashes;
 const example=review?.candidate?.founder_example_receipt;
 if(review.status!=='READY_FOR_INDEPENDENT_EDITORIAL_REVIEW'||!source||
    !HEX.test(sha||'')||!Array.isArray(policies)||policies.length!==5||
    policies.some(x=>!HEX.test(x?.sha256||'')||typeof x.path!=='string')||
    !HEX.test(example?.sha256||'')||
    typeof review.candidate.story_ref!=='string'||!review.candidate.story_ref)
  throw Error('founder_review_binding_invalid');
 const identity={
  source_department:source.source_department,
  mission_id:source.mission_id,artifact_id:source.artifact_id,
  revision:source.revision,source_receipt_ref:source.source_receipt_ref
 };
 const policyFingerprint=hash(JSON.stringify({
  policies:policies.map(x=>[x.path,x.sha256]),
  example:[example.path,example.section,example.sha256]
 }));
 const payload={
  identity,story_ref:review.candidate.story_ref,
  copy_sha256:sha,policy_sha256:policyFingerprint,
  claim_count:review.candidate.claim_binding_count
 };
 const digest=hash(JSON.stringify(payload));
 return {payload,digest};
}
/**
 * Actual owner-machine Intake submission of an INERT review candidate.
 * Trusted callbacks MUST come from the authorized Systemia runtime, binding
 * original producer identity and exact source revision/public projection.
 * Model-supplied callbacks or synthetic tests are not live verification.
 */
export function stageFounderEditorialIntake({
 upstreamRecord,creatorDraft,trustedChecks,repoRoot,
 intakeStateDir,passportStateDir,adapterActorRef,
 at=new Date().toISOString()
}={}){
 let c;
 try{c=localContext({intakeStateDir,passportStateDir,adapterActorRef,at});}
 catch{return deny('owner_private_runtime_not_ready');}
 if(!assertPassportWrite(c))return deny('passport_agent_intake_write_denied');
 const reviewed=prepareSystemiaFounderCreatorReview({
  upstreamRecord,creatorDraft,trustedChecks,repoRoot
 });
 if(reviewed.status!=='READY_FOR_INDEPENDENT_EDITORIAL_REVIEW')
  return deny('source_or_canonical_editorial_preflight_held');
 let binding;
 try{binding=bindingFor(reviewed);}
 catch{return deny('editorial_binding_missing');}
 const key='founder-editorial:'+binding.digest;
 const candidate={
  idempotency_key:key,external_event_id:key,
  adapter_actor_ref:c.adapterActorRef,
  source_type:'agent',source_ref:'systemia:harbor:founder-editorial',
  source_trust_state:'trusted_internal',
  // The Intake ledger holds only opaque references, not creator prose or URLs.
  content_ref:'private:founder-editorial-review:'+binding.digest.slice(7),
  content_fingerprint:binding.digest,
  intent_excerpt:'Source-bound founder personal post. Human editorial review only; no publication or personal-profile authorization.',
  requested_capability_hints:['harbor-founder-editorial','independent-fact-and-style-review'],
  claimed_priority:'normal',attachments:[],received_at:c.at
 };
 const intake=new EvercraftIntakeFabric({
  stateDir:c.stateDir,passportStateDir:c.passportDir
 });
 let result;
 try{result=intake.ingest(candidate);}
 catch{return deny('existing_intake_fabric_rejected');}
 if(result.candidate?.idempotency_key!==key||
    result.candidate?.content_fingerprint!==binding.digest||
    result.candidate?.source_ref!==candidate.source_ref||
    result.candidate?.adapter_actor_ref!==c.adapterActorRef||
    !HEX.test(result.receipt?.receipt_hash||''))
  return deny('intake_receipt_binding_conflict');
 return Object.freeze({
  schema:FOUNDER_INTAKE_SCHEMA,
  status:result.state==='duplicate'?'DUPLICATE_REVIEW_CANDIDATE':
    'STAGED_IN_EXISTING_INTAKE',
  candidateId:result.candidate.candidate_id,
  contentFingerprint:binding.digest,
  intakeReceiptHash:result.receipt.receipt_hash,
  ownerPrivateIntakeOnly:true,
  actualLiveSourceCallbackProvenanceNotAuditedHere:true,
  founderCopyStoredInIntake:false,independentEditorialReviewed:false,
  publicationAuthority:false,personalProfileAccess:false,
  providerPostCreated:false,harborPickupConfirmed:false,
  nextAction:'AUTHORIZED_HARBOR_INTAKE_READ_AND_INDEPENDENT_EDITORIAL_REVIEW'
 });
}
/**
 * Separate local reader for a specific candidate with Passport intake.read.
 * This does NOT mark Harbor remote pickup or create a new queue/ACK.
 */
export function inspectFounderEditorialPickup({
 candidateId,expectedContentFingerprint,intakeStateDir,passportStateDir,
 readerActorRef,at=new Date().toISOString()
}={}){
 const hold=reason=>({
  schema:FOUNDER_PICKUP_SCHEMA,status:'HOLD',reason,
  candidateId:null,harborPickupConfirmed:false,publicationAuthority:false,
  personalProfileAccess:false,providerPostCreated:false
 });
 let state,passport;
 try{state=privateDir(intakeStateDir);passport=privateDir(passportStateDir);}
 catch{return hold('owner_private_runtime_not_ready')}
 if(!/^candidate_[a-f0-9-]{36}$/i.test(candidateId||'')||
    !HEX.test(expectedContentFingerprint||'')||
    !ACTOR.test(readerActorRef||'')||!Number.isFinite(Date.parse(at||'')))
  return hold('pickup_identity_invalid');
 const intake=new EvercraftIntakeFabric({stateDir:state,passportStateDir:passport});
 const candidate=intake.getCandidate(candidateId,{
  actor_ref:readerActorRef,at:new Date(at).toISOString()
 });
 if(!candidate)return hold('passport_intake_read_denied_or_candidate_missing');
 if(candidate.schema!=='evercraft.intake.mission-candidate.v1'||
    candidate.source_ref!=='systemia:harbor:founder-editorial'||
    candidate.source_type!=='agent'||
    candidate.content_fingerprint!==expectedContentFingerprint||
    candidate.execution_authority_granted!==false||
    candidate.external_side_effects_authorized!==false||
    candidate.admission_state!=='candidate_only'||
    candidate.attachments?.length!==0||
    candidate.quarantine_required===true)
  return hold('candidate_exact_identity_or_safety_mismatch');
 return {
  schema:FOUNDER_PICKUP_SCHEMA,status:'READY_FOR_PRIVATE_HARBOR_REVIEW',
  candidateId:candidate.candidate_id,
  exactSourceBoundDigest:candidate.content_fingerprint,
  founderCopyExposed:false,independentEditorialReviewed:false,
  harborPickupConfirmed:false,publicationAuthority:false,
  personalProfileAccess:false,providerPostCreated:false,
  nextAction:'HARBOR_AUTHENTICATED_PRIVATE_PICKUP_AND_EDITORIAL_REVIEW'
 };
}
