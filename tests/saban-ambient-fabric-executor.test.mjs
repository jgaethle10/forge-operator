import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AmbientDeviceRegistry } from '../systemia/saban/ambient-device-registry.mjs';
import { normalizeMicroDeviceManifest } from '../systemia/saban/microseed-device-bridge.mjs';
import { normalizeFabricTask } from '../systemia/saban/heterogeneous-fabric-planner.mjs';
import { startMicroSeedNativeAgent } from '../systemia/saban/microseed-native-agent.mjs';
import { createMicroSeedNativeAgentAdapter } from '../systemia/saban/microseed-native-agent-adapter.mjs';
import { startMicroSeedGateway } from '../systemia/saban/microseed-gateway.mjs';
import { executeAmbientFabricPlan } from '../systemia/saban/ambient-fabric-executor.mjs';

function planFor(deviceId){
  const body={
    schema:'evercraft.saban.heterogeneous-fabric-plan.v1',
    state:'ready',
    placements:[{
      task_id:'hash-shard',
      unit_id:'hash-shard:s0:r0',
      shard_index:0,
      replica_index:0,
      offer_id:'ambient:microseed:'+deviceId+':compute',
      provider_id:'microseed:'+deviceId+':compute',
      device_id:deviceId,
      market:'ambient-fabric',
      access_class:'authorized_compute',
      device_class:'phone',
      failure_domain:deviceId,
      score:1000,
      effective_score:1000,
      zero_cost:true,
      attested:true,
      preemptible:true,
      checkpointable:true,
    }],
    held:[],
    eligible_offers_by_task:{'hash-shard':['ambient:microseed:'+deviceId+':compute']},
    receipt_hash:'sha256:'+'9'.repeat(64),
  };
  return body;
}

test('ambient executor carries a placement through gateway to device and resumes without duplicate work',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-ambient-executor-'));
  const deviceId='phone-exec-01';
  const deviceToken='device-token';
  const gatewayToken='gateway-token';
  let deviceExecutions=0;
  let agent=null;
  let gateway=null;

  try{
    const manifestForAgent=normalizeMicroDeviceManifest({
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
      attestation:{mode:'device',device_identity:'phone-key'},
    });

    agent=await startMicroSeedNativeAgent({
      manifest:manifestForAgent,
      stateDir:path.join(root,'device-state'),
      authorizationToken:deviceToken,
      telemetryProvider:async({request})=>{
        if(request) deviceExecutions+=1;
        return {
          primary_function_busy:false,
          cpu_utilization:0.1,
          memory_free_mb:1600,
          temperature_c:35,
          battery_percent:95,
          external_power:true,
          network_utilization:0.1,
          observed_at:new Date().toISOString(),
          max_age_ms:60000,
        };
      },
    });

    const manifest=normalizeMicroDeviceManifest({
      device_id:deviceId,
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
      attestation:{mode:'device',device_identity:'phone-key'},
    });

    const registry=new AmbientDeviceRegistry({root:path.join(root,'registry')});
    registry.observe({device_id:deviceId});
    registry.candidate({device_id:deviceId,manifest});
    registry.authorize({
      device_id:deviceId,
      approval_ref:'approve-device',
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

    const adapter=createMicroSeedNativeAgentAdapter({
      allowInsecureLan:true,
      credentialResolver:async()=>deviceToken,
    });
    gateway=await startMicroSeedGateway({
      registryRoot:path.join(root,'registry'),
      stateDir:path.join(root,'gateway-state'),
      authorizationToken:gatewayToken,
      bridgeAdapters:{native_agent:adapter},
    });

    const task=normalizeFabricTask({
      task_id:'hash-shard',
      workload_class:'systemia.content-hash.v1',
      execution_shape:'shardable',
      shard_count:1,
      resources:{cpu_units:0.1,memory_mb:64,storage_gb:0},
      preemptible:true,
      checkpointable:true,
    });
    const stateFile=path.join(root,'executor-state.json');
    const plan=planFor(deviceId);

    const first=await executeAmbientFabricPlan({
      plan,
      tasks:[task],
      gatewayUrl:gateway.url,
      gatewayToken,
      stateFile,
      inputProvider:async()=>({payload:{value:{hello:'fabric'}}}),
    });
    assert.equal(first.completed_units,1);
    assert.equal(first.failed_units,0);
    assert.equal(first.replan_required,false);
    assert.equal(first.results[0].execution_location,'remote_native_device_via_gateway');
    assert.equal(deviceExecutions,1);
    assert.deepEqual(first.checkpoints['hash-shard:s0:r0'].completed,true);

    const second=await executeAmbientFabricPlan({
      plan,
      tasks:[task],
      gatewayUrl:gateway.url,
      gatewayToken,
      stateFile,
      inputProvider:async()=>({payload:{value:{hello:'fabric'}}}),
    });
    assert.equal(second.completed_units,1);
    assert.equal(second.results[0].resumed_from_state,true);
    assert.equal(second.results[0].deduplicated,true);
    assert.equal(deviceExecutions,1);

    const changed=await executeAmbientFabricPlan({
      plan,
      tasks:[task],
      gatewayUrl:gateway.url,
      gatewayToken,
      stateFile,
      inputProvider:async()=>({payload:{value:{hello:'changed'}}}),
    });
    assert.equal(changed.completed_units,1);
    assert.equal(deviceExecutions,2);
  }finally{
    if(gateway) await gateway.close();
    if(agent) await agent.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('ambient executor holds unsupported placement surfaces instead of pretending to execute them',async()=>{
  const plan={
    schema:'evercraft.saban.heterogeneous-fabric-plan.v1',
    placements:[{
      task_id:'x',
      unit_id:'x:s0:r0',
      market:'akash',
      offer_id:'external',
      provider_id:'external',
    }],
    receipt_hash:'sha256:'+'8'.repeat(64),
  };
  const receipt=await executeAmbientFabricPlan({
    plan,
    tasks:[],
    gatewayUrl:'http://127.0.0.1:8791',
    gatewayToken:'token',
    inputProvider:async()=>({payload:{}}),
    fetchImpl:async()=>{throw new Error('must_not_call_gateway');},
  });
  assert.equal(receipt.completed_units,0);
  assert.equal(receipt.held_units,1);
  assert.equal(receipt.replan_required,true);
  assert.equal(receipt.held[0].reason,'execution_fabric_not_microseed');
  assert.equal(receipt.gateway_token_exposed,false);
});
