#!/usr/bin/env node
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { startMicroSeedPairingApi } from './microseed-pairing-api.mjs';

const MODULE_FILE=fileURLToPath(import.meta.url);
const arg=(name,fallback='')=>{
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
};

async function main(){
  const root=path.resolve(
    arg('--root',process.env.SABAN_AMBIENT_STATE_DIR||path.join(os.homedir(),'.local/state/evercraft/saban-ambient'))
  );
  const host=arg('--host','127.0.0.1');
  const port=Math.max(0,Number(arg('--port','8794')));
  const api=await startMicroSeedPairingApi({
    stateDir:root,
    host,
    port,
    allowNonLoopback:false,
  });
  process.stdout.write(JSON.stringify({
    schema:'evercraft.microseed.pairing-api-runner.v1',
    ok:true,
    url:api.url,
    host_scope:'loopback',
    can_issue_pairing_tickets:false,
    pairing_secret_exposed:false,
    device_token_exposed:false,
    public_exposure_configured:false,
    observed_at:new Date().toISOString(),
  })+'\n');

  const shutdown=async()=>{
    try{await api.close();}finally{process.exit(0);}
  };
  process.on('SIGTERM',()=>shutdown().catch(()=>process.exit(1)));
  process.on('SIGINT',()=>shutdown().catch(()=>process.exit(1)));
  await new Promise(()=>{});
}

if(process.argv[1]&&path.resolve(process.argv[1])===MODULE_FILE){
  main().catch(error=>{
    process.stderr.write(JSON.stringify({
      ok:false,
      schema:'evercraft.microseed.pairing-api-runner-error.v1',
      error:error instanceof Error?error.message:String(error),
      public_exposure_configured:false,
    })+'\n');
    process.exitCode=1;
  });
}
