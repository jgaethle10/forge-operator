#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bootstrapNativeMicroSeed } from './microseed-native-bootstrap.mjs';
import { loadMicroSeedDeviceIdentity } from './microseed-device-identity.mjs';
import {
  parseMicroSeedPairingUri,
  createMicroSeedEnrollmentBundle,
} from './microseed-pairing.mjs';
import { submitMicroSeedEnrollmentBundle } from './microseed-enrollment-client.mjs';

const MODULE_FILE=fileURLToPath(import.meta.url);
const arg=(name,fallback='')=>{
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
};
const has=name=>process.argv.includes(name);
const clean=v=>String(v??'').trim();
const csv=v=>String(v||'').split(',').map(x=>x.trim()).filter(Boolean);

function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
  fs.chmodSync(file,0o600);
}
function pairingUri(){
  const file=arg('--pairing-uri-file','');
  if(file){
    const target=path.resolve(file);
    if(!fs.existsSync(target)) throw new Error('microseed_pairing_uri_file_missing');
    return fs.readFileSync(target,'utf8').trim();
  }
  const raw=arg('--pairing-uri','');
  if(raw) return raw;
  throw new Error('microseed_pairing_uri_required');
}

export function createDeviceEnrollmentFromPairing({
  pairing_uri,
  root,
  device_id,
  device_class='linux-host',
  endpoint,
  supported_workloads=[],
  resources={},
  placement_labels=['owned','microseed'],
  max_concurrency=2,
  duty_cycle='always_on',
  outFile='',
  now=new Date(),
}={}){
  const parsed=parseMicroSeedPairingUri(pairing_uri);
  const nowMs=now instanceof Date?now.getTime():Date.parse(String(now));
  const expiry=Date.parse(parsed.expires_at);
  if(!Number.isFinite(expiry)||nowMs>=expiry) throw new Error('microseed_pairing_ticket_expired');
  if(!root) throw new Error('microseed_pairing_device_root_required');
  if(!device_id) throw new Error('microseed_pairing_device_id_required');
  if(!endpoint) throw new Error('microseed_pairing_device_endpoint_required');

  const bootstrap=bootstrapNativeMicroSeed({
    root,
    device_id,
    device_class,
    authorization_ref:parsed.ticket_id,
    endpoint,
    supported_workloads,
    resources,
    placement_labels,
    max_concurrency,
    duty_cycle,
    now,
  });
  const manifest=JSON.parse(fs.readFileSync(bootstrap.manifest_file,'utf8'));
  const identity=loadMicroSeedDeviceIdentity({
    root:bootstrap.identity_dir,
    device_id,
  });
  const deviceToken=fs.readFileSync(bootstrap.token_file,'utf8').trim();

  const bundle=createMicroSeedEnrollmentBundle({
    manifest,
    privateKey:identity.private_key,
    ticket_id:parsed.ticket_id,
    pairing_secret:parsed.pairing_secret,
    device_token:deviceToken,
    now,
  });
  const destination=path.resolve(
    outFile||
    path.join(root,'enrollment',parsed.ticket_id+'.enrollment-bundle.json')
  );
  atomicJson(destination,bundle);

  return {
    schema:'evercraft.microseed.device-pairing-package.v1',
    ticket_id:parsed.ticket_id,
    device_id,
    device_class,
    endpoint,
    bundle_file:destination,
    bundle_file_mode:(fs.statSync(destination).mode&0o777).toString(8).padStart(4,'0'),
    manifest_hash:manifest.manifest_hash,
    public_key_fingerprint:identity.identity.public_key_fingerprint,
    supported_workloads:manifest.supported_workloads,
    private_key_exposed:false,
    device_token_exposed:false,
    pairing_secret_exposed:false,
    ready_for_enrollment:true,
    expires_at:parsed.expires_at,
  };
}

async function main(){
  const uri=pairingUri();
  const root=path.resolve(
    arg('--root',path.join(os.homedir(),'.local/state/evercraft/microseed'))
  );
  const receipt=createDeviceEnrollmentFromPairing({
    pairing_uri:uri,
    root,
    device_id:arg('--device-id',os.hostname()),
    device_class:arg('--device-class','linux-host'),
    endpoint:arg('--endpoint',''),
    supported_workloads:csv(arg('--workloads','systemia.health-probe.v1,systemia.content-hash.v1,systemia.telemetry-normalizer.v1,systemia.chunk-transform.v1')),
    resources:{
      cpu_units:Number(arg('--cpu-units','0'))||undefined,
      memory_mb:Number(arg('--memory-mb','0'))||undefined,
      storage_gb:Number(arg('--storage-gb','0'))||0,
    },
    placement_labels:csv(arg('--labels','owned,microseed')),
    max_concurrency:Number(arg('--max-concurrency','2')),
    duty_cycle:arg('--duty-cycle','always_on'),
    outFile:arg('--out',''),
    now:new Date(),
  });
  if(has('--submit')){
    const parsed=parseMicroSeedPairingUri(uri);
    if(!parsed.enrollment_url){
      throw new Error('microseed_pairing_ticket_has_no_enrollment_return_url');
    }
    const bundle=JSON.parse(fs.readFileSync(receipt.bundle_file,'utf8'));
    const enrollment=await submitMicroSeedEnrollmentBundle({
      enrollmentUrl:parsed.enrollment_url,
      bundle,
    });
    process.stdout.write(JSON.stringify({
      ...receipt,
      enrollment_submitted:true,
      enrollment_url:parsed.enrollment_url,
      enrollment_receipt:enrollment.receipt||enrollment,
      production_eligible:enrollment.production_eligible===true,
      conformance_required:enrollment.conformance_required!==false,
      calibration_required:enrollment.calibration_required!==false,
      private_key_exposed:false,
      device_token_exposed:false,
      pairing_secret_exposed:false,
    },null,2)+'\n');
    return;
  }
  process.stdout.write(JSON.stringify({
    ...receipt,
    enrollment_submitted:false,
    enrollment_url:parseMicroSeedPairingUri(uri).enrollment_url||null,
  },null,2)+'\n');
}

if(process.argv[1]&&path.resolve(process.argv[1])===MODULE_FILE){
  main().catch(error=>{
    process.stderr.write(JSON.stringify({
      ok:false,
      schema:'evercraft.microseed.device-pairing-error.v1',
      error:error instanceof Error?error.message:String(error),
      private_key_exposed:false,
      device_token_exposed:false,
      pairing_secret_exposed:false,
    })+'\n');
    process.exitCode=1;
  });
}
