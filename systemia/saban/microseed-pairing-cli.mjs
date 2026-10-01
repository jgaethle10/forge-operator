#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AmbientDeviceRegistry } from './ambient-device-registry.mjs';
import {
  issueMicroSeedPairingTicket,
  listMicroSeedPairingTickets,
  showMicroSeedPairingTicket,
  revokeMicroSeedPairingTicket,
  consumeMicroSeedPairingBundle,
} from './microseed-pairing.mjs';

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
    ticket_card:ticket.ticket_card,
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
  const stateDir=path.resolve(
    arg('--root',process.env.SABAN_AMBIENT_STATE_DIR||path.join(os.homedir(),'.local/state/evercraft/saban-ambient'))
  );

  if(command==='issue'){
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
    process.stdout.write(receipt.ticket_card.card_text+'\n');
    process.stdout.write('\nPAIRING KIT\n');
    process.stdout.write(JSON.stringify({
      schema:receipt.schema,
      ticket_id:receipt.ticket_id,
      display_code:receipt.ticket_card.display_code,
      kit_file:receipt.kit_file,
      kit_file_mode:receipt.kit_file_mode,
      expires_at:receipt.expires_at,
      device_id:receipt.device_id,
      allowed_device_classes:receipt.allowed_device_classes,
      allowed_workloads:receipt.allowed_workloads,
      pairing_secret_exposed_in_card:true,
      kit_contains_secret:true,
      authorization_granted:false,
    },null,2)+'\n');
    return;
  }

  if(command==='show'){
    const card=showMicroSeedPairingTicket({
      stateDir,
      ticket_id:arg('--ticket-id',''),
      now:new Date(),
    });
    process.stdout.write(card.card_text+'\n');
    return;
  }

  if(command==='list'){
    process.stdout.write(JSON.stringify(listMicroSeedPairingTickets({
      stateDir,
      now:new Date(),
      include_expired:process.argv.includes('--include-expired'),
    }),null,2)+'\n');
    return;
  }

  if(command==='revoke'){
    process.stdout.write(JSON.stringify(revokeMicroSeedPairingTicket({
      stateDir,
      ticket_id:arg('--ticket-id',''),
      reason:arg('--reason','operator_revoked'),
      now:new Date(),
    }),null,2)+'\n');
    return;
  }

  if(command==='consume'){
    const bundleFile=path.resolve(arg('--bundle-file',''));
    if(!fs.existsSync(bundleFile)) throw new Error('microseed_pairing_bundle_file_missing');
    const bundle=JSON.parse(fs.readFileSync(bundleFile,'utf8'));
    const registry=new AmbientDeviceRegistry({root:path.join(stateDir,'registry')});
    process.stdout.write(JSON.stringify(consumeMicroSeedPairingBundle({
      stateDir,
      registry,
      bundle,
      now:new Date(),
    }),null,2)+'\n');
    return;
  }

  throw new Error('microseed_pairing_cli_command_unsupported:'+command);
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
