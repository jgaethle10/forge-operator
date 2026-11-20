#!/usr/bin/env node
// One-way private KAIDANCE snapshot from the already verified Yard route.
// This writes ONLY a mode-0600 private input for the Ed25519-approved
// Leiland public publisher. It never contacts a public host or opens ports.
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {assertPulsePrivacy} from './pulse.mjs';
import {verifyPrivatePulseForPublication} from './public-publisher.mjs';

const TARGET='kaidance-safe-pulse.json';
const MAX_BYTES=32768;
function privateDir(dir){
 if(typeof dir!=='string'||!path.isAbsolute(dir))throw Error('private_root_absolute_required');
 const stat=fs.lstatSync(dir);
 if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw Error('private_root_permissions_invalid');
 if(typeof process.getuid==='function'&&stat.uid!==process.getuid())throw Error('private_root_owner_invalid');
 const real=fs.realpathSync(dir);
 if(real!==path.resolve(dir))throw Error('private_root_alias_forbidden');
 return real;
}
function readExisting(file){
 if(!fs.existsSync(file))return null;
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw Error('private_snapshot_permissions_invalid');
 if(typeof process.getuid==='function'&&stat.uid!==process.getuid())throw Error('private_snapshot_owner_invalid');
 if(stat.size<=0||stat.size>MAX_BYTES)throw Error('private_snapshot_size_invalid');
 const old=JSON.parse(fs.readFileSync(file,'utf8'));
 if(old.schema!=='evercraft.kaidance.pulse.v1')throw Error('prior_private_snapshot_invalid');
 return old;
}
export async function capturePrivateKaidancePulse({privateRoot,deploymentId,getPulse,now=new Date()}={}){
 if(typeof getPulse!=='function')throw Error('authenticated_yard_reader_required');
 if(typeof deploymentId!=='string'||!deploymentId.trim())throw Error('deployment_id_required');
 const root=privateDir(privateRoot);
 const target=path.join(root,TARGET);
 const pulse=await getPulse(deploymentId);
 verifyPrivatePulseForPublication(pulse,{now});
 assertPulsePrivacy(pulse);
 const previous=readExisting(target);
 if(previous){
  if(pulse.cycle_number<previous.cycle_number)throw Error('private_cycle_rollback');
  if(Date.parse(pulse.observed_at)<=Date.parse(previous.observed_at))throw Error('private_observation_replay');
 }
 const body=JSON.stringify(pulse,null,2)+'\n';
 if(Buffer.byteLength(body)>MAX_BYTES)throw Error('private_snapshot_too_large');
 const temp=path.join(root,'.kaidance-safe-pulse.'+process.pid+'.'+randomBytes(8).toString('hex')+'.tmp');
 let fd;
 try{
  fd=fs.openSync(temp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|(fs.constants.O_NOFOLLOW||0),0o600);
  fs.writeFileSync(fd,body);
  fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
  fs.renameSync(temp,target);
 }finally{
  if(fd!==undefined)fs.closeSync(fd);
  if(fs.existsSync(temp))fs.unlinkSync(temp);
 }
 return {schema:'evercraft.kaidance.private-snapshot-stage.v1',state:'private_only',
  cycle_number:pulse.cycle_number,observed_at:pulse.observed_at,
  public_release_verified:false,external_https_verified:false};
}
function flag(name){const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1]||null;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=flag('--private-root'),stateDir=flag('--yard-state-dir'),id=flag('--deployment-id');
 if(!root||!stateDir||!id){
  console.error('usage: node systemia/collider/private-safe-pulse-snapshot.mjs --private-root /owned/private/0700 --yard-state-dir /actual/private/yard --deployment-id ACTUAL_ID');
  process.exitCode=2;
 }else{
  try{
   if(!path.isAbsolute(stateDir))throw Error('yard_state_absolute_required');
   const stat=fs.lstatSync(stateDir);
   if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('yard_state_directory_invalid');
   const yardRoot=fs.realpathSync(stateDir);
   const privateSnapshotRoot=privateDir(root);
   if(yardRoot===privateSnapshotRoot)throw Error('source_and_snapshot_root_must_be_separate');
   const {YardOperator}=await import('../yard/operator.mjs');
   const yard=new YardOperator({stateDir:yardRoot});
   console.log(JSON.stringify(await capturePrivateKaidancePulse({
    privateRoot:root,deploymentId:id,getPulse:deployment=>yard.getKaidancePulse(deployment)
   })));
  }catch(error){console.error('KAIDANCE_PRIVATE_SNAPSHOT_HELD:',String(error?.message||error).replace(/[\r\n]/g,' '));process.exitCode=1}
 }
}
