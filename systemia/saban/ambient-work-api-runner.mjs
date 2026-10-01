#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startAmbientWorkApi } from './ambient-work-api.mjs';

const MODULE_FILE=fileURLToPath(import.meta.url);
const arg=(name,fallback='')=>{
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
};

async function main(){
  const root=path.resolve(arg('--root',process.env.SABAN_AMBIENT_STATE_DIR||path.join(os.homedir(),'.local/state/evercraft/saban-ambient')));
  const tokenFile=path.resolve(arg('--token-file',path.join(root,'.secrets','ambient-work-api-token')));
  if(!fs.existsSync(tokenFile)) throw new Error('ambient_work_api_token_file_missing');
  const token=fs.readFileSync(tokenFile,'utf8').trim();
  if(!token) throw new Error('ambient_work_api_token_file_empty');

  const api=await startAmbientWorkApi({
    queueRoot:path.join(root,'work-queue'),
    host:arg('--host','127.0.0.1'),
    port:Number(arg('--port','8793')),
    authorizationToken:token,
  });

  process.stdout.write(JSON.stringify({
    schema:'evercraft.saban.ambient-work-api-runner.v1',
    ok:true,
    url:api.url,
    token_value_exposed:false,
    execution_gateway_authority:false,
    arbitrary_code_execution:false,
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
      schema:'evercraft.saban.ambient-work-api-runner-error.v1',
      error:error instanceof Error?error.message:String(error),
      token_value_exposed:false,
      execution_gateway_authority:false,
    })+'\n');
    process.exitCode=1;
  });
}
