#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startMicroSeedGateway } from './microseed-gateway.mjs';
import { createMicroSeedNativeAgentAdapter } from './microseed-native-agent-adapter.mjs';
import { createMicroSeedLanApiAdapter } from './microseed-lan-api-adapter.mjs';

const MODULE_FILE=fileURLToPath(import.meta.url);
const arg=(name,fallback='')=>{
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
};
const safeId=v=>{
  const id=String(v||'').trim().replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,160);
  if(!id) throw new Error('device_id_required');
  return id;
};
function readSecret(file){
  if(!file||!fs.existsSync(file)) return '';
  return fs.readFileSync(file,'utf8').trim();
}

async function main(){
  const root=path.resolve(arg('--root',process.env.SABAN_AMBIENT_STATE_DIR||''));
  if(!root) throw new Error('saban_microseed_root_required');

  const host=String(arg('--host','127.0.0.1'));
  const port=Math.max(0,Number(arg('--port','8791')));
  const gatewayTokenFile=path.resolve(
    arg('--gateway-token-file',path.join(root,'.secrets','microseed-gateway-token'))
  );
  const gatewayToken=readSecret(gatewayTokenFile);
  if(!gatewayToken) throw new Error('microseed_gateway_token_file_missing_or_empty');

  const credentialDir=path.join(root,'.secrets','device-tokens');
  const nativeAdapter=createMicroSeedNativeAgentAdapter({
    allowInsecureLan:process.env.SABAN_MICROSEED_ALLOW_INSECURE_LAN==='1',
    credentialResolver:async({device_id})=>
      readSecret(path.join(credentialDir,safeId(device_id)+'.token')),
  });

  const lanApiAdapter=createMicroSeedLanApiAdapter({
    allowInsecureLan:process.env.SABAN_MICROSEED_ALLOW_INSECURE_LAN==='1',
    credentialResolver:async({device_id})=>{
      const bearer=readSecret(path.join(credentialDir,safeId(device_id)+'.token'));
      return bearer?{bearer}:null;
    },
  });

  const gateway=await startMicroSeedGateway({
    registryRoot:path.join(root,'registry'),
    stateDir:path.join(root,'execution'),
    host,
    port,
    authorizationToken:gatewayToken,
    bridgeAdapters:{
      native_agent:nativeAdapter,
      lan_api:lanApiAdapter,
    },
  });

  process.stdout.write(JSON.stringify({
    schema:'evercraft.saban.microseed-gateway-runner.v1',
    ok:true,
    service:'saban-microseed-gateway',
    host_scope:host==='127.0.0.1'?'loopback':'explicit',
    port:Number(new URL(gateway.url).port),
    credential_values_exposed:false,
    device_tokens_embedded_in_manifests:false,
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
      schema:'evercraft.saban.microseed-gateway-runner-error.v1',
      error:error instanceof Error?error.message:String(error),
      credential_values_exposed:false,
    })+'\n');
    process.exitCode=1;
  });
}
