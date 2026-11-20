#!/usr/bin/env node
// Owner-local, read-only Harbor founder evidence receiver.
// Two independent Ed25519 lineage attestations from owner-pinned producer
// and Systemia projection identities are required. Never publishes, signs,
// impersonates an editor, contacts remote sources or grants personal access.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {attestations,verifyAttestation} from '../lineage/signatures.mjs';
import {prepareSystemiaFounderCreatorReview} from './systemia-harbor-upstream.mjs';

export const HARBOR_FOUNDER_BUNDLE_SCHEMA='evercraft.systemia.harbor.founder-signed-bundle.v1';
export const HARBOR_FOUNDER_TRUST_SCHEMA='evercraft.systemia.harbor.owner-trust.v1';
export const HARBOR_FOUNDER_RECEIPT_SCHEMA='evercraft.systemia.harbor.founder-owner-assessment.v1';
const HEX=/^[a-f0-9]{64}$/i;
const ID=/^[a-z0-9][a-z0-9._:-]{1,127}$/i;
const SOURCE_TYPE='systemia-harbor-source-receipt';
const PROJECTION_TYPE='systemia-harbor-public-projection';
const MAX_RECEIPT_AGE_MS=24*60*60*1000;
const MAX_SIGNATURE_LIFE_MS=48*60*60*1000;
const MAX_CLOCK_SKEW_MS=60*1000;
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const canonicalHash=x=>hash(attestations.canonical(x));
const hold=(reason,detail)=>Object.freeze({
 schema:HARBOR_FOUNDER_RECEIPT_SCHEMA,state:'HOLD',reason,
 ...(detail?{detail}:{}),
 review_candidate:null,publication_authority:false,personal_profile_authority:false,
 account_access_performed:false,external_source_fetch_performed:false,
 independent_editorial_review_completed:false,
 signed_provenance_review_complete:false,
 uploaded_or_posted:false
});
function date(x){
 const v=typeof x==='string'?Date.parse(x):NaN;
 return Number.isFinite(v)?v:NaN;
}
const exactKeys=(obj,keys)=>Boolean(obj)&&typeof obj==='object'&&!Array.isArray(obj)&&
  Object.keys(obj).sort().join('|')===[...keys].sort().join('|');

function pinnedEntry(trust,keyId,role,department){
 const rows=trust.entries;
 const matches=rows.filter(e=>e?.key_id===keyId);
 if(matches.length!==1)return null;
 const e=matches[0];
 if(e.status!=='active'||e.role!==role||!ID.test(e.actor_id||'')||
    !['agent','machine','service'].includes(e.actor_type)||
    (role==='producer'&&e.department!==department)||
    (role==='systemia'&&e.department!=='systemia')||
    typeof e.public_key_pem!=='string'||e.public_key_pem.length>2000)return null;
 try{
  const key=crypto.createPublicKey(e.public_key_pem);
  if(key.asymmetricKeyType!=='ed25519')return null;
  return {entry:e,key};
 }catch{return null}
}
function verifyEnvelope(attestation,pinned,{subjectType,subjectId,claimsExpected,now}){
 if(!attestation||attestation.algorithm!=='Ed25519')return false;
 const payload=attestation.payload;
 if(!payload||payload.key_id!==pinned.entry.key_id||
    payload.actor?.id!==pinned.entry.actor_id||
    payload.actor?.type!==pinned.entry.actor_type||
    payload.subject?.type!==subjectType||
    payload.subject?.id!==subjectId||
    !exactKeys(payload.claims,Object.keys(claimsExpected))||
    Object.entries(claimsExpected).some(([k,v])=>payload.claims[k]!==v))return false;
 const issued=date(payload.issued_at),expiry=date(payload.claims.expires_at);
 if(!Number.isFinite(issued)||!Number.isFinite(expiry)||
    issued>now+MAX_CLOCK_SKEW_MS||now-issued>MAX_RECEIPT_AGE_MS||
    expiry<=now||expiry<=issued||expiry-issued>MAX_SIGNATURE_LIFE_MS)return false;
 try{return verifyAttestation(attestation,{
   publicKey:pinned.key,
   expectedSubject:{type:subjectType,id:subjectId}
 }).ok===true}catch{return false}
}
function publicProjection(record){
 if(typeof record?.public_safe_summary!=='string'||
    !Array.isArray(record.claims))return null;
 const claims=record.claims.map(c=>({
  claim_id:c?.claim_id,text:typeof c?.text==='string'?c.text.trim():null,
  evidence_state:c?.evidence_state,
  source_urls:Array.isArray(c?.source_urls)?[...new Set(c.source_urls)]:null,
  uncertainty:c?.uncertainty
 }));
 return {summary:record.public_safe_summary.trim(),claims};
}
function inspectTrust(trust){
 if(trust?.schema!==HARBOR_FOUNDER_TRUST_SCHEMA||!Array.isArray(trust.entries)||
    trust.entries.length<2||trust.entries.length>40)return false;
 const names=trust.entries.map(x=>x?.key_id);
 return names.every(x=>ID.test(x||''))&&new Set(names).size===names.length;
}
/**
 * In-memory logic: callers must supply the owner-pinned trust registry from
 * a SEPARATE protected storage root. Bundle keys and self-asserted review
 * booleans are never trust anchors.
 */
export function assessSignedFounderHarborBundle(bundle,trust,{now=new Date()}={}){
 if(bundle?.schema!==HARBOR_FOUNDER_BUNDLE_SCHEMA)return hold('bundle_schema_invalid');
 if(!inspectTrust(trust))return hold('owner_trust_registry_invalid');
 const record=bundle.upstream_record,creatorDraft=bundle.creator_draft;
 if(!record||!creatorDraft||record.destination!=='harbor'||
    record.via!=='systemia'||record.sensitivity!=='public')
   return hold('source_direction_or_sensitivity_invalid');
 const sourceIdentity={
  source_department:record.source_department,
  mission_id:record.mission_id,artifact_id:record.artifact_id,
  revision:record.revision,source_receipt_ref:record.source_receipt_ref
 };
 if(Object.values(sourceIdentity).some(x=>!ID.test(x||''))||
    record.source_department==='harbor')return hold('source_identity_invalid');
 const creatorCheck=creatorDraft.upstream_source;
 if(!exactKeys(creatorCheck,Object.keys(sourceIdentity))||
    Object.keys(sourceIdentity).some(k=>creatorCheck[k]!==sourceIdentity[k]))
   return hold('founder_draft_not_source_bound');
 const nowMillis=now instanceof Date?now.getTime():date(now);
 if(!Number.isFinite(nowMillis))return hold('clock_invalid');
 const sourceProof=bundle.producer_attestation,projectionProof=bundle.systemia_attestation;
 const producer=pinnedEntry(trust,sourceProof?.payload?.key_id,'producer',record.source_department);
 const systemia=pinnedEntry(trust,projectionProof?.payload?.key_id,'systemia','systemia');
 if(!producer||!systemia||producer.entry.key_id===systemia.entry.key_id||
    (producer.entry.actor_id===systemia.entry.actor_id&&
      producer.entry.actor_type===systemia.entry.actor_type))
   return hold('independent_owner_pinned_signers_required');
 const projection=publicProjection(record);
 if(!projection)return hold('public_safe_projection_invalid');
 const recordDigest=canonicalHash(record);
 const projectionDigest=canonicalHash(projection);
 const producerClaims=sourceProof?.payload?.claims||{};
 const validProducer=verifyEnvelope(sourceProof,producer,{
   subjectType:SOURCE_TYPE,subjectId:record.artifact_id,now:nowMillis,
   claimsExpected:{
    scope:'systemia.harbor.source-read',
    source_department:record.source_department,
    mission_id:record.mission_id,
    artifact_id:record.artifact_id,
    revision:record.revision,
    source_receipt_ref:record.source_receipt_ref,
    record_sha256:recordDigest,
    expires_at:producerClaims.expires_at
   }
 });
 if(!validProducer)return hold('producer_signed_source_not_verified');
 const systemiaClaims=projectionProof?.payload?.claims||{};
 const producerProofDigest=canonicalHash(sourceProof);
 const validSystemia=verifyEnvelope(projectionProof,systemia,{
   subjectType:PROJECTION_TYPE,subjectId:record.artifact_id,now:nowMillis,
   claimsExpected:{
    scope:'systemia.harbor.public-projection.review',
    source_department:record.source_department,
    mission_id:record.mission_id,
    artifact_id:record.artifact_id,
    revision:record.revision,
    source_receipt_ref:record.source_receipt_ref,
    source_record_sha256:recordDigest,
    public_projection_sha256:projectionDigest,
    producer_proof_sha256:producerProofDigest,
    expires_at:systemiaClaims.expires_at
   }
 });
 if(!validSystemia)return hold('systemia_signed_projection_not_verified');
 // These closures verify the specific, already authenticated and signed
 // record. They cannot become generic stubs that bless an unrelated record.
 const checkIdentity=id=>Object.keys(sourceIdentity).every(k=>id?.[k]===sourceIdentity[k])&&
   Object.keys(id||{}).length===Object.keys(sourceIdentity).length;
 const checks=Object.freeze({
  isRegisteredProducer:d=>d===producer.entry.department,
  verifySourceReceipt:id=>checkIdentity(id),
  verifyPublicProjection:(id,payload)=>checkIdentity(id)&&
    canonicalHash(payload)===projectionDigest
 });
 let reviewed;
 try{
  reviewed=prepareSystemiaFounderCreatorReview({
   upstreamRecord:record,creatorDraft,trustedChecks:checks
  });
 }catch{return hold('canonical_founder_preflight_failed')}
 if(reviewed.status!=='READY_FOR_INDEPENDENT_EDITORIAL_REVIEW')
   return hold('founder_editorial_or_claim_hold',reviewed.reason);
 return Object.freeze({
  schema:HARBOR_FOUNDER_RECEIPT_SCHEMA,
  state:'READY_FOR_INDEPENDENT_EDITORIAL_REVIEW',
  reason:'two_independent_pinned_signatures_and_founder_source_guard',
  signed_provenance_review_complete:true,
  source_receipt_sha256:'sha256:'+producerProofDigest,
  projection_receipt_sha256:'sha256:'+canonicalHash(projectionProof),
  exact_copy_sha256:reviewed.candidate.exact_copy_sha256,
  policy_source_hashes:reviewed.candidate.policy_source_hashes,
  documented_founder_example:reviewed.candidate.founder_example_receipt,
  human_next_action:'REVIEW_EXACT_COPY_FACTS_VOICE_SOURCE_FRESHNESS_AND_MEDIA_RIGHTS',
  review_candidate:reviewed.candidate,
  publication_authority:false,personal_profile_authority:false,
  account_access_performed:false,external_source_fetch_performed:false,
  independent_editorial_review_completed:false,uploaded_or_posted:false
 });
}
function privateParent(file){
 const parent=path.resolve(path.dirname(file));
 if(fs.realpathSync(parent)!==parent)throw Error('private_path_symlink');
 const s=fs.lstatSync(parent);
 if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)!==0||
    (typeof process.getuid==='function'&&s.uid!==process.getuid()))
   throw Error('private_parent_not_owned');
 return parent;
}
function readOwnerJson(file){
 if(typeof file!=='string'||!path.isAbsolute(file))throw Error('absolute_file_required');
 privateParent(file);
 const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
 try{
  const st=fs.fstatSync(fd);
  if(!st.isFile()||st.nlink!==1||(st.mode&0o077)!==0||st.size<1||
    st.size>1024*1024||
    (typeof process.getuid==='function'&&st.uid!==process.getuid()))
    throw Error('private_file_not_owned');
  const content=Buffer.alloc(st.size);
  let pos=0;
  while(pos<content.length){
   const n=fs.readSync(fd,content,pos,content.length-pos,pos);
   if(n<=0)throw Error('private_file_truncated');
   pos+=n;
  }
  const after=fs.fstatSync(fd);
  if(after.size!==st.size||after.mtimeMs!==st.mtimeMs||
     after.ctimeMs!==st.ctimeMs||after.ino!==st.ino)
    throw Error('private_file_changed');
  return JSON.parse(content.toString('utf8'));
 }finally{fs.closeSync(fd)}
}
export function inspectOwnerSignedFounderHarborFiles({bundleFile,trustFile,now}={}){
 if(typeof process.getuid==='function'&&process.getuid()===0)
   return hold('root_execution_forbidden');
 try{
  // Never trust a key registry supplied alongside the untrusted source packet.
  if(privateParent(bundleFile)===privateParent(trustFile))
    return hold('trust_registry_must_be_separate_owner_root');
  const trust=readOwnerJson(trustFile);
  const bundle=readOwnerJson(bundleFile);
  return assessSignedFounderHarborBundle(bundle,trust,{now});
 }catch{return hold('private_signed_evidence_read_failed')}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(args.length!==4||args[0]!=='--bundle'||args[2]!=='--trusted-keys'){
  console.error('HOLD: supply --bundle /owner/private/bundle.json --trusted-keys /independent/owner/private/trust.json');
  process.exitCode=2;
 }else{
  const report=inspectOwnerSignedFounderHarborFiles({bundleFile:args[1],trustFile:args[3]});
  console.log(JSON.stringify(report,null,2));
  if(report.state!=='READY_FOR_INDEPENDENT_EDITORIAL_REVIEW')process.exitCode=2;
 }
}
