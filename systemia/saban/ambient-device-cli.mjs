#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AmbientDeviceRegistry } from './ambient-device-registry.mjs';

const MODULE_FILE=fileURLToPath(import.meta.url);
const arg=(name,fallback='')=>{
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
};
const cmd=process.argv[2]||'list';
const root=path.resolve(
  arg('--root',process.env.SABAN_AMBIENT_STATE_DIR||path.join(os.homedir(),'.local/state/evercraft/saban-ambient'))
);
const registry=new AmbientDeviceRegistry({root:path.join(root,'registry')});

function required(name){
  const value=String(arg(name,'')).trim();
  if(!value) throw new Error(name.replace(/^--/,'')+'_required');
  return value;
}
function readJson(file){
  if(!fs.existsSync(file)) throw new Error('file_not_found:'+file);
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function safeId(value){
  const id=String(value||'').trim().replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,160);
  if(!id) throw new Error('device_id_required');
  return id;
}
function credentialFile(deviceId){
  return path.join(root,'.secrets','device-tokens',safeId(deviceId)+'.token');
}
function writeSecretAtomic(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,value.endsWith('\n')?value:value+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
  fs.chmodSync(file,0o600);
}

if(cmd==='list'){
  console.log(JSON.stringify(registry.list({now:new Date()}),null,2));
}else if(cmd==='candidate'){
  const deviceId=required('--device');
  const manifest=readJson(path.resolve(required('--manifest')));
  if(String(manifest.device_id||'')!==deviceId) throw new Error('manifest_device_id_mismatch');
  console.log(JSON.stringify(registry.candidate({device_id:deviceId,manifest}),null,2));
}else if(cmd==='authorize'){
  const deviceId=required('--device');
  const approvalRef=required('--approval-ref');
  const expiresAt=required('--expires-at');
  console.log(JSON.stringify(registry.authorize({
    device_id:deviceId,
    approval_ref:approvalRef,
    expires_at:expiresAt,
    heartbeat_target_seconds:Number(arg('--heartbeat-seconds','300')),
    attestation_mode:arg('--attestation-mode','gateway_bound'),
    attestation_identity:arg('--attestation-identity',''),
    authorized_at:new Date().toISOString(),
  }),null,2));
}else if(cmd==='heartbeat'){
  const deviceId=required('--device');
  const manifest=registry.manifest(deviceId);
  if(!manifest?.manifest_hash) throw new Error('device_manifest_missing');
  console.log(JSON.stringify(registry.heartbeat({
    device_id:deviceId,
    capability_manifest_hash:manifest.manifest_hash,
    attestation_identity:arg('--attestation-identity',''),
    observed_at:new Date().toISOString(),
  }),null,2));
}else if(cmd==='revoke'){
  const deviceId=required('--device');
  const approvalRef=required('--approval-ref');
  console.log(JSON.stringify(registry.revoke({
    device_id:deviceId,
    approval_ref:approvalRef,
    reason:arg('--reason','operator_revoked'),
    revoked_at:new Date().toISOString(),
  }),null,2));
}else if(cmd==='credential-set'){
  const deviceId=required('--device');
  const record=registry.get(deviceId);
  if(!record) throw new Error('ambient_registry_device_unknown');
  if(!['authorized','active','degraded'].includes(record.state)){
    throw new Error('device_must_be_authorized_before_credential');
  }
  const source=path.resolve(required('--token-file'));
  if(!fs.existsSync(source)) throw new Error('credential_source_file_missing');
  const token=fs.readFileSync(source,'utf8').trim();
  if(!token) throw new Error('credential_source_file_empty');
  if(Buffer.byteLength(token)>4096) throw new Error('credential_too_large');
  const dest=credentialFile(deviceId);
  writeSecretAtomic(dest,token);
  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.saban.device-credential-write.v1',
    device_id:deviceId,
    credential_present:true,
    credential_value_exposed:false,
    destination:path.relative(root,dest),
  },null,2));
}else if(cmd==='credential-delete'){
  const deviceId=required('--device');
  const dest=credentialFile(deviceId);
  const existed=fs.existsSync(dest);
  if(existed) fs.rmSync(dest,{force:true});
  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.saban.device-credential-delete.v1',
    device_id:deviceId,
    credential_removed:existed,
    credential_value_exposed:false,
  },null,2));
}else{
  throw new Error('unsupported_command:'+cmd);
}
