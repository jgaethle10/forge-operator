#!/usr/bin/env node
// Refresh Evercraft Home's source revision WITHOUT erasing owner identity,
// sealed credentials, or verified provider configuration. No secret logging.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const SHA=/^[a-f0-9]{40}$/i;
const required=new Set([
  'EVERCRAFT_HOME_AUTH',
  'EVERCRAFT_IDENTITY_SECRET',
  'EVERCRAFT_IDENTITY_STATE_DIR',
  'EVERCRAFT_PASSPORT_STATE_DIR',
  'EVERCRAFT_CREDENTIAL_STATE_DIR',
  'EVERCRAFT_CLIP_JOURNAL_STATE_DIR',
  'EVERCRAFT_HOME_RELEASE_REF',
]);

export function refreshHomeSourceRelease({file,releaseRef}={}){
  if(!SHA.test(String(releaseRef||'')))throw Error('home_env_release_ref_invalid');
  if(!file)throw Error('home_env_path_required');
  const filename=path.resolve(file);
  const state=fs.lstatSync(filename);
  if(!state.isFile()||state.isSymbolicLink())throw Error('home_env_file_untrusted');
  if((state.mode&0o077)!==0)throw Error('home_env_permissions_insecure');
  const original=fs.readFileSync(filename,'utf8');
  const counts=new Map();
  for(const line of original.split('\n')){
    if(!line||line.trimStart().startsWith('#'))continue;
    const match=/^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if(!match)throw Error('home_env_line_invalid');
    const key=match[1];
    counts.set(key,(counts.get(key)||0)+1);
    if(counts.get(key)>1)throw Error('home_env_duplicate_key');
    if(required.has(key)&&!match[2].trim())throw Error('home_env_required_value_empty');
  }
  for(const name of required)if(counts.get(name)!==1)throw Error('home_env_required_key_missing');
  if(!/^EVERCRAFT_HOME_AUTH=passport$/m.test(original))throw Error('home_env_passport_required');
  const updated=original.replace(/^EVERCRAFT_HOME_RELEASE_REF=[^\r\n]*$/m,
    'EVERCRAFT_HOME_RELEASE_REF='+releaseRef.toLowerCase());
  if(updated===original)return {state:'unchanged',release_ref:releaseRef.toLowerCase(),private_settings_preserved:true};
  const temporary=path.join(path.dirname(filename),'.'+path.basename(filename)+
    '.release-'+crypto.randomBytes(8).toString('hex'));
  let created=false;
  try{
    const fd=fs.openSync(temporary,'wx',0o600);
    created=true;
    try{
      fs.writeFileSync(fd,updated,'utf8');
      fs.fchmodSync(fd,0o600);
      fs.fchownSync(fd,state.uid,state.gid);
      fs.fsyncSync(fd);
    }finally{fs.closeSync(fd);}
    fs.renameSync(temporary,filename);
  }finally{if(created)try{fs.unlinkSync(temporary);}catch{}}
  return {state:'release_ref_updated',release_ref:releaseRef.toLowerCase(),private_settings_preserved:true};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const result=refreshHomeSourceRelease({file:process.argv[2],releaseRef:process.argv[3]});
    process.stdout.write(JSON.stringify(result)+'\n');
  }catch(error){
    // Do not print the env content or the raw provider error.
    process.stderr.write('home_env_reconcile_hold:'+String(error?.message||'unknown')+'\n');
    process.exitCode=1;
  }
}
