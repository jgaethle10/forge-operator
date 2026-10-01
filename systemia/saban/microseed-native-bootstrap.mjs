#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { createMicroSeedDeviceIdentity } from './microseed-device-identity.mjs';
import { normalizeMicroDeviceManifest } from './microseed-device-bridge.mjs';

const MODULE_FILE=fileURLToPath(import.meta.url);
const arg=(name,fallback='')=>{
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
};
const has=name=>process.argv.includes(name);
const csv=v=>String(v||'').split(',').map(x=>x.trim()).filter(Boolean);

function atomicWrite(file,content,mode=0o600){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,content,{mode});
  fs.renameSync(tmp,file);
  fs.chmodSync(file,mode);
}
function atomicJson(file,value,mode=0o600){
  atomicWrite(file,JSON.stringify(value,null,2)+'\n',mode);
}

export function bootstrapNativeMicroSeed({
  root,
  device_id,
  device_class='linux-host',
  authorization_ref,
  endpoint,
  supported_workloads=['systemia.health-probe.v1','systemia.content-hash.v1','systemia.telemetry-normalizer.v1','systemia.chunk-transform.v1'],
  resources={},
  placement_labels=[],
  max_concurrency=2,
  duty_cycle='always_on',
  cpu_utilization_ceiling=0.60,
  memory_reserve_mb=256,
  temperature_ceiling_c=null,
  battery_floor_percent=null,
  require_external_power=false,
  network_utilization_ceiling=0.70,
  rotate_identity=false,
  now=new Date(),
}={}){
  if(!root) throw new Error('microseed_bootstrap_root_required');
  if(!device_id) throw new Error('microseed_bootstrap_device_id_required');
  if(!authorization_ref) throw new Error('microseed_bootstrap_authorization_ref_required');
  if(!endpoint) throw new Error('microseed_bootstrap_endpoint_required');

  const base=path.resolve(root);
  fs.mkdirSync(base,{recursive:true,mode:0o700});
  const identityDir=path.join(base,'identity');
  const stateDir=path.join(base,'state');
  const secretsDir=path.join(base,'secrets');
  fs.mkdirSync(stateDir,{recursive:true,mode:0o700});
  fs.mkdirSync(secretsDir,{recursive:true,mode:0o700});

  const identity=createMicroSeedDeviceIdentity({
    root:identityDir,
    device_id,
    rotate:rotate_identity,
    now,
  });

  const tokenFile=path.join(secretsDir,'agent-token');
  if(!fs.existsSync(tokenFile)){
    atomicWrite(tokenFile,randomBytes(32).toString('hex')+'\n',0o600);
  }
  const manifest=normalizeMicroDeviceManifest({
    device_id,
    device_class,
    bridge_mode:'native_agent',
    authorization_ref,
    endpoint,
    supported_workloads,
    resources:{
      cpu_units:Math.max(0.05,Number(resources.cpu_units||Math.max(0.5,os.cpus().length*0.25))),
      memory_mb:Math.max(128,Number(resources.memory_mb||Math.floor(os.totalmem()/1024/1024*0.25))),
      storage_gb:Math.max(0,Number(resources.storage_gb||0)),
    },
    placement_labels,
    max_concurrency,
    duty_cycle,
    cpu_utilization_ceiling,
    memory_reserve_mb,
    temperature_ceiling_c,
    battery_floor_percent,
    require_external_power,
    network_utilization_ceiling,
    primary_function_priority:true,
    attestation:{
      mode:'device',
      device_identity:identity.public_key_fingerprint,
      ...identity.attestation_patch,
    },
    observed_at:(now instanceof Date?now:new Date(now)).toISOString(),
  });
  const manifestFile=path.join(base,'manifest.json');
  atomicJson(manifestFile,manifest,0o600);

  const receipt={
    schema:'evercraft.microseed.native-bootstrap-receipt.v1',
    device_id,
    device_class,
    manifest_file:manifestFile,
    identity_dir:identityDir,
    state_dir:stateDir,
    token_file:tokenFile,
    endpoint,
    supported_workloads:manifest.supported_workloads,
    public_key_fingerprint:identity.public_key_fingerprint,
    private_key_exposed:false,
    token_value_exposed:false,
    arbitrary_code_execution:false,
    commercial_capacity:false,
    owner_authorization_changed:false,
    bootstrap_at:(now instanceof Date?now:new Date(now)).toISOString(),
  };
  atomicJson(path.join(base,'bootstrap-receipt.json'),receipt,0o600);
  return receipt;
}

async function main(){
  const root=path.resolve(arg('--root',path.join(os.homedir(),'.local/state/evercraft/microseed')));
  const deviceId=arg('--device-id',os.hostname());
  const authorizationRef=arg('--authorization-ref','');
  const endpoint=arg('--endpoint','');
  const workloads=csv(arg('--workloads','systemia.health-probe.v1,systemia.content-hash.v1,systemia.telemetry-normalizer.v1,systemia.chunk-transform.v1'));
  const receipt=bootstrapNativeMicroSeed({
    root,
    device_id:deviceId,
    device_class:arg('--device-class','linux-host'),
    authorization_ref:authorizationRef,
    endpoint,
    supported_workloads:workloads,
    resources:{
      cpu_units:Number(arg('--cpu-units','0'))||undefined,
      memory_mb:Number(arg('--memory-mb','0'))||undefined,
      storage_gb:Number(arg('--storage-gb','0'))||0,
    },
    placement_labels:csv(arg('--labels','owned,microseed')),
    max_concurrency:Number(arg('--max-concurrency','2')),
    duty_cycle:arg('--duty-cycle','always_on'),
    cpu_utilization_ceiling:Number(arg('--cpu-ceiling','0.60')),
    memory_reserve_mb:Number(arg('--memory-reserve-mb','256')),
    temperature_ceiling_c:arg('--temp-ceiling-c','')===''?null:Number(arg('--temp-ceiling-c')),
    battery_floor_percent:arg('--battery-floor','')===''?null:Number(arg('--battery-floor')),
    require_external_power:has('--require-external-power'),
    network_utilization_ceiling:Number(arg('--network-ceiling','0.70')),
    rotate_identity:has('--rotate-identity'),
    now:new Date(),
  });
  process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
}

if(process.argv[1]&&path.resolve(process.argv[1])===MODULE_FILE){
  main().catch(error=>{
    process.stderr.write(JSON.stringify({
      ok:false,
      schema:'evercraft.microseed.native-bootstrap-error.v1',
      error:error instanceof Error?error.message:String(error),
      private_key_exposed:false,
      token_value_exposed:false,
    })+'\n');
    process.exitCode=1;
  });
}
