#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMicroSeedEnrollmentGateway } from './microseed-enrollment-gateway.mjs';

const MODULE_FILE=fileURLToPath(import.meta.url);
const arg=(name,fallback='')=>{
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
};

async function main(){
  const root=path.resolve(
    arg('--root',process.env.SABAN_AMBIENT_STATE_DIR||path.join(os.homedir(),'.local/state/evercraft/saban-ambient'))
  );
  const gateway=await startMicroSeedEnrollmentGateway({
    stateDir:root,
    host:arg('--host','127.0.0.1'),
    port:Number(arg('--port','8794')),
    allowNonLoopback:false,
    tlsTerminatedUpstream:false,
  });

  process.stdout.write(JSON.stringify({
    schema:'evercraft.microseed.enrollment-gateway-runner.v1',
    ok:true,
    url:gateway.url,
    ticket_issue_surface:false,
    execution_surface:false,
    public_route_bound:false,
    tls_expected_at_public_edge:true,
    observed_at:new Date().toISOString(),
  })+'\n');

  const shutdown=async()=>{
    try{await gateway.close();}finally{process.exit(0);}
  };
  process.on('SIGTERM',()=>shutdown().catch(()=>process.exit(1)));
  process.on('SIGINT',()=>shutdown().catch(()=>process.exit(1)));
  await new Promise(()=>{});
}

if(process.argv[1]&&path.resolve(process.argv[1])===MODULE_FILE){
  main().catch(error=>{
    process.stderr.write(JSON.stringify({
      ok:false,
      schema:'evercraft.microseed.enrollment-gateway-runner-error.v1',
      error:error instanceof Error?error.message:String(error),
      ticket_issue_surface:false,
      execution_surface:false,
    })+'\n');
    process.exitCode=1;
  });
}
