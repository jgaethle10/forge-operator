// Leiland's owned, one-way publication adapter for the ALREADY sanitized KAIDANCE pulse.
// This does not read Raven inference, expose private control endpoints, or authorize a deploy.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {projectPublicKaidancePulse} from '../collider/public-projection.mjs';
import {assessPublicPulse} from '../../public/kaidance/pulse-source.mjs';

export const APPROVAL_SCHEMA='evercraft.leiland.owned-pulse-approval.v1';
export const PUBLIC_PULSE_TARGET=path.join('kaidance','pulse.json');
const MAX_INPUT_BYTES=32768;
const MAX_APPROVAL_BYTES=8192;
const MAX_APPROVAL_SPAN_MS=7*86400000;
const PUBLISH_AGE_MS=420000;
const sha256=bytes=>'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');
const fail=reason=>{throw Error(reason)};

function isRegularPrivate(file,maxSize){
  const st=fs.lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||st.size>maxSize||st.size===0)fail('invalid_private_file');
  if((st.mode&0o077)!==0)fail('private_file_permissions_invalid');
}
function validTime(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value))fail('approval_timestamp_invalid');
  const parsed=Date.parse(value);
  if(!Number.isFinite(parsed))fail('approval_timestamp_invalid');
  return parsed;
}
function plainObject(value){
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
function exactFields(value,keys){
  if(!plainObject(value))fail('approval_schema_invalid');
  const names=Object.keys(value);
  if(names.length!==keys.length||names.some(name=>!keys.includes(name)))fail('approval_fields_invalid');
}
function assertOwnedDirectory(dir){
  if(!path.isAbsolute(dir))fail('absolute_path_required');
  const st=fs.lstatSync(dir);
  if(!st.isDirectory()||st.isSymbolicLink())fail('owned_directory_invalid');
  if(fs.realpathSync(dir)!==path.resolve(dir))fail('owned_directory_symlink_forbidden');
  return path.resolve(dir);
}
function assertTarget(root){
  const parent=assertOwnedDirectory(path.join(root,'kaidance'));
  if(path.dirname(parent)!==root)fail('unexpected_target_parent');
  const target=path.join(parent,'pulse.json');
  try{if(fs.lstatSync(target).isSymbolicLink())fail('public_pulse_symlink_forbidden')}
  catch(error){if(error.code!=='ENOENT')throw error}
  return target;
}
function decodeSignature(raw){
  const value=raw.toString('utf8').trim();
  if(!/^[A-Za-z0-9+/]{86}==$/.test(value))fail('approval_signature_format_invalid');
  const bytes=Buffer.from(value,'base64');
  if(bytes.length!==64||bytes.toString('base64')!==value)fail('approval_signature_format_invalid');
  return bytes;
}
export function verifyPublicationApproval({approvalBytes,signatureBytes,verifyKey,sourcePath,targetPath,now=new Date()}){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))fail('clock_invalid');
  if(!Buffer.isBuffer(approvalBytes)||approvalBytes.length>MAX_APPROVAL_BYTES)fail('approval_bytes_invalid');
  if(!Buffer.isBuffer(signatureBytes))fail('approval_signature_missing');
  const signature=decodeSignature(signatureBytes);
  let pub;try{pub=crypto.createPublicKey(verifyKey)}catch{fail('approval_verify_key_invalid')}
  if(pub.asymmetricKeyType!=='ed25519')fail('approval_verify_key_type_invalid');
  if(!crypto.verify(null,approvalBytes,pub,signature))fail('approval_signature_invalid');
  let approval;
  try{approval=JSON.parse(approvalBytes.toString('utf8'))}catch{fail('approval_json_invalid')}
  exactFields(approval,['schema','scope','approval_ref','source_path','target_path','not_before','expires_at']);
  if(approval.schema!==APPROVAL_SCHEMA||approval.scope!=='kaidance.public-pulse.publish')fail('approval_scope_invalid');
  if(typeof approval.approval_ref!=='string'||!/^approved:[a-z0-9][a-z0-9:._-]{5,100}$/i.test(approval.approval_ref))fail('approval_ref_invalid');
  if(approval.source_path!==sourcePath||approval.target_path!==targetPath)fail('approval_binding_mismatch');
  const start=validTime(approval.not_before),end=validTime(approval.expires_at),current=now.getTime();
  if(end<=start||end-start>MAX_APPROVAL_SPAN_MS||current<start||current>=end)fail('approval_not_current');
  return Object.freeze({approval_ref:approval.approval_ref,scope:approval.scope,expires_at:approval.expires_at});
}

export function publishOwnedKaidancePulse({sourceFile,ownedPublicRoot,approvalFile,signatureFile,verifyKeyFile,receiptDir,now=new Date()}={}){
  if([sourceFile,ownedPublicRoot,approvalFile,signatureFile,verifyKeyFile,receiptDir].some(x=>typeof x!=='string'||!path.isAbsolute(x)))fail('absolute_paths_required');
  const root=assertOwnedDirectory(ownedPublicRoot);
  const target=assertTarget(root);
  const receipts=assertOwnedDirectory(receiptDir);
  if(receipts===root||receipts.startsWith(root+path.sep))fail('private_receipts_must_not_be_public');
  const source=path.resolve(sourceFile);
  if(fs.realpathSync(source)!==source)fail('source_symlink_forbidden');
  if(source===target||source.startsWith(root+path.sep))fail('source_must_not_be_public');
  isRegularPrivate(source,MAX_INPUT_BYTES);
  isRegularPrivate(approvalFile,MAX_APPROVAL_BYTES);
  const approvalBytes=fs.readFileSync(approvalFile);
  const signatureBytes=fs.readFileSync(signatureFile);
  const verifyKey=fs.readFileSync(verifyKeyFile,'utf8');
  const authority=verifyPublicationApproval({approvalBytes,signatureBytes,verifyKey,sourcePath:source,targetPath:target,now});
  const sourceBytes=fs.readFileSync(source);
  let privateSafePulse;
  try{privateSafePulse=JSON.parse(sourceBytes.toString('utf8'))}catch{fail('safe_pulse_json_invalid')}
  const projection=projectPublicKaidancePulse(privateSafePulse,{now});
  const assessed=assessPublicPulse(projection,now.getTime());
  if(!assessed.ok||!assessed.sourceFresh)fail('private_safe_pulse_missing_or_stale');
  // Refuse cycle rollback and recycled observations. Recovered/reset Collider lineage
  // requires separate operator-authorized reconciliation, never a silent public replay.
  if(fs.existsSync(target)){
    let previous;
    try{previous=JSON.parse(fs.readFileSync(target,'utf8'))}catch{fail('existing_public_pulse_invalid')}
    const prior=assessPublicPulse(previous,now.getTime());
    if(!prior.ok)fail('existing_public_pulse_invalid');
    if(projection.cycle_number<prior.cycle_number)fail('public_cycle_regression_forbidden');
    if(Date.parse(projection.observed_at)<=prior.observed_at)fail('public_observation_replay_forbidden');
    if(now.getTime()<=prior.published_at)fail('publisher_clock_regression_forbidden');
  }
  // A degraded/unattested pulse may be published, but it is never called verified.
  const publishedBytes=Buffer.from(JSON.stringify(projection,null,2)+'\n','utf8');
  const publicHash=sha256(publishedBytes);
  const sourceHash=sha256(sourceBytes);
  const nonce=crypto.randomBytes(10).toString('hex');
  const temp=target+'.'+nonce+'.tmp';
  const receiptFile=path.join(receipts,'kaidance-public-'+nonce+'.json');
  // Staging with exclusive create and a confined destination. No new public API, no scheduler.
  try{
    fs.writeFileSync(temp,publishedBytes,{flag:'wx',mode:0o644});
    if(sha256(fs.readFileSync(temp))!==publicHash)fail('public_staging_readback_mismatch');
    fs.renameSync(temp,target);
    if(sha256(fs.readFileSync(target))!==publicHash)fail('public_local_readback_mismatch');
  }finally{try{fs.rmSync(temp,{force:true})}catch{}}
  const receipt={
    schema:'evercraft.leiland.owned-pulse-publication-receipt.v1',
    state:'local_file_readback_verified_only',
    authority_ref:authority.approval_ref,
    observed_at:projection.observed_at,
    published_at:projection.published_at,
    source_sha256:sourceHash,
    public_sha256:publicHash,
    source_attested:assessed.verified,
    cycle_number:projection.cycle_number,
    public_release_verified:false,
    external_https_verified:false
  };
  fs.writeFileSync(receiptFile,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
  // Never log credentials, private source paths, node addresses, or approval material.
  return receipt;
}
function argsMap(argv){
  const valid=new Set(['--input','--owned-public-root','--approval','--signature','--verify-key','--receipt-dir']);
  if(argv.length!==12)fail('usage_invalid');
  const data={};
  for(let i=0;i<argv.length;i+=2){
    const key=argv[i],value=argv[i+1];
    if(!valid.has(key)||key in data||!value)fail('usage_invalid');
    data[key]=value;
  }
  if(Object.keys(data).length!==valid.size)fail('usage_invalid');
  return data;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const a=argsMap(process.argv.slice(2));
    const receipt=publishOwnedKaidancePulse({
      sourceFile:a['--input'],ownedPublicRoot:a['--owned-public-root'],
      approvalFile:a['--approval'],signatureFile:a['--signature'],
      verifyKeyFile:a['--verify-key'],receiptDir:a['--receipt-dir']});
    console.log(JSON.stringify(receipt));
  }catch(error){console.error('LEILAND_PUBLICATION_HELD:',error.message);process.exitCode=1}
}
