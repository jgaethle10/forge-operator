import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AmbientDeviceRegistry } from '../systemia/saban/ambient-device-registry.mjs';
import { normalizeMicroDeviceManifest } from '../systemia/saban/microseed-device-bridge.mjs';
import { startMicroSeedNativeAgent } from '../systemia/saban/microseed-native-agent.mjs';
import { createMicroSeedNativeAgentAdapter } from '../systemia/saban/microseed-native-agent-adapter.mjs';
import { startMicroSeedGateway } from '../systemia/saban/microseed-gateway.mjs';
import { runMicroSeedProbationOnce } from '../systemia/saban/microseed-probation-organism.mjs';

function installCredential(root,deviceId,token){
  const dir=path.join(root,'.secrets','device-tokens');
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  fs.writeFileSync(path.join(dir,deviceId+'.token'),token+'\n',{mode:0o600});
}

function authorize(registry,manifest,now=Date.now()){
  registry.observe({device_id:manifest.device_id});
  registry.candidate({device_id:manifest.device_id,manifest});
  registry.authorize({
    device_id:manifest.device_id,
    approval_ref:'approve-'+manifest.device_id,
    expires_at:new Date(now+3600000).toISOString(),
    heartbeat_target_seconds:300,
    attestation_mode:'device',
    attestation_identity:'device-key',
  });
  registry.heartbeat({
    device_id:manifest.device_id,
    capability_manifest_hash:manifest.manifest_hash,
    attestation_identity:'device-key',
  });
}

test('probation organism automatically conforms and calibrates already-authorized credentialed MicroSeeds',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-probation-'));
  const deviceId='phone-probation-01';
  const deviceToken='device-secret';
  const gatewayToken='gateway-secret';
  let agent=null;
  let gateway=null;
  try{
    const agentManifest=normalizeMicroDeviceManifest({
      device_id:deviceId,
      device_class:'phone',
      bridge_mode:'native_agent',
      authorization_ref:'owner-phone',
      endpoint:'http://127.0.0.1:1',
      supported_workloads:['systemia.content-hash.v1'],
      resources:{cpu_units:1,memory_mb:2048,storage_gb:16},
      max_concurrency:2,
      duty_cycle:'opportunistic',
      cpu_utilization_ceiling:0.8,
      memory_reserve_mb:256,
      attestation:{mode:'device',device_identity:'device-key'},
    });

    agent=await startMicroSeedNativeAgent({
      manifest:agentManifest,
      stateDir:path.join(root,'device-state'),
      authorizationToken:deviceToken,
      telemetryProvider:async()=>({
        primary_function_busy:false,
        cpu_utilization:0.1,
        memory_free_mb:1600,
        temperature_c:34,
        battery_percent:90,
        external_power:true,
        network_utilization:0.1,
        observed_at:new Date().toISOString(),
        max_age_ms:60000,
      }),
    });

    const gatewayManifest=normalizeMicroDeviceManifest({
      ...agentManifest,
      endpoint:agent.url,
      authorization_ref:'owner-phone',
    });
    const registry=new AmbientDeviceRegistry({root:path.join(root,'registry')});
    authorize(registry,gatewayManifest);
    installCredential(root,deviceId,deviceToken);

    const adapter=createMicroSeedNativeAgentAdapter({
      allowInsecureLan:true,
      credentialResolver:async()=>deviceToken,
    });
    gateway=await startMicroSeedGateway({
      registryRoot:path.join(root,'registry'),
      stateDir:root,
      authorizationToken:gatewayToken,
      bridgeAdapters:{native_agent:adapter},
      performanceLedgerFile:path.join(root,'performance-ledger.json'),
    });

    const first=await runMicroSeedProbationOnce({
      root,
      gatewayUrl:gateway.url,
      gatewayToken,
      now:new Date(),
    });
    assert.equal(first.production_eligible,1);
    assert.equal(first.rows[0].conformance_action,'refreshed');
    assert.equal(first.rows[0].calibration_action,'completed');
    assert.ok(registry.conformance(deviceId));
    const ledger=JSON.parse(fs.readFileSync(path.join(root,'performance-ledger.json'),'utf8'));
    const profile=ledger.profiles[deviceId+'|systemia.content-hash.v1'];
    assert.ok(profile.samples>=4);

    const second=await runMicroSeedProbationOnce({
      root,
      gatewayUrl:gateway.url,
      gatewayToken,
      now:new Date(Date.now()+60_000),
    });
    assert.equal(second.production_eligible,1);
    assert.equal(second.rows[0].conformance_action,'kept_fresh');
  }finally{
    if(gateway) await gateway.close();
    if(agent) await agent.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('probation organism cannot turn authorization into control without a device credential',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-probation-no-credential-'));
  try{
    const manifest=normalizeMicroDeviceManifest({
      device_id:'phone-no-credential',
      device_class:'phone',
      bridge_mode:'native_agent',
      authorization_ref:'owner-phone',
      endpoint:'https://phone.local/evercraft',
      supported_workloads:['systemia.content-hash.v1'],
      resources:{cpu_units:1,memory_mb:1024,storage_gb:8},
      attestation:{mode:'device',device_identity:'device-key'},
    });
    const registry=new AmbientDeviceRegistry({root:path.join(root,'registry')});
    authorize(registry,manifest);

    const receipt=await runMicroSeedProbationOnce({
      root,
      gatewayUrl:'http://127.0.0.1:8791',
      gatewayToken:'gateway-secret',
      fetchImpl:async()=>{throw new Error('gateway_must_not_be_called');},
      now:new Date(),
    });
    assert.equal(receipt.production_eligible,0);
    assert.equal(receipt.held,1);
    assert.equal(receipt.rows[0].reason,'device_credential_missing');
    assert.equal(receipt.credentials_created,false);
    assert.equal(receipt.owner_authorization_changed,false);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('probation failures back off instead of hammering a device',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-probation-backoff-'));
  try{
    const manifest=normalizeMicroDeviceManifest({
      device_id:'phone-backoff',
      device_class:'phone',
      bridge_mode:'native_agent',
      authorization_ref:'owner-phone',
      endpoint:'https://phone.local/evercraft',
      supported_workloads:['systemia.content-hash.v1'],
      resources:{cpu_units:1,memory_mb:1024,storage_gb:8},
      attestation:{mode:'device',device_identity:'device-key'},
    });
    const registry=new AmbientDeviceRegistry({root:path.join(root,'registry')});
    authorize(registry,manifest);
    installCredential(root,'phone-backoff','device-secret');

    let calls=0;
    const first=await runMicroSeedProbationOnce({
      root,
      gatewayUrl:'http://127.0.0.1:8791',
      gatewayToken:'gateway-secret',
      fetchImpl:async()=>{
        calls+=1;
        return new Response(JSON.stringify({ok:false,error:'device_sleeping'}),{
          status:409,
          headers:{'content-type':'application/json'},
        });
      },
      now:new Date('2026-10-01T05:00:00.000Z'),
    });
    assert.equal(first.retry_wait,1);
    assert.equal(calls,1);
    assert.equal(first.rows[0].attempts,1);

    const second=await runMicroSeedProbationOnce({
      root,
      gatewayUrl:'http://127.0.0.1:8791',
      gatewayToken:'gateway-secret',
      fetchImpl:async()=>{calls+=1; throw new Error('must_not_retry_yet');},
      now:new Date('2026-10-01T05:00:10.000Z'),
    });
    assert.equal(second.retry_wait,1);
    assert.equal(second.rows[0].state,'backoff');
    assert.equal(calls,1);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});
