// Existing owner-private signed Harbor inbox -> existing Passport-gated
// Intake Fabric -> separate authorized Harbor local read.
// No second review queue, publisher, customer data, personal prose or network.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {EvercraftIntakeFabric} from '../intake-fabric/intake.mjs';
import {EvercraftPassport} from '../passport/passport.mjs';
import {
 inspectOwnedHarborFounderPacket,OWNER_HARBOR_RECEIPT_SCHEMA
} from './harbor-founder-owner-inbox.mjs';

export const FOUNDER_INTAKE_SCHEMA='evercraft.systemia.harbor.founder-editorial-intake.v1';
export const FOUNDER_PICKUP_SCHEMA='evercraft.systemia.harbor.founder-editorial-pickup.v1';
const HEX=/^sha256:[a-f0-9]{64}$/i;
const RAWHEX=/^[a-f0-9]{64}$/i;
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
 // Even exact duplicate replay requires CURRENT authorization: Intake itself
 // resolves duplicate IDs before its adapter Passport check.
 return auth.decision==='allow';
}
function bindingFor(assessment,packetDigest){
 if(assessment?.schema!==OWNER_HARBOR_RECEIPT_SCHEMA||
    assessment.status!=='READY_FOR_INDEPENDENT_EDITORIAL_REVIEW'||
    assessment.source_attestations_valid!==true||
    !RAWHEX.test(packetDigest||'')||
    !HEX.test(assessment.verified_source_revision_digest||'')||
    !HEX.test(assessment.founder_copy_digest||'')||
    !Array.isArray(assessment.policy_source_hashes)||
    assessment.policy_source_hashes.length!==5||
    assessment.policy_source_hashes.some(p=>!HEX.test(p?.sha256||'')||
      typeof p.path!=='string')||
    !HEX.test(assessment.documented_founder_example?.sha256||'')||
    assessment.provider_posted!==false||
    assessment.founder_profile_publishing_authorized!==false)
  throw Error('owner_signed_founder_review_binding_missing');
 // Hash only redacted and authenticated receipts, not private founder copy.
 const payload={
  signed_packet_sha256:packetDigest,
  signed_source_sha256:assessment.verified_source_revision_digest,
  founder_copy_sha256:assessment.founder_copy_digest,
  canonical_policies:assessment.policy_source_hashes.map(p=>[p.path,p.sha256]),
  founder_example_sha256:assessment.documented_founder_example.sha256
 };
 return hash(JSON.stringify(payload));
}
/**
 * The ONLY staging entry consumes owner-private 0600 packet and independently
 * provisioned trust-anchor files. The existing owner inbox verifies distinct
 * actor signatures, exact source revision, the factual claim bindings and the
 * 5 real editorial policies. It is not safe to take bundle/trust objects from
 * an LLM or network request and call that "authenticated".
 */
export function stageOwnedFounderEditorialIntake({
 packetFile,trustFile,repoRoot,
 intakeStateDir,passportStateDir,adapterActorRef,
 at=new Date().toISOString()
}={}){
 let c;
 try{c=localContext({intakeStateDir,passportStateDir,adapterActorRef,at});}
 catch{return deny('owner_private_runtime_not_ready');}
 if(!assertPassportWrite(c))return deny('passport_agent_intake_write_denied');
 let inspected;
 try{
  inspected=inspectOwnedHarborFounderPacket({packetFile,trustFile,repoRoot});
 }catch{return deny('signed_owner_inbox_not_verified');}
 let digest;
 try{digest=bindingFor(inspected.assessment,inspected.packetDigest);}
 catch{return deny('signed_source_or_canonical_editorial_hold');}
 const key='founder-editorial:'+digest;
 const candidate={
  idempotency_key:key,external_event_id:key,
  adapter_actor_ref:c.adapterActorRef,source_type:'agent',
  source_ref:'systemia:harbor:founder-editorial',
  // The content is still untrusted, even when the adapter is authorized and
  // producer attestations are valid. Never treat a draft as an instruction.
  source_trust_state:'untrusted_external',
  content_ref:'private:founder-editorial:'+digest.slice(7),
  content_fingerprint:digest,
  intent_excerpt:'Signed-source founder creator candidate. Private independent editorial review only; no personal publishing authorization.',
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
    result.candidate?.content_fingerprint!==digest||
    result.candidate?.source_ref!==candidate.source_ref||
    result.candidate?.adapter_actor_ref!==c.adapterActorRef||
    !HEX.test(result.receipt?.receipt_hash||''))
  return deny('intake_receipt_binding_conflict');
 return Object.freeze({
  schema:FOUNDER_INTAKE_SCHEMA,
  status:result.state==='duplicate'?'DUPLICATE_REVIEW_CANDIDATE':
    'STAGED_IN_EXISTING_INTAKE',
  candidateId:result.candidate.candidate_id,
  contentFingerprint:digest,
  intakeReceiptHash:result.receipt.receipt_hash,
  ownerPrivateIntakeOnly:true,
  trustedKeyProvisioningSeparatelyRequired:true,
  founderCopyStoredInIntake:false,independentEditorialReviewed:false,
  publicationAuthority:false,personalProfileAccess:false,
  providerPostCreated:false,harborPickupConfirmed:false,
  nextAction:'AUTHORIZED_HARBOR_INTAKE_READ_AND_INDEPENDENT_EDITORIAL_REVIEW'
 });
}
/**
 * Separate local reader for a specific candidate with Passport intake.read.
 * This does NOT mark a genuine Harbor remote pickup or provider publication.
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
    candidate.source_trust_state!=='untrusted_external'||
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
