#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { issueMicroSeedPairingTicket } from './microseed-pairing.mjs';

const MODULE_FILE=fileURLToPath(import.meta.url);
const arg=(name,fallback='')=>{
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
};
const csv=v=>String(v||'').split(',').map(x=>x.trim()).filter(Boolean);

function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
  fs.chmodSync(file,0o600);
}
function safeId(v){
  const x=String(v||'').trim().replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,160);
  if(!x) throw new Error('pairing_kit_id_required');
  return x;
}

export function issueMicroSeedPairingKit({
  stateDir,
  approval_ref,
  device_id=null,
  allowed_device_classes=[],
  allowed_workloads=[],
  ttl_ms=15*60*1000,
  enrollment_url='',
  outFile='',
  now=new Date(),
}={}){
  const ticket=issueMicroSeedPairingTicket({
    stateDir,
    approval_ref,
    device_id,
    allowed_device_classes,
    allowed_workloads,
    ttl_ms,
    now,
  });
  const destination=path.resolve(
    outFile ||
    path.join(stateDir,'pairing','outbox',safeId(ticket.ticket_id)+'.pairing-kit.json')
  );
  const kit={
    schema:'evercraft.microseed.pairing-kit.v1',
    ticket_id:ticket.ticket_id,
    pairing_secret:ticket.pairing_secret,
    device_id:ticket.device_id,
    allowed_device_classes:ticket.allowed_device_classes,
    allowed_workloads:ticket.allowed_workloads,
    expires_at:ticket.expires_at,
    enrollment_url:String(enrollment_url||''),
    approval_ref_hash:ticket.approval_ref_hash,
    single_use:true,
    treat_as_secret:true,
  };
  atomicJson(destination,kit);
  return {
    schema:'evercraft.microseed.pairing-kit-issue-receipt.v1',
    ticket_id:ticket.ticket_id,
    kit_file:destination,
    kit_file_mode:(fs.statSync(destination).mode&0o777).toString(8).padStart(4,'0'),
    device_id:ticket.device_id,
    allowed_device_classes:ticket.allowed_device_classes,
    allowed_workloads:ticket.allowed_workloads,
    expires_at:ticket.expires_at,
    enrollment_url:kit.enrollment_url||null,
    pairing_secret_exposed:false,
    kit_contains_secret:true,
    authorization_granted:false,
  };
}

async function main(){
  const command=process.argv[2]||'issue';
  if(command!=='issue') throw new Error('microseed_pairing_cli_command_unsupported');
  const stateDir=path.resolve(
    arg('--root',process.env.SABAN_AMBIENT_STATE_DIR||path.join(os.homedir(),'.local/state/evercraft/saban-ambient'))
  );
  const receipt=issueMicroSeedPairingKit({
    stateDir,
    approval_ref:arg('--approval-ref',''),
    device_id:arg('--device-id','')||null,
    allowed_device_classes:csv(arg('--device-classes','')),
    allowed_workloads:csv(arg('--workloads','')),
    ttl_ms:Number(arg('--ttl-ms',String(15*60*1000))),
    enrollment_url:arg('--enrollment-url',''),
    outFile:arg('--out',''),
    now:new Date(),
  });
  process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
}

if(process.argv[1]&&path.resolve(process.argv[1])===MODULE_FILE){
  main().catch(error=>{
    process.stderr.write(JSON.stringify({
      ok:false,
      schema:'evercraft.microseed.pairing-cli-error.v1',
      error:error instanceof Error?error.message:String(error),
      pairing_secret_exposed:false,
    })+'\n');
    process.exitCode=1;
  });
}
