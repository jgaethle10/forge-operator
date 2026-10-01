import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AmbientDeviceRegistry } from '../systemia/saban/ambient-device-registry.mjs';
import {
  normalizeMicroDeviceManifest,
  microDeviceToAmbientCapabilities,
} from '../systemia/saban/microseed-device-bridge.mjs';
import { resolveAmbientComputeOffers } from '../systemia/saban/ambient-compute-fabric.mjs';
import { startMicroSeedNativeAgent } from '../systemia/saban/microseed-native-agent.mjs';
import { createMicroSeedNativeAgentAdapter } from '../systemia/saban/microseed-native-agent-adapter.mjs';
import { startMicroSeedGateway } from '../systemia/saban/microseed-gateway.mjs';
import {
  storeAmbientMemoryObject,
  readAmbientMemoryObject,
} from '../systemia/saban/ambient-memory-fabric.mjs';

async function enrollStorage({root,registry,id,token}){
  const localManifest=normalizeMicroDeviceManifest({
    device_id:id,
    device_class:'mini-pc',
    bridge_mode:'native_agent',
    authorization_ref:'owner-'+id,
    endpoint:'http://127.0.0.1:1',
    supported_workloads:['systemia.blob-store.v1'],
    resources:{cpu_units:1,memory_mb:2048,storage_gb:10},
    placement_labels:['ambient-storage'],
    persistent_storage:true,
    max_concurrency:4,
    duty_cycle:'always_on',
    cpu_utilization_ceiling:0.9,
    memory_reserve_mb:128,
    attestation:{mode:'device',device_identity:id+'-key'},
  });
  const agent=await startMicroSeedNativeAgent({
    manifest:localManifest,
    stateDir:path.join(root,id+'-device-state'),
    authorizationToken:token,
    telemetryProvider:async()=>({
      primary_function_busy:false,
      cpu_utilization:0.05,
      memory_free_mb:1800,
      temperature_c:33,
      battery_percent:null,
      external_power:true,
      network_utilization:null,
      observed_at:new Date().toISOString(),
      max_age_ms:60000,
    }),
  });
  const manifest=normalizeMicroDeviceManifest({
    ...localManifest,
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
  return {agent,manifest};
}

test('Saban stores encrypted replicated memory across two MicroSeeds and reconstructs exactly',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-memory-fabric-'));
  const registry=new AmbientDeviceRegistry({root:path.join(root,'registry')});
  const tokens={'storage-a':'token-a','storage-b':'token-b'};
  const nodes=[];
  let gateway=null;
  try{
    nodes.push(await enrollStorage({root,registry,id:'storage-a',token:tokens['storage-a']}));
    nodes.push(await enrollStorage({root,registry,id:'storage-b',token:tokens['storage-b']}));

    const adapter=createMicroSeedNativeAgentAdapter({
      allowInsecureLan:true,
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
      assert.deepEqual(body.verified_workloads,['systemia.blob-store.v1']);
    }

    const snapshot=registry.list({now:new Date()});
    const capabilities=snapshot.rows.flatMap(row=>
      microDeviceToAmbientCapabilities(row.manifest,{conformance:row.conformance})
    );
    const offers=resolveAmbientComputeOffers({
      capabilities,
      workloadClass:'systemia.blob-store.v1',
      requireZeroCost:true,
      requireVerifiedWorkload:true,
      now:new Date(),
    }).offers;
    assert.equal(offers.length,2);

    const source=Buffer.from(
      'Evercraft memory fabric test payload '.repeat(2500),
      'utf8'
    );
    const stored=await storeAmbientMemoryObject({
      bytes:source,
      offers,
      gatewayUrl:gateway.url,
      gatewayToken:'gateway-token',
      stateDir:root,
      replication:2,
      chunkBytes:12*1024,
      now:new Date(),
    });
    assert.equal(stored.replication,2);
    assert.ok(stored.chunk_count>1);
    assert.equal(stored.encryption.plaintext_persisted_on_storage_nodes,false);
    assert.ok(stored.chunks.every(c=>c.replicas.length===2));
    assert.ok(stored.chunks.every(c=>new Set(c.replicas.map(r=>r.device_id)).size===2));

    const read=await readAmbientMemoryObject({
      object_sha256:stored.object_sha256,
      gatewayUrl:gateway.url,
      gatewayToken:'gateway-token',
      stateDir:root,
    });
    assert.equal(read.object_integrity_verified,true);
    assert.equal(read.bytes.equals(source),true);
    assert.equal(read.plaintext_on_storage_nodes,false);

    const again=await storeAmbientMemoryObject({
      bytes:source,
      offers,
      gatewayUrl:gateway.url,
      gatewayToken:'gateway-token',
      stateDir:root,
      replication:2,
    });
    assert.equal(again.deduplicated_object,true);
  }finally{
    if(gateway) await gateway.close();
    for(const node of nodes) await node.agent.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('ambient memory read fails over when first replica is unavailable',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-memory-failover-'));
  const registry=new AmbientDeviceRegistry({root:path.join(root,'registry')});
  const tokens={'storage-a':'token-a','storage-b':'token-b'};
  const nodes=[];
  let gateway=null;
  try{
    nodes.push(await enrollStorage({root,registry,id:'storage-a',token:tokens['storage-a']}));
    nodes.push(await enrollStorage({root,registry,id:'storage-b',token:tokens['storage-b']}));
    const adapter=createMicroSeedNativeAgentAdapter({
      allowInsecureLan:true,
      credentialResolver:async({device_id})=>tokens[device_id]||'',
      timeoutMs:500,
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
      await response.json();
    }
    const snapshot=registry.list({now:new Date()});
    const capabilities=snapshot.rows.flatMap(row=>
      microDeviceToAmbientCapabilities(row.manifest,{conformance:row.conformance})
    );
    const offers=resolveAmbientComputeOffers({
      capabilities,
      workloadClass:'systemia.blob-store.v1',
      requireVerifiedWorkload:true,
      now:new Date(),
    }).offers;

    const source=Buffer.from('replica-failover-proof '.repeat(1000));
    const stored=await storeAmbientMemoryObject({
      bytes:source,
      offers,
      gatewayUrl:gateway.url,
      gatewayToken:'gateway-token',
      stateDir:root,
      replication:2,
      chunkBytes:8*1024,
    });

    const firstReplicaDevice=stored.chunks[0].replicas[0].device_id;
    const doomed=nodes.find(n=>n.manifest.device_id===firstReplicaDevice);
    await doomed.agent.close();
    nodes.splice(nodes.indexOf(doomed),1);

    const read=await readAmbientMemoryObject({
      object_sha256:stored.object_sha256,
      gatewayUrl:gateway.url,
      gatewayToken:'gateway-token',
      stateDir:root,
    });
    assert.equal(read.object_integrity_verified,true);
    assert.equal(read.bytes.equals(source),true);
    assert.equal(read.replica_failover_supported,true);
  }finally{
    if(gateway) await gateway.close();
    for(const node of nodes) await node.agent.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});
