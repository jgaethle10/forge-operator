#!/usr/bin/env node
// Root-owned Evercraft Fabric resident reconciliation for FAIE's durable archive.
// No customer data, private coordinates, existing archives, or custom paths
// are moved or overwritten. A missing/unsafe environment fails closed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const KEY='FAIE_EDGE_STATE_DIR';
const REQUIRED_DIR='/var/lib/evercraft/faie';
const FABRIC_ENV='/etc/evercraft/fabric.env';

function ancestorsAreRealDirectories(target){
  const absolute=path.resolve(target);
  let current=path.parse(absolute).root;
  for(const segment of absolute.slice(current.length).split(path.sep).filter(Boolean)){
    current=path.join(current,segment);
    if(!fs.existsSync(current))continue;
    const info=fs.lstatSync(current);
    if(info.isSymbolicLink()||!info.isDirectory())throw Error('faie_storage_unsafe_path_component');
  }
}
function verifyStateDirectory(dir,uid){
  if(!path.isAbsolute(dir)||dir===path.parse(dir).root)throw Error('faie_state_root_not_absolute');
  ancestorsAreRealDirectories(dir);
  const info=fs.lstatSync(dir);
  if(!info.isDirectory()||info.isSymbolicLink())throw Error('faie_storage_not_plain_directory');
  if(info.uid!==uid||(info.mode&0o700)!==0o700)throw Error('faie_state_owner_or_access_unverified');
}
export function reconcileFaieOwnedHistory({
  envPath=FABRIC_ENV,stateDir=REQUIRED_DIR,
  uid=process.getuid?.(),gid=process.getgid?.(),apply=false
}={}){
  if(!Number.isInteger(uid)||uid<0||!Number.isInteger(gid)||gid<0)
    throw Error('faie_runtime_identity_required');
  if(!path.isAbsolute(envPath)||!path.isAbsolute(stateDir))
    throw Error('faie_absolute_paths_required');
  ancestorsAreRealDirectories(path.dirname(envPath));
  if(!fs.existsSync(envPath)||fs.lstatSync(envPath).isSymbolicLink()||
     !fs.lstatSync(envPath).isFile())throw Error('faie_existing_fabric_env_required');
  const existing=fs.readFileSync(envPath,'utf8');
  const lines=existing.split(/\r?\n/);
  const configured=lines.filter(line=>line.startsWith(KEY+'='));
  if(configured.length>1)throw Error('faie_state_env_duplicate_key');
  const prior=configured.length?configured[0].slice(KEY.length+1).trim():'';
  if(prior){
    verifyStateDirectory(prior,uid);
    return {
      schema:'evercraft.faie.owned-history-reconciliation.v1',
      state:'existing_owned_location_preserved',environment_updated:false,
      directory_created:false,root_is_owner_managed:true
    };
  }
  if(stateDir!==REQUIRED_DIR && envPath===FABRIC_ENV)
    throw Error('faie_production_state_root_not_canonical');
  // A new record root is needed only if the operator has not configured one.
  ancestorsAreRealDirectories(stateDir);
  const previouslyPresent=fs.existsSync(stateDir);
  if(previouslyPresent)verifyStateDirectory(stateDir,uid);
  if(!apply)return {
    schema:'evercraft.faie.owned-history-reconciliation.v1',
    state:'provision_required',environment_updated:false,directory_created:false,
    root_is_owner_managed:previouslyPresent
  };
  const parent=path.dirname(stateDir);
  if(!fs.existsSync(parent))fs.mkdirSync(parent,{recursive:true,mode:0o755});
  ancestorsAreRealDirectories(parent);
  if(!previouslyPresent){
    fs.mkdirSync(stateDir,{mode:0o700});
    if(fs.statSync(stateDir).uid!==uid||fs.statSync(stateDir).gid!==gid)
      fs.chownSync(stateDir,uid,gid);
  }
  verifyStateDirectory(stateDir,uid);
  const revised=configured.length
    ? lines.map(line=>line.startsWith(KEY+'=')?KEY+'='+stateDir:line).join('\n')
    : existing.replace(/\s*$/,'\n')+KEY+'='+stateDir+'\n';
  const tmp=path.join(path.dirname(envPath),'.fabric-env-faie-'+crypto.randomUUID());
  const before=fs.statSync(envPath);
  try{
    const fd=fs.openSync(tmp,fs.constants.O_CREAT|fs.constants.O_EXCL|
      fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
    try{
      fs.writeFileSync(fd,revised,{encoding:'utf8'});
      fs.fchmodSync(fd,0o600);
      if(before.uid!==process.getuid?.()||before.gid!==process.getgid?.())
        fs.fchownSync(fd,before.uid,before.gid);
      fs.fsyncSync(fd);
    }finally{fs.closeSync(fd);}
    fs.renameSync(tmp,envPath);
  }finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
  return {
    schema:'evercraft.faie.owned-history-reconciliation.v1',
    state:'durable_history_state_configured',environment_updated:true,
    directory_created:!previouslyPresent,root_is_owner_managed:true
  };
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  try{
    const args=process.argv.slice(2);
    const required=['--uid','--gid','--apply','--confirm-owned-host'];
    if(process.getuid?.()!==0||args.length!==6||!required.every(flag=>args.includes(flag)))
      throw Error('faie_root_operator_approval_required');
    const uidArg=args.indexOf('--uid'),gidArg=args.indexOf('--gid');
    const uid=Number(args[uidArg+1]),gid=Number(args[gidArg+1]);
    if(!Number.isSafeInteger(uid)||!Number.isSafeInteger(gid)||uid<=0||gid<=0)
      throw Error('faie_nonroot_resident_identity_required');
    const receipt=reconcileFaieOwnedHistory({uid,gid,apply:true});
    process.stdout.write(JSON.stringify(receipt)+'\n');
  }catch(error){
    process.stderr.write('HOLD: '+String(error?.message||error)+'\n');
    process.exitCode=1;
  }
}
