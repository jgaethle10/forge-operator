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
}else{
  throw new Error('unsupported_command:'+cmd);
}
