#!/usr/bin/env node
// Harbor founder editorial intake, owner-local only.
// Uses EXISTING Lineage Ed25519 actor attestations, actual owner-installed
// trust anchors, existing Systemia source gate, and canonical founder preflight.
// Absolutely no network, account access, publishing or human review claims.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lineage} from '../lineage/core.mjs';
import {verifyAttestation} from '../lineage/signatures.mjs';
import {prepareSystemiaFounderCreatorReview} from './systemia-harbor-upstream.mjs';

export const OWNER_HARBOR_FOUNDER_SCHEMA='evercraft.harbor.founder-owner-intake.v1';
export const OWNER_HARBOR_TRUST_SCHEMA='evercraft.harbor.founder-owner-trust.v1';
export const OWNER_HARBOR_RECEIPT_SCHEMA='evercraft.harbor.founder-owner-receipt.v1';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const SHA=/^[a-f0-9]{64}$/i;
const code=e=>{throw Error('owner_founder_'+e)};
const sha=value=>crypto.createHash('sha256').update(typeof value==='string'?value:lineage.stable(value)).digest('hex');
const keyRef=v=>typeof v==='string'&&/^[a-z0-9][a-z0-9:._-]{2,127}$/i.test(v);
const publicKey=v=>{
 try{
  if(typeof v!=='string'||v.length>4096)return null;
  const key=crypto.createPublicKey(v);
  return key.asymmetricKeyType==='ed25519'?key:null;
 }catch{return null}
};
function signatureProof(envelope,entry,record,role,hash){
 if(!entry||entry.role!==role||entry.status!=='active'||
    !keyRef(entry.key_id)||!keyRef(entry.actor_id)||
    !['agent','service','operator'].includes(entry.actor_type)||
    entry.key_id!==envelope?.payload?.key_id||
    entry.actor_id!==envelope?.payload?.actor?.id||
    entry.actor_type!==envelope?.payload?.actor?.type||
    entry.department!==record.source_department)return false;
 const key=publicKey(entry.public_key_pem);
 if(!key)return false;
 const proof=verifyAttestation(envelope,{
  publicKey:key,
  expectedSubject:{type:'systemia.harbor.source-revision',id:hash}
 });
 if(!proof.ok)return false;
 const p=envelope.payload,claims=p.claims;
 return p.key_id===entry.key_id&&
  claims?.role===role&&
  claims?.department===record.source_department&&
  claims?.source_receipt_ref===record.source_receipt_ref&&
  claims?.revision===record.revision&&
  claims?.public_projection_sha256===hash&&
  claims?.publication_authority===false;
}
/** Source is either a trusted local file, or a pure test fixture with
 * independently generated keys. Never accept trust entries from the bundle.
 */
export function assessOwnerHarborFounderIntake(bundle,trust,{repoRoot=ROOT}={}){
 const hold=(reason,details=[])=>Object.freeze({
  schema:OWNER_HARBOR_RECEIPT_SCHEMA,
  status:'HOLD',reason,blockers:details,
  source_attestations_valid:false,
  verified_source_revision_digest:null,
  founder_copy_digest:null,
  original_web_sources_fetched_by_this_tool:false,
  live_harbor_receiver_observed:false,
  independent_editorial_review_completed:false,
  founder_profile_publishing_authorized:false,
  provider_posted:false,
 });
 if(bundle?.schema!==OWNER_HARBOR_FOUNDER_SCHEMA)return hold('unsupported_packet_schema');
 if(trust?.schema!==OWNER_HARBOR_TRUST_SCHEMA)return hold('owner_trust_not_configured');
 if(!bundle.upstreamRecord||typeof bundle.upstreamRecord!=='object'||
    !bundle.creatorDraft||typeof bundle.creatorDraft!=='object')
  return hold('source_or_creator_packet_missing');
 const record=bundle.upstreamRecord;
 if(!Array.isArray(trust.keys)||trust.keys.length>64||trust.keys.length<2)
  return hold('trust_anchor_catalog_invalid');
 const ids=trust.keys.map(k=>k?.key_id);
 if(ids.some(x=>!keyRef(x))||new Set(ids).size!==ids.length)
  return hold('trust_key_identity_duplicate_or_invalid');
 const producer=trust.keys.find(k=>k.key_id===bundle.attestations?.producer?.payload?.key_id);
 const projection=trust.keys.find(k=>k.key_id===bundle.attestations?.projection?.payload?.key_id);
 if(!producer||!projection||producer===projection||
    producer.role!=='producer'||projection.role!=='projection'||
    producer.key_id===projection.key_id||
    producer.actor_id===projection.actor_id)
  return hold('independent_producer_and_projection_actors_required');
 const pkey=publicKey(producer.public_key_pem),vkey=publicKey(projection.public_key_pem);
 if(!pkey||!vkey||pkey.export({format:'der',type:'spki'}).equals(
    vkey.export({format:'der',type:'spki'})))
  return hold('distinct_real_signing_keys_required');
 // All fields of source record, not merely mission IDs, must be covered.
 let digest;
 try{
  digest=sha(record);
  if(!SHA.test(digest))return hold('projection_digest_invalid');
 }catch{return hold('source_serialization_invalid')}
 const pOk=signatureProof(bundle.attestations.producer,producer,record,'producer',digest);
 const vOk=signatureProof(bundle.attestations.projection,projection,record,'projection',digest);
 if(!pOk||!vOk)return hold('two_role_attestations_not_verified');
 const verified={...bundle.attestations};
 const checks={
  isRegisteredProducer:department=>department===record.source_department&&
    producer.department===department&&projection.department===department,
  verifySourceReceipt:identity=>Object.keys(identity).every(k=>identity[k]===
    (k==='source_department'?record.source_department:record[k]))&&
    identity.source_receipt_ref===record.source_receipt_ref&&pOk,
  verifyPublicProjection:(identity,payload)=>{
   const actual={
    summary:record.public_safe_summary?.trim(),
    claims:Array.isArray(record.claims)?record.claims.map(claim=>({
     claim_id:claim.claim_id,text:claim.text?.trim(),
     evidence_state:claim.evidence_state,source_urls:[...new Set(claim.source_urls||[])],
     uncertainty:claim.uncertainty
    })):[]
   };
   return vOk&&identity.source_receipt_ref===record.source_receipt_ref&&
     lineage.stable(actual)===lineage.stable(payload);
  }
 };
 // No self-asserted "approved" or "verified" booleans on incoming bundle
 // can substitute for either Ed25519 role or the original editorial gate.
 let review;
 try{
  review=prepareSystemiaFounderCreatorReview({
   upstreamRecord:record,creatorDraft:bundle.creatorDraft,trustedChecks:checks,
   repoRoot
  });
 }catch{return hold('original_editorial_preflight_unavailable')}
 const ready=review.status==='READY_FOR_INDEPENDENT_EDITORIAL_REVIEW';
 return Object.freeze({
  schema:OWNER_HARBOR_RECEIPT_SCHEMA,
  status:ready?'READY_FOR_INDEPENDENT_EDITORIAL_REVIEW':'HOLD',
  reason:ready?'two_distinct_trusted_lineage_attestations_and_canonical_preflight':
    review.reason,
  blockers:ready?[]:review.blockers||[],
  source_attestations_valid:true,
  verified_source_revision_digest:'sha256:'+digest,
  founder_copy_digest:review.candidate?.exact_copy_sha256||null,
  original_web_sources_fetched_by_this_tool:false,
  live_harbor_receiver_observed:false,
  independent_editorial_review_completed:false,
  founder_profile_publishing_authorized:false,
  provider_posted:false,
  policy_source_hashes:ready?review.candidate.policy_source_hashes:[],
  documented_founder_example:ready?review.candidate.founder_example_receipt:null,
 });
}
function privateDir(p){
 if(typeof p!=='string'||!path.isAbsolute(p))code('absolute_private_dir_required');
 const resolved=path.resolve(p),parts=[];
 let next=resolved;
 while(next!==path.dirname(next)){parts.unshift(next);next=path.dirname(next)}
 // The actual private directory must be canonical, no symlink, current UID.
 const stat=fs.lstatSync(resolved);
 if(!stat.isDirectory()||stat.isSymbolicLink()||
    (stat.mode&0o077)!==0||(process.getuid?.()!==undefined&&stat.uid!==process.getuid()))
  code('owner_private_directory_required');
 if(fs.realpathSync(resolved)!==resolved)code('symlinked_parent_forbidden');
 return resolved;
}
function readPrivateJSON(file){
 if(typeof file!=='string'||!path.isAbsolute(file))code('absolute_private_file_required');
 privateDir(path.dirname(file));
 const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
 try{
  const st=fs.fstatSync(fd);
  if(!st.isFile()||st.nlink!==1||(st.mode&0o077)!==0||
     (process.getuid?.()!==undefined&&st.uid!==process.getuid())||
     st.size<2||st.size>512*1024)code('unsafe_private_json_file');
  const buf=Buffer.alloc(st.size);let offset=0;
  while(offset<buf.length){
   const n=fs.readSync(fd,buf,offset,buf.length-offset,offset);
   if(n<1)code('truncated_private_json_file');
   offset+=n;
  }
  const after=fs.fstatSync(fd);
  if(after.mtimeMs!==st.mtimeMs||after.ctimeMs!==st.ctimeMs||
     after.size!==st.size||after.ino!==st.ino)code('private_file_changed_during_read');
  return JSON.parse(buf.toString('utf8'));
 }finally{fs.closeSync(fd)}
}
export function inspectOwnedHarborFounderPacket({packetFile,trustFile,repoRoot}={}){
 if(process.getuid?.()===0)code('non_root_owner_required');
 const bundle=readPrivateJSON(packetFile);
 const trust=readPrivateJSON(trustFile);
 return {assessment:assessOwnerHarborFounderIntake(bundle,trust,{repoRoot}),
  packetDigest:sha(bundle)};
}
/** Optional deliberate local-only receipt write. Never publish or send a file.
 * Caller must provide pre-created 0700 owner-private directory.
 */
export function recordOwnedHarborFounderAssessment({assessment,packetDigest,receiptDir}={}){
 if(process.getuid?.()===0)code('non_root_owner_required');
 privateDir(receiptDir);
 if(!SHA.test(packetDigest||'')||assessment?.schema!==OWNER_HARBOR_RECEIPT_SCHEMA)
  code('receipt_input_invalid');
 const filename='founder-'+packetDigest.toLowerCase()+'.json';
 const dest=path.join(receiptDir,filename);
 const body=JSON.stringify({schema:OWNER_HARBOR_RECEIPT_SCHEMA,
  packet_sha256:packetDigest.toLowerCase(),...assessment},null,2)+'\n';
 try{fs.writeFileSync(dest,body,{mode:0o600,flag:'wx'})}
 catch(e){
  if(e.code!=='EEXIST')throw e;
  const stored=readPrivateJSON(dest);
  if(JSON.stringify(stored)!==JSON.stringify(JSON.parse(body)))
   code('existing_receipt_conflict');
  return {state:'EXISTING_IDEMPOTENT_RECEIPT',receipt_sha256:'sha256:'+sha(body)};
 }
 return {state:'PRIVATE_RECEIPT_RECORDED',receipt_sha256:'sha256:'+sha(body)};
}
function cli(argv){
 const opts={},keys=new Set(['--packet','--trust','--receipt-dir','--record']);
 for(let i=0;i<argv.length;i++){
  const k=argv[i];
  if(!keys.has(k)||Object.hasOwn(opts,k))code('invalid_cli');
  opts[k]=k==='--record'?true:argv[++i];
 }
 if(!opts['--packet']||!opts['--trust'])code('packet_trust_required');
 if(Boolean(opts['--record'])!==Boolean(opts['--receipt-dir']))
  code('record_requires_explicit_receipt_directory');
 const {assessment,packetDigest}=inspectOwnedHarborFounderPacket({
  packetFile:opts['--packet'],trustFile:opts['--trust']
 });
 const recorded=opts['--record']?
  recordOwnedHarborFounderAssessment({assessment,packetDigest,
   receiptDir:opts['--receipt-dir']}):null;
 // Report is redacted. Paths, personal prose, key material never printed.
 console.log(JSON.stringify({assessment,local_receipt:recorded},null,2));
 if(assessment.status==='HOLD')process.exitCode=2;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{cli(process.argv.slice(2))}
 catch{
  console.error('HOLD: owner_harbor_founder_private_evidence_preflight_failed');
  process.exitCode=2;
 }
}
