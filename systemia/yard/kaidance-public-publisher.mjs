#!/usr/bin/env node
// Owner-operated, read-only Yard → KAIDANCE public pulse projection.
// This never binds an HTTP listener, installs a timer, or grants publication authority.
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {YardOperator} from './operator.mjs';
import {projectPublicKaidancePulse} from '../collider/public-projection.mjs';
import {assessPublicPulse} from '../../public/kaidance/pulse-source.mjs';

const POLICY_SCHEMA='evercraft.kaidance.public-publish-policy.v1';
const DAY_MS=86400000;
const MAX_POLICY_DAYS=30;

function strictDate(input){
  if(typeof input!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(input))return NaN;
  return Date.parse(input);
}
function safeStat(file){
  const stat=fs.lstatSync(file);
  if(stat.isSymbolicLink()||!stat.isFile())throw Error('publication_policy_not_regular_file');
  if((stat.mode&0o077)!==0)throw Error('publication_policy_permissions_too_broad');
  if(typeof process.getuid==='function' && stat.uid!==process.getuid() && stat.uid!==0){
    throw Error('publication_policy_owner_mismatch');
  }
  return stat;
}
export function readApprovedKaidancePolicy(policyFile,{deploymentId,publicRoot,now=new Date()}={}){
  if(!path.isAbsolute(policyFile)||!path.isAbsolute(publicRoot)||!deploymentId)throw Error('publication_configuration_invalid');
  safeStat(policyFile);
  const policy=JSON.parse(fs.readFileSync(policyFile,'utf8'));
  if(policy?.schema!==POLICY_SCHEMA||policy.enabled!==true)throw Error('public_publishing_not_approved');
  if(policy.deployment_id!==deploymentId)throw Error('public_publishing_deployment_mismatch');
  if(policy.public_root!==publicRoot)throw Error('public_publishing_root_mismatch');
  if(!/^approved:[a-z0-9][a-z0-9:._-]{5,100}$/i.test(policy.operator_approval_ref||'')){
    throw Error('publication_approval_reference_invalid');
  }
  const approved=strictDate(policy.approved_at),expires=strictDate(policy.expires_at);
  const clock=now.getTime();
  if(!Number.isFinite(approved)||!Number.isFinite(expires)||!Number.isFinite(clock)||
    approved>clock+60000||expires<=clock||expires<=approved||expires-approved>MAX_POLICY_DAYS*DAY_MS){
    throw Error('publication_approval_expired_or_invalid');
  }
  // The policy is an owner-maintained operating control, not a cryptographic approval.
  // Filesystem privilege and the owner-controlled service account are part of the boundary.
  return Object.freeze({deploymentId,publicRoot,approvalRef:policy.operator_approval_ref,expiresAt:policy.expires_at});
}
function safePublicTarget(publicRoot){
  const root=path.resolve(publicRoot);
  const rootInfo=fs.lstatSync(root);
  if(rootInfo.isSymbolicLink()||!rootInfo.isDirectory())throw Error('public_root_invalid');
  const folder=path.join(root,'kaidance');
  if(!fs.existsSync(folder))fs.mkdirSync(folder,{mode:0o755});
  const folderInfo=fs.lstatSync(folder);
  if(folderInfo.isSymbolicLink()||!folderInfo.isDirectory())throw Error('public_pulse_directory_invalid');
  const output=path.join(folder,'pulse.json');
  if(fs.existsSync(output)){
    const st=fs.lstatSync(output);
    if(st.isSymbolicLink()||!st.isFile())throw Error('public_pulse_target_invalid');
  }
  return output;
}
function currentPublishedCycle(output){
  if(!fs.existsSync(output))return null;
  const stat=fs.statSync(output);
  if(stat.size>16384)throw Error('public_pulse_existing_invalid');
  const data=JSON.parse(fs.readFileSync(output,'utf8'));
  if(data?.schema!=='evercraft.kaidance.public-pulse.v1'||
    !Number.isSafeInteger(data.cycle_number)||
    (data.last_completed_cycle!==null&&typeof data.last_completed_cycle!=='string')){
    throw Error('public_pulse_existing_invalid');
  }
  return {number:data.cycle_number,lastCompleted:data.last_completed_cycle};
}
function replaceAtomically(target,bytes){
  const tmp=target+'.'+process.pid+'.'+randomBytes(6).toString('hex')+'.tmp';
  try{
    fs.writeFileSync(tmp,bytes,{encoding:'utf8',mode:0o644,flag:'wx'});
    fs.renameSync(tmp,target);
  }finally{
    try{fs.unlinkSync(tmp)}catch(error){if(error.code!=='ENOENT')throw error}
  }
}
export async function publishKaidanceOnce({
  policyFile,publicRoot,deploymentId,now=new Date(),getPulse,
}={}){
  // Fail before reading a private pulse if there is no local, restricted, unexpired approval.
  const policy=readApprovedKaidancePolicy(policyFile,{deploymentId,publicRoot,now});
  const target=safePublicTarget(publicRoot);
  if(typeof getPulse!=='function')throw Error('authenticated_kaidance_source_required');
  const pulse=await getPulse(deploymentId);
  if(pulse?.resident!==true)throw Error('kaidance_not_resident');
  const exported=projectPublicKaidancePulse(pulse,{now});
  const assessed=assessPublicPulse(exported,now.getTime());
  if(!assessed.ok||!assessed.sourceFresh||!assessed.cycleFresh||
    exported.state!=='healthy'||exported.coverage_receipt_valid!==true){
    throw Error('kaidance_current_cycle_not_publishable');
  }
  const previous=currentPublishedCycle(target);
  if(previous&&(exported.cycle_number<previous.number||
    (exported.cycle_number===previous.number&&exported.last_completed_cycle!==previous.lastCompleted))){
    throw Error('kaidance_cycle_regression_detected');
  }
  const bytes=JSON.stringify(exported,null,2)+'\n';
  replaceAtomically(target,bytes);
  return {
    schema:'evercraft.kaidance.public-publish-receipt.v1',
    state:'published',
    cycle_number:exported.cycle_number,
    field_attestation_verified:exported.field_attestation_verified,
    published_at:exported.published_at,
    content_sha256:createHash('sha256').update(bytes).digest('hex'),
    approval_ref:policy.approvalRef,
  };
}
function arg(name){const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1]||null;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const stateDir=arg('--state-dir'),deploymentId=arg('--deployment-id'),policyFile=arg('--policy-file'),publicRoot=arg('--public-root');
  if(!stateDir||!deploymentId||!policyFile||!publicRoot){
    console.error('usage: node systemia/yard/kaidance-public-publisher.mjs --state-dir /private/yard --deployment-id <id> --policy-file /private/approved-policy.json --public-root /owned/web-root');
    process.exitCode=2;
  }else{
    try{
      const yard=new YardOperator({stateDir:path.resolve(stateDir)});
      const result=await publishKaidanceOnce({
        policyFile,publicRoot,deploymentId,
        getPulse:(id)=>yard.getKaidancePulse(id),
      });
      console.log(JSON.stringify(result));
    }catch{
      // Do not print private Yard paths, capacity routes, tokens, or vendor responses.
      console.error('KAIDANCE public publication HELD. See private operator diagnostics.');
      process.exitCode=1;
    }
  }
}
