import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AmbientDeviceRegistry } from '../systemia/saban/ambient-device-registry.mjs';
import { normalizeMicroDeviceManifest, microDeviceToAmbientCapabilities } from '../systemia/saban/microseed-device-bridge.mjs';
import { resolveAmbientComputeOffers } from '../systemia/saban/ambient-compute-fabric.mjs';
import { startMicroSeedNativeAgent } from '../systemia/saban/microseed-native-agent.mjs';
import { createMicroSeedNativeAgentAdapter } from '../systemia/saban/microseed-native-agent-adapter.mjs';
import { startMicroSeedGateway } from '../systemia/saban/microseed-gateway.mjs';
import { storeAmbientMemoryObject, readAmbientMemoryObject } from '../systemia/saban/ambient-memory-fabric.mjs';
import { protectAmbientMemoryMasterKey, recoverAmbientMemoryMasterKey } from '../systemia/saban/ambient-memory-key-resilience.mjs';

async function node({root,registry,id,token}){
  const local=normalizeMicroDeviceManifest({
    device_id:id,
    device_class:'mini-pc',
    bridge_mode:'native_agent',
    authorization_ref:'owner-'+id,
    endpoint:'http://127.0.0.1:1',
    supported_workloads:['systemia.blob-store.v1','systemia.secret-share-vault.v1'],
    resources:{cpu_units:1,memory_mb:2048,storage_gb:10},
    persistent_storage:true,
    max_concurrency:4,
    duty_cycle:'always_on',
    attestation:{mode:'device',device_identity:id+'-key'},
  });
  const agent=await startMicroSeedNativeAgent({
    manifest:local,
    stateDir:path.join(root,id+'-state'),
    authorizationToken:token,
    telemetryProvider:async()=>({
      primary_function_busy:false,cpu_utilization:0.05,memory_free_mb:1800,
      temperature_c:32,battery_percent:null,external_power:true,
      network_utilization:null,observed_at:new Date().toISOString(),max_age_ms:60000,
    }),
  });
  const manifest=normalizeMicroDeviceManifest({...local,endpoint:agent.url,observed_at:new Date().toISOString()});
  registry.observe({device_id:id});
  registry.candidate({device_id:id,manifest});
  registry.authorize({
    device_id:id,approval_ref:'approve-'+id,
    expires_at:new Date(Date.now()+3600000).toISOString(),
    heartbeat_target_seconds:300,attestation_mode:'device',attestation_identity:id+'-key',
  });
  registry.heartbeat({
    device_id:id,capability_manifest_hash:manifest.manifest_hash,attestation_identity:id+'-key',
  });
  return {id,agent,manifest};
}

test('2-of-3 distributed key shares recover ambient memory after key loss and one node loss',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-key-resilience-'));
  const registry=new AmbientDeviceRegistry({root:path.join(root,'registry')});
  const tokens={'key-a':'a-token','key-b':'b-token','key-c':'c-token'};
  const nodes=[];
  let gateway=null;
  try{
    for(const id of Object.keys(tokens)) nodes.push(await node({root,registry,id,token:tokens[id]}));
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
      const c=await response.json();
      assert.deepEqual(c.verified_workloads.sort(),[
        'systemia.blob-store.v1','systemia.secret-share-vault.v1'
      ]);
    }

    const snapshot=registry.list({now:new Date()});
    const capabilities=snapshot.rows.flatMap(row=>
      microDeviceToAmbientCapabilities(row.manifest,{conformance:row.conformance})
    );
    const blobOffers=resolveAmbientComputeOffers({
      capabilities,workloadClass:'systemia.blob-store.v1',
      requireZeroCost:true,requireVerifiedWorkload:true,now:new Date(),
    }).offers;
    const shareOffers=resolveAmbientComputeOffers({
      capabilities,workloadClass:'systemia.secret-share-vault.v1',
      requireZeroCost:true,requireVerifiedWorkload:true,now:new Date(),
    }).offers;
    assert.equal(blobOffers.length,3);
    assert.equal(shareOffers.length,3);

    const source=Buffer.from('recoverable-evercraft-memory '.repeat(1600));
    const stored=await storeAmbientMemoryObject({
      bytes:source,offers:blobOffers,gatewayUrl:gateway.url,gatewayToken:'gateway-token',
      stateDir:root,replication:2,chunkBytes:10*1024,
    });
    const protectedKey=await protectAmbientMemoryMasterKey({
      stateDir:root,offers:shareOffers,gatewayUrl:gateway.url,gatewayToken:'gateway-token',
      share_count:3,threshold:2,
    });
    assert.equal(protectedKey.threshold,2);
    assert.equal(protectedKey.share_count,3);
    assert.equal(protectedKey.distinct_device_count,3);
    assert.equal(protectedKey.master_key_exposed,false);
    assert.equal(protectedKey.share_values_exposed,false);

    fs.rmSync(path.join(root,'.secrets','ambient-memory-master-key'),{force:true});
    await assert.rejects(
      ()=>readAmbientMemoryObject({
        object_sha256:stored.object_sha256,gatewayUrl:gateway.url,gatewayToken:'gateway-token',stateDir:root
      }),
      /master_key_missing_recovery_required/
    );

    const lost=nodes.shift();
    await lost.agent.close();

    const recovered=await recoverAmbientMemoryMasterKey({
      stateDir:root,offers:shareOffers,gatewayUrl:gateway.url,gatewayToken:'gateway-token'
    });
    assert.equal(recovered.recovered,true);
    assert.equal(recovered.threshold,2);
    assert.equal(recovered.shares_used,2);
    assert.equal(recovered.master_key_exposed,false);
    assert.equal(recovered.devices_used.includes(lost.id),false);

    const read=await readAmbientMemoryObject({
      object_sha256:stored.object_sha256,gatewayUrl:gateway.url,gatewayToken:'gateway-token',stateDir:root
    });
    assert.equal(read.object_integrity_verified,true);
    assert.equal(read.bytes.equals(source),true);
  }finally{
    if(gateway) await gateway.close();
    for(const n of nodes) await n.agent.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});
