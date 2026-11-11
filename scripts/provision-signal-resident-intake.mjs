#!/usr/bin/env node
// Converge private, persistent Signal intake on the owned Fabric resident.
// No network, customer request, checkout or payment operation is performed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const RESIDENT_SIGNAL_DIR='/var/lib/evercraft/signal-intake';
export const RESIDENT_SIGNAL_KEY=RESIDENT_SIGNAL_DIR+'/key.b64';
export const RESIDENT_SIGNAL_LEADS=RESIDENT_SIGNAL_DIR+'/leads';

function assertDirectory(folder,uid,gid){
  if(fs.existsSync(folder)){
    const stat=fs.lstatSync(folder);
    if(!stat.isDirectory()||stat.isSymbolicLink())
      throw Error('signal_private_path_not_directory');
    if(stat.uid!==uid||stat.gid!==gid)
      throw Error('signal_private_owner_mismatch');
    if((stat.mode&0o077)!==0)throw Error('signal_private_permissions_insecure');
    return false;
  }
  fs.mkdirSync(folder,{mode:0o700});
  if(fs.getuid?.()===0)fs.chownSync(folder,uid,gid);
  const stat=fs.lstatSync(folder);
  if(stat.uid!==uid||stat.gid!==gid||(stat.mode&0o077)!==0)
    throw Error('signal_private_directory_not_secure');
  return true;
}
function validateKey(keyPath,uid){
  const stat=fs.lstatSync(keyPath);
  if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||stat.uid!==uid)
    throw Error('signal_intake_key_file_insecure');
  const text=fs.readFileSync(keyPath,'utf8').trim();
  const bytes=Buffer.from(text,'base64');
  if(bytes.length!==32||bytes.toString('base64')!==text)throw Error('signal_intake_key_invalid');
}
export function provisionSignalResidentIntake({
  directory=RESIDENT_SIGNAL_DIR,uid=os.userInfo().uid,gid=os.userInfo().gid,
  externalKeyConfigured=false
}={}){
  if(!Number.isInteger(uid)||uid<0||!Number.isInteger(gid)||gid<0)
    throw Error('signal_runtime_identity_invalid');
  // Production CLI uses the fixed path, not an operator-supplied arbitrary path.
  // Existing directories and secrets are never replaced or silently chowned.
  if(!fs.existsSync(path.dirname(directory)))throw Error('evercraft_state_parent_missing');
  assertDirectory(directory,uid,gid);
  const leads=path.join(directory,'leads'),outbox=path.join(leads,'alert-outbox'),
    receipts=path.join(leads,'alert-receipts'),key=path.join(directory,'key.b64');
  assertDirectory(leads,uid,gid);
  assertDirectory(outbox,uid,gid);
  assertDirectory(receipts,uid,gid);
  const oldRecords=fs.readdirSync(leads).some(x=>/^ECS-[A-F0-9]{24}\.enc$/.test(x));
  let keyState='preserved';
  if(fs.existsSync(key)){
    validateKey(key,uid);
  }else if(externalKeyConfigured){
    keyState='external_key_preserved';
  }else{
    if(oldRecords)throw Error('signal_encrypted_records_without_key_hold');
    const value=crypto.randomBytes(32).toString('base64')+'\n';
    const fd=fs.openSync(key,'wx',0o600);
    try{
      if(fs.getuid?.()===0)fs.fchownSync(fd,uid,gid);
      fs.fchmodSync(fd,0o600);
      fs.writeFileSync(fd,value);
      fs.fsyncSync(fd);
    }finally{fs.closeSync(fd)}
    validateKey(key,uid);
    keyState='created_once';
  }
  return Object.freeze({
    schema:'evercraft.signal.resident-intake-provision.v1',
    state:'private_intake_storage_prepared',
    key_state:keyState,secret_exposed:false,
    customer_records_modified:0,orders_created:0,payments_attempted:0,
    service_restart_required:keyState==='created_once',
    private_store_present:true
  });
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  try{
    if(process.getuid?.()!==0)throw Error('root_required_for_owned_resident_bootstrap');
    const uidArg=process.argv.indexOf('--uid'),gidArg=process.argv.indexOf('--gid');
    const uid=uidArg<0?NaN:Number(process.argv[uidArg+1]);
    const gid=gidArg<0?NaN:Number(process.argv[gidArg+1]);
    const externalKeyConfigured=process.argv.includes('--external-key');
    const result=provisionSignalResidentIntake({uid,gid,externalKeyConfigured});
    process.stdout.write(JSON.stringify(result)+'\n');
  }catch(error){
    console.error('SIGNAL_RESIDENT_INTAKE_HOLD '+String(error?.message||error));
    process.exitCode=1;
  }
}
