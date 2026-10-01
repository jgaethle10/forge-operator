import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AmbientDeviceRegistry } from '../systemia/saban/ambient-device-registry.mjs';
import { normalizeMicroDeviceManifest } from '../systemia/saban/microseed-device-bridge.mjs';
import { startMicroSeedGateway } from '../systemia/saban/microseed-gateway.mjs';

function safeTelemetry(){
  return {
    primary_function_busy:false,
    cpu_utilization:0.1,
    memory_free_mb:2048,
    temperature_c:35,
    battery_percent:90,
    external_power:true,
    network_utilization:0.1,
    observed_at:new Date().toISOString(),
    max_age_ms:120000,
  };
}

function prepareNativeDevice(root){
  const registry=new AmbientDeviceRegistry({root:path.join(root,'registry')});
  const manifest=normalizeMicroDeviceManifest({
    device_id:'phone-gw-01',
    device_class:'phone',
    bridge_mode:'native_agent',
    authorization_ref:'owner-phone',
    endpoint:'https://phone.local/evercraft',
    supported_workloads:['systemia.content-hash.v1'],
    resources:{cpu_units:1,memory_mb:2048,storage_gb:16},
    max_concurrency:2,
    duty_cycle:'opportunistic',
    cpu_utilization_ceiling:0.8,
    memory_reserve_mb:256,
    battery_floor_percent:40,
    attestation:{mode:'device',device_identity:'phone-key'},
    observed_at:new Date().toISOString(),
  });
  registry.observe({device_id:'phone-gw-01'});
  registry.candidate({device_id:'phone-gw-01',manifest});
  registry.authorize({
    device_id:'phone-gw-01',
    approval_ref:'approve-phone',
    expires_at:new Date(Date.now()+3600000).toISOString(),
    heartbeat_target_seconds:300,
    attestation_mode:'device',
    attestation_identity:'phone-key',
  });
  registry.heartbeat({
    device_id:'phone-gw-01',
    capability_manifest_hash:manifest.manifest_hash,
    attestation_identity:'phone-key',
  });
  return registry;
}

test('MicroSeed gateway executes authorized native-device work over bounded loopback API',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'microseed-gateway-'));
  const token='test-gateway-token';
  try{
    prepareNativeDevice(root);
    const gateway=await startMicroSeedGateway({
      registryRoot:path.join(root,'registry'),
      stateDir:path.join(root,'execution'),
      authorizationToken:token,
    });
    try{
      const health=await fetch(gateway.url+'/health').then(r=>r.json());
      assert.equal(health.ok,true);
      assert.equal(health.host_scope,'loopback');
      assert.equal(health.arbitrary_code_execution,false);

      const unauthorized=await fetch(gateway.url+'/v1/execute',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({device_id:'phone-gw-01'}),
      });
      assert.equal(unauthorized.status,401);

      const body={
        telemetry:safeTelemetry(),
        request:{
          device_id:'phone-gw-01',
          workload_class:'systemia.content-hash.v1',
          idempotency_key:'gateway-job-1',
          payload:{value:'hello'},
          requested_memory_mb:64,
          requested_cpu_fraction:0.1,
        },
      };
      const first=await fetch(gateway.url+'/v1/execute',{
        method:'POST',
        headers:{'content-type':'application/json',authorization:'Bearer '+token},
        body:JSON.stringify(body),
      });
      assert.equal(first.status,200);
      const firstBody=await first.json();
      assert.equal(firstBody.ok,true);
      assert.equal(firstBody.execution_location,'device');
      assert.equal(firstBody.deduplicated,false);

      const replay=await fetch(gateway.url+'/v1/execute',{
        method:'POST',
        headers:{'content-type':'application/json',authorization:'Bearer '+token},
        body:JSON.stringify(body),
      });
      assert.equal(replay.status,200);
      assert.equal((await replay.json()).deduplicated,true);

      const summary=await fetch(gateway.url+'/v1/registry-summary',{
        headers:{authorization:'Bearer '+token},
      }).then(r=>r.json());
      assert.equal(summary.device_count,1);
      assert.equal(summary.eligible_count,1);
      assert.equal(summary.device_ids_exposed,false);
    }finally{
      await gateway.close();
    }
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('revoked device is rejected immediately by gateway',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'microseed-gateway-revoke-'));
  const token='test-gateway-token';
  try{
    const registry=prepareNativeDevice(root);
    registry.revoke({
      device_id:'phone-gw-01',
      approval_ref:'revoke-phone',
      revoked_at:new Date().toISOString(),
    });
    const gateway=await startMicroSeedGateway({
      registryRoot:path.join(root,'registry'),
      stateDir:path.join(root,'execution'),
      authorizationToken:token,
    });
    try{
      const response=await fetch(gateway.url+'/v1/execute',{
        method:'POST',
        headers:{'content-type':'application/json',authorization:'Bearer '+token},
        body:JSON.stringify({
          telemetry:safeTelemetry(),
          request:{
            device_id:'phone-gw-01',
            workload_class:'systemia.content-hash.v1',
            idempotency_key:'after-revoke',
            payload:{value:'x'},
          },
        }),
      });
      assert.equal(response.status,403);
      const body=await response.json();
      assert.equal(body.trust_state,'revoked');
    }finally{
      await gateway.close();
    }
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('gateway refuses non-loopback binding unless explicitly authorized',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'microseed-gateway-host-'));
  try{
    await assert.rejects(
      ()=>startMicroSeedGateway({
        registryRoot:path.join(root,'registry'),
        stateDir:path.join(root,'execution'),
        host:'0.0.0.0',
        authorizationToken:'x',
      }),
      /loopback_required/
    );
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});
