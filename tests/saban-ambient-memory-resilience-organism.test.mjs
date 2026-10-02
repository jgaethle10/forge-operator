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
import { ensureAmbientMemoryMasterKey, loadAmbientMemoryMasterKey } from '../systemia/saban/ambient-memory-fabric.mjs';
import { runAmbientMemoryResilienceOnce } from '../systemia/saban/ambient-memory-resilience-organism.mjs';

async function addNode({root,registry,id,token}){
  const local=normalizeMicroDeviceManifest({
    device_id:id,
    device_class:'mini-pc',
    bridge_mode:'native_agent',
    authorization_ref:'owner-'+id,
    endpoint:'http://127.0.0.1:1',
    supported_workloads:['systemia.secret-share-vault.v1'],
    resources:{cpu_units:1,memory_mb:1024,storage_gb:2},
    persistent_storage:true,
    max_concurrency:2,
    duty_cycle:'always_on',
    attestation:{mode:'device',device_identity:id+'-key'},
  });
  const agent=await startMicroSeedNativeAgent({
    manifest:local,
    stateDir:path.join(root,id+'-state'),
    authorizationToken:token,
    telemetryProvider:async()=>({
      primary_function_busy:false,
      cpu_utilization:0.05,
      memory_free_mb:900,
      temperature_c:31,
      battery_percent:null,
      external_power:true,
      network_utilization:null,
      observed_at:new Date().toISOString(),
      max_age_ms:60000,
    }),
  });
  const manifest=normalizeMicroDeviceManifest({
    ...local,
    endpoint:agent.url,
    observed_at:new Date().toISOString(),
  });
  registry.observe({device_id:id});
  registry.candidate({device_id:id,manifest});
  registry.authorize({
    device_id:id,
    approval_ref:'approve-'+id,
    expires_at:new Date(Date.now()+3600000).toISOString(),
    heartbeat_target_seconds:300,
    attestation_mode:'device',
    attestation_identity:id+'-key',
  });
  registry.heartbeat({
    device_id:id,
    capability_manifest_hash:manifest.manifest_hash,
    attestation_identity:id+'-key',
  });
  return {id,agent};
}

test('resident memory resilience protects then automatically recovers after edge-key and one-node loss',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-memory-resilience-organism-'));
  const registry=new AmbientDeviceRegistry({root:path.join(root,'registry')});
  const tokens={'vault-a':'a','vault-b':'b','vault-c':'c'};
  const nodes=[];
  let gateway=null;
  try{
    for(const id of Object.keys(tokens)){
      nodes.push(await addNode({root,registry,id,token:tokens[id]}));
    }
    const adapter=createMicroSeedNativeAgentAdapter({
      allowInsecureLan:true,
      timeoutMs:600,
      credentialResolver:async({device_id})=>tokens[device_id]||'',
    });
    gateway=await startMicroSeedGateway({
      registryRoot:path.join(root,'registry'),
      stateDir:path.join(root,'gateway-state'),
      authorizationToken:'gateway-token',
      bridgeAdapters:{native_agent:adapter},
    });
    for(const id of Object.keys(tokens)){
      const response=await fetch(gateway.url+'/v1/conformance',{
        method:'POST',
        headers:{authorization:'Bearer gateway-token','content-type':'application/json'},
        body:JSON.stringify({device_id:id}),
      });
      assert.equal(response.status,200);
      const body=await response.json();
      assert.deepEqual(body.verified_workloads,['systemia.secret-share-vault.v1']);
    }

    const original=ensureAmbientMemoryMasterKey(root);
    const first=await runAmbientMemoryResilienceOnce({
      root,
      gatewayUrl:gateway.url,
      gatewayToken:'gateway-token',
      minimumShareNodes:3,
      threshold:2,
      now:new Date(),
    });
    assert.equal(first.state,'protected');
    assert.equal(first.action,'protect_master_key');
    assert.equal(first.eligible_share_nodes,3);
    assert.equal(first.detail.distinct_device_count,3);
    assert.equal(first.replacement_key_generated_during_recovery,false);

    const second=await runAmbientMemoryResilienceOnce({
      root,
      gatewayUrl:gateway.url,
      gatewayToken:'gateway-token',
      minimumShareNodes:3,
      threshold:2,
      now:new Date(Date.now()+60_000),
    });
    assert.equal(second.state,'protected');
    assert.equal(second.action,'keep_current_generation');

    fs.rmSync(path.join(root,'.secrets','ambient-memory-master-key'),{force:true});
    const lost=nodes.shift();
    await lost.agent.close();

    const recovered=await runAmbientMemoryResilienceOnce({
      root,
      gatewayUrl:gateway.url,
      gatewayToken:'gateway-token',
      minimumShareNodes:3,
      threshold:2,
      now:new Date(Date.now()+120_000),
    });
    assert.equal(recovered.state,'recovered');
    assert.equal(recovered.action,'recover_master_key');
    assert.equal(recovered.local_master_key_present,true);
    assert.equal(recovered.detail.shares_used,2);
    assert.equal(recovered.detail.devices_used.includes(lost.id),false);
    assert.equal(recovered.replacement_key_generated_during_recovery,false);
    assert.equal(loadAmbientMemoryMasterKey(root).equals(original),true);
  }finally{
    if(gateway) await gateway.close();
    for(const n of nodes) await n.agent.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('resilience timer does not invent memory or a replacement key on an empty system',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-memory-resilience-empty-'));
  try{
    const receipt=await runAmbientMemoryResilienceOnce({
      root,
      gatewayUrl:'http://127.0.0.1:8791',
      gatewayToken:'token',
      minimumShareNodes:3,
      threshold:2,
      now:new Date(),
    });
    assert.equal(receipt.state,'idle_no_memory');
    assert.equal(receipt.action,'none');
    assert.equal(receipt.local_master_key_present,false);
    assert.equal(receipt.replacement_key_generated_during_recovery,false);
    assert.equal(fs.existsSync(path.join(root,'.secrets','ambient-memory-master-key')),false);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});
