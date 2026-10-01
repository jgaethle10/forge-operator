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
import { AmbientWorkQueue } from '../systemia/saban/ambient-work-queue.mjs';
import { dispatchAmbientJobsOnce } from '../systemia/saban/ambient-job-dispatcher.mjs';

function installCredential(root,deviceId,token){
  const dir=path.join(root,'.secrets','device-tokens');
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  fs.writeFileSync(path.join(dir,deviceId+'.token'),token+'\n',{mode:0o600});
}

test('durable product job dispatches through trusted zero-spend MicroSeed and closes completed',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-job-dispatch-'));
  const deviceId='phone-job-01';
  const deviceToken='device-token';
  const gatewayToken='gateway-token';
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
      duty_cycle:'always_on',
      cpu_utilization_ceiling:0.8,
      memory_reserve_mb:256,
      attestation:{mode:'device',device_identity:'phone-key'},
    });
    agent=await startMicroSeedNativeAgent({
      manifest:agentManifest,
      stateDir:path.join(root,'device-state'),
      authorizationToken:deviceToken,
      telemetryProvider:async()=>({
        primary_function_busy:false,
        cpu_utilization:0.1,
        memory_free_mb:1800,
        temperature_c:34,
        battery_percent:95,
        external_power:true,
        network_utilization:null,
        observed_at:new Date().toISOString(),
        max_age_ms:60000,
      }),
    });
    const manifest=normalizeMicroDeviceManifest({
      ...agentManifest,
      authorization_ref:'owner-phone',
      endpoint:agent.url,
      observed_at:new Date().toISOString(),
    });
    const registry=new AmbientDeviceRegistry({root:path.join(root,'registry')});
    registry.observe({device_id:deviceId});
    registry.candidate({device_id:deviceId,manifest});
    registry.authorize({
      device_id:deviceId,
      approval_ref:'approve-phone',
      expires_at:new Date(Date.now()+3600000).toISOString(),
      heartbeat_target_seconds:300,
      attestation_mode:'device',
      attestation_identity:'phone-key',
    });
    registry.heartbeat({
      device_id:deviceId,
      capability_manifest_hash:manifest.manifest_hash,
      attestation_identity:'phone-key',
    });
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

    const conform=await fetch(gateway.url+'/v1/conformance',{
      method:'POST',
      headers:{authorization:'Bearer '+gatewayToken,'content-type':'application/json'},
      body:JSON.stringify({device_id:deviceId}),
    });
    assert.equal(conform.status,200);
    assert.deepEqual((await conform.json()).verified_workloads,['systemia.content-hash.v1']);

    const queue=new AmbientWorkQueue({root:path.join(root,'work-queue')});
    const job=queue.submit({
      workload_class:'systemia.content-hash.v1',
      idempotency_key:'rivet-source-chunk-001',
      payload:{value:{source:'AliEV',chunk:1}},
      resources:{cpu_units:0.1,memory_mb:64,storage_gb:0},
      private_data:true,
      preemptible:true,
      checkpointable:true,
    });
    assert.equal(job.state,'queued');

    const cycle=await dispatchAmbientJobsOnce({
      root,
      gatewayUrl:gateway.url,
      gatewayToken,
      now:new Date(),
    });
    assert.equal(cycle.completed,1);
    assert.equal(cycle.held,0);
    assert.equal(cycle.commercial_capacity_authorized,false);

    const completed=queue.get(job.job_id);
    assert.equal(completed.state,'completed');
    assert.equal(completed.execution_receipt.device_id,deviceId);
    assert.equal(completed.execution_receipt.execution_location,'remote_native_device_via_gateway');
    assert.match(completed.execution_receipt.gateway_receipt_hash,/^sha256:/);
    assert.match(completed.result.remote_result.digest,/^sha256:/);

    const again=queue.submit({
      workload_class:'systemia.content-hash.v1',
      idempotency_key:'rivet-source-chunk-001',
      payload:{value:{source:'AliEV',chunk:1}},
      resources:{cpu_units:0.1,memory_mb:64,storage_gb:0},
      private_data:true,
      preemptible:true,
      checkpointable:true,
    });
    assert.equal(again.deduplicated_submission,true);
    assert.equal(again.state,'completed');
  }finally{
    if(gateway) await gateway.close();
    if(agent) await agent.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('work queue rejects idempotency conflicts and oversized payloads',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-work-queue-'));
  try{
    const queue=new AmbientWorkQueue({root});
    queue.submit({
      workload_class:'systemia.content-hash.v1',
      idempotency_key:'same',
      payload:{value:'one'},
    });
    assert.throws(
      ()=>queue.submit({
        workload_class:'systemia.content-hash.v1',
        idempotency_key:'same',
        payload:{value:'two'},
      }),
      /idempotency_conflict/
    );
    assert.throws(
      ()=>queue.submit({
        workload_class:'systemia.content-hash.v1',
        idempotency_key:'huge',
        payload:{value:'x'.repeat(70*1024)},
      }),
      /payload_too_large/
    );
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('dispatcher holds work when no conformance-proven zero-spend capacity exists',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-job-held-'));
  try{
    const queue=new AmbientWorkQueue({root:path.join(root,'work-queue')});
    const job=queue.submit({
      workload_class:'systemia.content-hash.v1',
      idempotency_key:'held-job',
      payload:{value:'waiting'},
    });
    const cycle=await dispatchAmbientJobsOnce({
      root,
      gatewayUrl:'http://127.0.0.1:8791',
      gatewayToken:'token',
      now:new Date(),
    });
    assert.equal(cycle.completed,0);
    assert.equal(cycle.held,1);
    assert.equal(queue.get(job.job_id).state,'held');
    assert.equal(cycle.rows[0].reason,'no_current_eligible_zero_spend_capacity');
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});


test('product work queue cannot submit infrastructure-only secret-share jobs',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-work-infra-only-'));
  try{
    const queue=new AmbientWorkQueue({root});
    assert.throws(
      ()=>queue.submit({
        workload_class:'systemia.secret-share-vault.v1',
        idempotency_key:'steal-share',
        payload:{operation:'get',slot_id:'ambient-memory-master-anything'},
        private_data:true,
      }),
      /workload_infrastructure_only/
    );
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});
