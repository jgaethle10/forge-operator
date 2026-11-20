// Operator-authorized, read-only KAIDANCE pulse publisher.
// Public output is an allowlisted projection, never a raw Yard record.
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {projectPublicKaidancePulse} from './public-projection.mjs';

const APPROVAL_SCHEMA='evercraft.kaidance.public-publication-approval.v1';
const MAX_APPROVAL_DAYS=30;
const MAX_OBSERVATION_AGE_MS=120_000;
const MAX_CYCLE_GRACE_MS=90_000;
const RELATIVE_PULSE='kaidance/pulse.json';

function instant(value,label){
 if(typeof value!=='string')throw Error(label+'_missing');
 const parsed=Date.parse(value);
 if(!Number.isFinite(parsed))throw Error(label+'_invalid');
 return parsed;
}
function realDirectory(folder,label){
 const stat=fs.lstatSync(folder);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Error(label+'_not_real_directory');
 return fs.realpathSync(folder);
}
function privateApproval(file){
 if(!path.isAbsolute(file))throw Error('approval_path_must_be_absolute');
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink())throw Error('approval_not_regular_file');
 if((stat.mode&0o077)!==0)throw Error('approval_permissions_too_broad');
 if(typeof process.getuid==='function' && stat.uid!==process.getuid())throw Error('approval_owner_mismatch');
 return JSON.parse(fs.readFileSync(file,'utf8'));
}
export function validatePublicApproval(record,{approvalFile,publicRoot,deploymentId,now=new Date()}={}){
 if(!record||record.schema!==APPROVAL_SCHEMA||record.allow_publish!==true)throw Error('explicit_publication_approval_missing');
 if(typeof deploymentId!=='string'||!deploymentId.trim()||record.deployment_id!==deploymentId)throw Error('approval_deployment_mismatch');
 if(typeof record.approved_by!=='string'||record.approved_by.trim().length<3)throw Error('approval_operator_missing');
 if(!approvalFile||!path.isAbsolute(approvalFile))throw Error('approval_file_missing');
 if(!publicRoot||!path.isAbsolute(publicRoot))throw Error('public_root_missing');
 const root=realDirectory(publicRoot,'public_root');
 const approvedRoot=realDirectory(record.public_root,'approval_public_root');
 if(root!==approvedRoot)throw Error('approval_public_root_mismatch');
 const issued=instant(record.approved_at,'approval_time');
 const expiry=instant(record.expires_at,'expiry_time');
 const nowMs=now.getTime();
 if(!Number.isFinite(nowMs)||issued>nowMs+60_000||expiry<=nowMs||
    expiry<=issued||expiry-issued>MAX_APPROVAL_DAYS*86_400_000)throw Error('approval_outside_valid_window');
 const approvalReal=fs.realpathSync(approvalFile);
 if(approvalReal===root||approvalReal.startsWith(root+path.sep))throw Error('approval_inside_public_root');
 const outputDir=path.join(root,'kaidance');
 const realOutDir=realDirectory(outputDir,'public_subdirectory');
 if(realOutDir!==outputDir)throw Error('public_directory_alias_not_allowed');
 const output=path.join(outputDir,'pulse.json');
 if(fs.existsSync(output) && (!fs.lstatSync(output).isFile()||fs.lstatSync(output).isSymbolicLink()))throw Error('output_not_regular_file');
 return {root,output,expiresAt:expiry};
}
export function verifyPrivatePulseForPublication(pulse,{now=new Date()}={}){
 if(!pulse||pulse.schema!=='evercraft.kaidance.pulse.v1')throw Error('safe_pulse_required');
 if(pulse.resident!==true||pulse.state!=='healthy')throw Error('collider_not_resident_and_healthy');
 if(pulse.coverage_receipt_valid!==true)throw Error('coverage_receipt_unverified');
 if(pulse.field_attestation?.state!=='verified'||!pulse.field_attestation?.receipt)throw Error('field_attestation_not_verified');
 if(!Number.isSafeInteger(pulse.cycle_number)||pulse.cycle_number<1)throw Error('no_completed_cycle');
 const nowMs=now.getTime();
 const observed=instant(pulse.observed_at,'observation_time');
 const completed=instant(pulse.last_completed_cycle,'completed_cycle_time');
 const heartbeat=Number(pulse.heartbeat_target_seconds);
 if(!Number.isSafeInteger(heartbeat)||heartbeat!==300)throw Error('heartbeat_contract_unexpected');
 if(observed>nowMs+60_000||observed<nowMs-MAX_OBSERVATION_AGE_MS)throw Error('observation_stale');
 if(completed>nowMs+60_000||completed<nowMs-(heartbeat*1000+MAX_CYCLE_GRACE_MS))throw Error('cycle_stale');
 if(completed>observed+60_000)throw Error('cycle_after_observation');
 return projectPublicKaidancePulse(pulse,{now});
}
function atomicPublicWrite(output,object){
 const dir=path.dirname(output),name=path.basename(output);
 const temp=path.join(dir,'.'+name+'.'+process.pid+'.'+randomBytes(8).toString('hex')+'.tmp');
 const flags=fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW;
 let fd;
 try{
  fd=fs.openSync(temp,flags,0o644);
  fs.writeFileSync(fd,JSON.stringify(object)+'\n');
  fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
  if(fs.existsSync(output)&&(!fs.lstatSync(output).isFile()||fs.lstatSync(output).isSymbolicLink()))throw Error('output_changed_to_unsafe_type');
  fs.renameSync(temp,output);
 }finally{
  if(fd!==undefined)fs.closeSync(fd);
  if(fs.existsSync(temp))fs.unlinkSync(temp);
 }
}
export async function publishApprovedKaidancePulse({approvalFile,publicRoot,deploymentId,getPulse,now=new Date()}={}){
 if(typeof getPulse!=='function')throw Error('private_yard_pulse_reader_required');
 const approval=privateApproval(approvalFile);
 const validated=validatePublicApproval(approval,{approvalFile,publicRoot,deploymentId,now});
 const privatePulse=await getPulse(deploymentId);
 const publication=verifyPrivatePulseForPublication(privatePulse,{now});
 atomicPublicWrite(validated.output,publication);
 return {
   schema:'evercraft.kaidance.public-publisher-receipt.v1',
   status:'published',
   cycle_number:publication.cycle_number,
   published_at:publication.published_at,
   projection_sha256:createHash('sha256').update(JSON.stringify(publication)+'\n').digest('hex'),
   target:RELATIVE_PULSE,
   approval_expires_at:new Date(validated.expiresAt).toISOString()
 };
}
function option(name){
 const i=process.argv.indexOf(name);
 return i===-1?null:process.argv[i+1]||null;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const stateDir=option('--yard-state-dir'),deploymentId=option('--deployment-id');
 const approvalFile=option('--approval-file'),publicRoot=option('--public-root');
 if(!stateDir||!deploymentId||!approvalFile||!publicRoot){
  console.error('usage: node systemia/collider/public-publisher.mjs --yard-state-dir /private/yard --deployment-id <id> --approval-file /private/approval.json --public-root /owned-public-webroot');
  process.exitCode=2;
 }else{
  try{
   // Never import local Yard records into the public static directory.
   const publicReal=realDirectory(publicRoot,'public_root');
   const yardReal=realDirectory(stateDir,'yard_state');
   if(yardReal===publicReal||yardReal.startsWith(publicReal+path.sep))throw Error('yard_inside_public_root');
   const {YardOperator}=await import('../yard/operator.mjs');
   const yard=new YardOperator({stateDir:yardReal});
   const result=await publishApprovedKaidancePulse({
     approvalFile,publicRoot,deploymentId,getPulse:id=>yard.getKaidancePulse(id)
   });
   // Receipt has no private paths, deployment route, node identity or field key.
   console.log(JSON.stringify(result));
  }catch(error){
   console.error('KAIDANCE_PUBLICATION_HELD:',String(error?.message||error).replace(/[\r\n]/g,' '));
   process.exitCode=1;
  }
 }
}
