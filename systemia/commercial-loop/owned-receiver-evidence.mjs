#!/usr/bin/env node
// Owner-local commercial loop: verify actual sealed NextGen private custody
// and Passport-readable candidate before projecting an order's next safe gate.
// No network calls, file mutations, execution permits, customer sends or payments.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {EvercraftIntakeFabric} from '../intake-fabric/intake.mjs';
import {candidateForVerifiedWingReceipt} from '../wing-courier/intake-bridge.mjs';
import {projectCommercialLoop,COMMERCIAL_LOOP_ORDER_SCHEMA} from './commercial-loop-read-model.mjs';

export const OWNED_READ_MODEL_SCHEMA='evercraft.commercial-loop.owned-receiver-evidence.v1';
const HEX32=/^[a-f0-9]{32}$/i,HEX64=/^[a-f0-9]{64}$/i;
const MAX_JSON=1024*1024;
const fail=code=>{throw Error('commercial_owned_receipt_'+code);};
function assertNoRoot(){
 if(typeof process.getuid==='function'&&process.getuid()===0)fail('root_forbidden');
}
function privateDir(p){
 if(typeof p!=='string'||!path.isAbsolute(p))fail('absolute_private_dir_required');
 const full=path.resolve(p);
 if(fs.realpathSync(full)!==full)fail('symlink_path_forbidden');
 const s=fs.lstatSync(full);
 if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)!==0||
    (typeof process.getuid==='function'&&s.uid!==process.getuid()))
   fail('private_directory_required');
 return full;
}
function checkedFd(file,max=MAX_JSON){
 if(typeof file!=='string'||!path.isAbsolute(file))fail('absolute_file_required');
 const handle=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
 try{
  const st=fs.fstatSync(handle);
  if(!st.isFile()||st.nlink!==1||(st.mode&0o077)!==0||
     (typeof process.getuid==='function'&&st.uid!==process.getuid())||
     st.size<=0||st.size>max)fail('unsafe_private_file');
  return {fd:handle,st};
 }catch(e){fs.closeSync(handle);throw e;}
}
function privateJson(file){
 const {fd,st}=checkedFd(file);
 try{
  const data=Buffer.alloc(st.size);
  let offset=0;
  while(offset<data.length){
   const n=fs.readSync(fd,data,offset,data.length-offset,offset);
   if(n===0)fail('private_json_truncated');
   offset+=n;
  }
  const after=fs.fstatSync(fd);
  if(after.size!==st.size||after.mtimeMs!==st.mtimeMs||
     after.ctimeMs!==st.ctimeMs)fail('private_json_changed');
  try{return JSON.parse(data.toString('utf8'))}
  catch{fail('private_json_invalid')}
 }finally{fs.closeSync(fd)}
}
function checksumPrivateFile(file,expectedBytes,expectedDigest){
 const {fd,st}=checkedFd(file,2*1024**3);
 try{
  if(st.size!==expectedBytes)fail('asset_length_changed');
  const hash=crypto.createHash('sha256'),buf=Buffer.allocUnsafe(1024*1024);
  let offset=0;
  while(offset<st.size){
   const n=fs.readSync(fd,buf,0,Math.min(buf.length,st.size-offset),offset);
   if(n<1)fail('asset_truncated');
   hash.update(buf.subarray(0,n));offset+=n;
  }
  const after=fs.fstatSync(fd);
  if(after.size!==st.size||after.mtimeMs!==st.mtimeMs||
     after.ctimeMs!==st.ctimeMs||after.ino!==st.ino)fail('asset_changed_during_read');
  if(hash.digest('hex')!==expectedDigest.toLowerCase())fail('asset_sha256_mismatch');
 }finally{fs.closeSync(fd)}
}
function verifyPrivatePackage({root,order,hostname}){
 if(!HEX32.test(order.packageId||''))fail('package_id_invalid');
 const packageDir=path.join(root,order.packageId);
 if(!fs.existsSync(packageDir))return null;
 privateDir(packageDir);
 const receipt=privateJson(path.join(packageDir,'receipt.json'));
 if(receipt?.schema!=='evercraft.systemia.wing-receive-receipt.v1'||
    receipt.state!=='AUTHENTICATED_BYTES_RECEIVED'||
    receipt.privateCustodyVerified!==true||
    receipt.id!==order.packageId||receipt.fromWing!=='harbor'||
    receipt.toWing!=='fallen'||receipt.kind!=='media'||
    receipt.receiverHostname!==hostname||
    !HEX64.test(receipt.ciphertextSha256||'')||
    !Array.isArray(receipt.assets)||receipt.assets.length!==order.expectedAssetCount)
    fail('custody_receipt_identity_invalid');
 const names=new Set(['receipt.json']);
 const folded=new Set();
 let bytes=0;
 for(const a of receipt.assets){
  const name=a?.filename;
  if(typeof name!=='string'||!name||name.length>200||name.startsWith('.')||
     name!==path.basename(name)||name.includes('/')||name.includes('\\')||
     /[\u0000-\u001f\u007f]/.test(name)||
     !HEX64.test(a?.sha256||'')||!Number.isSafeInteger(a?.bytes)||a.bytes<1||
     folded.has(name.toLowerCase())||
     name==='receipt.json'||name==='intake-offer.json')
   fail('custody_manifest_invalid');
  names.add(name);folded.add(name.toLowerCase());
  bytes+=a.bytes;
  if(bytes>3*1024**3)fail('custody_too_large');
  checksumPrivateFile(path.join(packageDir,name),a.bytes,a.sha256);
 }
 // The resident writes intake-offer.json only after Passport-authorized intake.
 // It is optional and must be independently corroborated in the actual Intake store.
 const entries=fs.readdirSync(packageDir);
 if(entries.some(x=>x!=='intake-offer.json'&&!names.has(x))||
    (names.size+Number(entries.includes('intake-offer.json')))!==entries.length)
   fail('unexpected_private_custody_file');
 return {receipt,packageDir,assetCount:receipt.assets.length,verifiedBytes:bytes};
}
function result(projected,{custodyVerified=false,passportCandidateReadback=false,
 assetCount=0,verifiedBytes=0}={}){
 return {
  schema:OWNED_READ_MODEL_SCHEMA,
  stage:projected.stage,nextAction:projected.nextAction,holds:projected.holds,
  custodyVerifiedByLocalRehash:custodyVerified,
  passportCandidateReadback,
  verifiedAssetCount:assetCount,verifiedBytes,
  ownerMachineReadOnly:true,cryptoSenderProofRecheckedHere:false,
  externalProviderReadback:false,producerAssignedByThisTool:false,
  previewSentByThisTool:false,paymentTakenByThisTool:false,
  shippingInitiatedByThisTool:false,
 };
}
/**
 * Evidence adapter called ON THE REAL AUTHORIZED FALLEN RECEIVER ONLY.
 * Must not be invoked in GitHub Actions to claim real customer acceptance.
 */
export function inspectOwnedCommercialLoop({
 orderFile,custodyRoot,intakeStateDir,passportStateDir,
 intakeReadActorRef,hostname=os.hostname()
}={}){
 assertNoRoot();
 const order=privateJson(orderFile);
 if(order?.schema!==COMMERCIAL_LOOP_ORDER_SCHEMA)fail('order_schema_invalid');
 // Validate order before using it as a filesystem path.
 const pre=projectCommercialLoop({order});
 const root=privateDir(custodyRoot);
 let custody;
 try{custody=verifyPrivatePackage({root,order,hostname})}
 catch{
  // ENOENT, ELOOP, EACCES, races and malformed files all mean custody cannot
  // be trusted. Do not leak private paths or turn them into false success.
  const conflict=projectCommercialLoop({order,custody:{observedBy:'invalid',receipt:null}});
  return result(conflict);
 }
 if(!custody)return result(pre);
 const trusted={observedBy:'trusted-owned-receiver',receipt:custody.receipt};
 const flags={custodyVerified:true,assetCount:custody.assetCount,verifiedBytes:custody.verifiedBytes};
 const initial=projectCommercialLoop({order,custody:trusted});
 const offerFile=path.join(custody.packageDir,'intake-offer.json');
 if(!fs.existsSync(offerFile))return result(initial,flags);
 let intake;
 try{
  if(!intakeStateDir||!passportStateDir||!intakeReadActorRef)
   fail('passport_read_scope_required');
  privateDir(intakeStateDir);privateDir(passportStateDir);
  intake=privateJson(offerFile);
  const fabric=new EvercraftIntakeFabric({stateDir:intakeStateDir,passportStateDir});
  const candidate=fabric.getCandidate(intake.candidateId,{actor_ref:intakeReadActorRef});
  const derived=candidateForVerifiedWingReceipt({receipt:custody.receipt});
  if(!candidate||candidate.idempotency_key!==derived.idempotency_key||
     candidate.content_fingerprint!==derived.content_fingerprint||
     candidate.source_ref!==derived.source_ref||
     candidate.candidate_id!==intake.candidateId||
     candidate.attachments?.length!==derived.attachments.length)
   fail('passport_candidate_binding_invalid');
 }catch{
  // Never promote a self-presented intake-offer receipt without authorized
  // Passport readback of the exact inert candidate.
  const conflict=projectCommercialLoop({order,custody:trusted,intake:{schema:'unverified'}});
  return result(conflict,flags);
 }
 return result(projectCommercialLoop({order,custody:trusted,intake}),
   {...flags,passportCandidateReadback:true});
}
function cli(argv){
 const expected=['--order','--custody-root','--intake-dir','--passport-dir','--read-actor'];
 const flags={};
 for(let i=0;i<argv.length;i++){
  if(!expected.includes(argv[i])||flags[argv[i]]!==undefined||i+1>=argv.length)
   fail('cli_options_invalid');
  flags[argv[i]]=argv[++i];
 }
 if(!flags['--order']||!flags['--custody-root'])fail('order_and_root_required');
 const report=inspectOwnedCommercialLoop({
  orderFile:flags['--order'],custodyRoot:flags['--custody-root'],
  intakeStateDir:flags['--intake-dir'],passportStateDir:flags['--passport-dir'],
  intakeReadActorRef:flags['--read-actor'],
 });
 // Deliberately do not print customer/order/thread/file/key paths or hashes.
 console.log(JSON.stringify(report));
 if(['CUSTODY_CONFLICT','INTAKE_CONFLICT'].includes(report.stage))process.exitCode=2;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{cli(process.argv.slice(2))}catch{
  console.error('HOLD: commercial_owned_evidence_private_preflight_failed');
  process.exitCode=2;
 }
}
