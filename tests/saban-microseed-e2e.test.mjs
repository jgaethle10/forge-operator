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

test('Saban gateway relays exactly-once work to a real native MicroSeed agent',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'microseed-e2e-'));
  const deviceToken='device-secret';
  const gatewayToken='gateway-secret';
  let telemetryCalls=0;
  let executionTelemetryCalls=0;
  let agent=null;
  let gateway=null;
  try{
    const deviceManifest=normalizeMicroDeviceManifest({
      device_id:'phone-e2e-01',
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
      battery_floor_percent:20,
      attestation:{mode:'device',device_identity:'phone-key'},
    });

    agent=await startMicroSeedNativeAgent({
      manifest:deviceManifest,
      stateDir:path.join(root,'device-state'),
      authorizationToken:deviceToken,
      telemetryProvider:async({request})=>{
        telemetryCalls+=1;
        if(request) executionTelemetryCalls+=1;
        return {
          primary_function_busy:false,
          cpu_utilization:0.1,
          memory_free_mb:1600,
          temperature_c:35,
          battery_percent:90,
          external_power:true,
          network_utilization:0.1,
          observed_at:new Date().toISOString(),
          max_age_ms:60000,
        };
      },
    });

    const gatewayManifest=normalizeMicroDeviceManifest({
      device_id:'phone-e2e-01',
      device_class:'phone',
      bridge_mode:'native_agent',
      authorization_ref:'owner-phone',
      endpoint:agent.url,
      supported_workloads:['systemia.content-hash.v1'],
      resources:{cpu_units:1,memory_mb:2048,storage_gb:16},
      max_concurrency:2,
      duty_cycle:'opportunistic',
      cpu_utilization_ceiling:0.8,
      memory_reserve_mb:256,
      battery_floor_percent:20,
      attestation:{mode:'device',device_identity:'phone-key'},
    });

    const registry=new AmbientDeviceRegistry({root:path.join(root,'registry')});
    registry.observe({device_id:'phone-e2e-01'});
    registry.candidate({device_id:'phone-e2e-01',manifest:gatewayManifest});
    registry.authorize({
      device_id:'phone-e2e-01',
      approval_ref:'approve-phone-e2e',
      expires_at:new Date(Date.now()+3600000).toISOString(),
      heartbeat_target_seconds:300,
      attestation_mode:'device',
      attestation_identity:'phone-key',
    });
    registry.heartbeat({
      device_id:'phone-e2e-01',
      capability_manifest_hash:gatewayManifest.manifest_hash,
      attestation_identity:'phone-key',
    });

    const nativeAdapter=createMicroSeedNativeAgentAdapter({
      allowInsecureLan:true,
      credentialResolver:async({device_id})=>
        device_id==='phone-e2e-01'?deviceToken:'',
    });

    gateway=await startMicroSeedGateway({
      registryRoot:path.join(root,'registry'),
      stateDir:path.join(root,'gateway-state'),
      authorizationToken:gatewayToken,
      bridgeAdapters:{native_agent:nativeAdapter},
    });

    const requestBody={
      telemetry:{
        primary_function_busy:false,
        cpu_utilization:0.1,
        memory_free_mb:1600,
        temperature_c:35,
        battery_percent:90,
        external_power:true,
        network_utilization:0.1,
        observed_at:new Date().toISOString(),
        max_age_ms:60000,
      },
      request:{
        device_id:'phone-e2e-01',
        workload_class:'systemia.content-hash.v1',
        idempotency_key:'e2e-job-001',
        payload:{value:{hello:'world'}},
        requested_memory_mb:64,
        requested_cpu_fraction:0.1,
      },
    };

    const call=()=>fetch(gateway.url+'/v1/execute',{
      method:'POST',
      headers:{
        authorization:'Bearer '+gatewayToken,
        'content-type':'application/json',
      },
      body:JSON.stringify(requestBody),
    });

    const first=await call();
    assert.equal(first.status,200);
    const firstBody=await first.json();
    assert.equal(firstBody.execution_location,'remote_native_device_via_gateway');
    assert.equal(firstBody.result.schema,'evercraft.microseed.native-agent-relay-result.v1');
    assert.equal(firstBody.result.remote_execution_location,'device');
    assert.equal(firstBody.result.remote_arbitrary_code_execution,false);
    assert.equal(firstBody.result.credential_exposed,false);
    assert.match(firstBody.result.remote_receipt_hash,/^sha256:/);
    assert.equal(telemetryCalls,2);
    assert.equal(executionTelemetryCalls,1);

    const second=await call();
    assert.equal(second.status,200);
    const secondBody=await second.json();
    assert.equal(secondBody.deduplicated,true);
    assert.equal(telemetryCalls,3);
    assert.equal(executionTelemetryCalls,1);
    assert.equal(secondBody.receipt_hash,firstBody.receipt_hash);
  }finally{
    if(gateway) await gateway.close();
    if(agent) await agent.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('native-agent relay never accepts credentials embedded in the device URL',async()=>{
  const adapter=createMicroSeedNativeAgentAdapter({
    credentialResolver:async()=> 'secret',
  });
  await assert.rejects(
    ()=>adapter.execute({
      manifest:{
        bridge_mode:'native_agent',
        compute_execution_mode:'native_device',
        device_id:'bad-url',
        endpoint:'https://user:pass@example.com/',
      },
      workload_class:'systemia.health-probe.v1',
      payload:{},
      idempotency_key:'job',
    }),
    /url_credentials_forbidden/
  );
});
