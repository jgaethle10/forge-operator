import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { acquireResourceCapacity } from './resource-acquirer.mjs';
import { discoverResourceFieldCandidates } from './resource-discovery.mjs';

async function freeUdpPort(){
  const socket=dgram.createSocket('udp4');
  await new Promise((resolve,reject)=>{
    socket.once('error',reject);
    socket.bind(0,'127.0.0.1',resolve);
  });
  const address=socket.address();
  const port=typeof address==='object'?address.port:0;
  await new Promise((resolve)=>socket.close(resolve));
  return port;
}

const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-resource-discovery-'));
const port=await freeUdpPort();
const token='resource-discovery-proof-secret';
const seed=await startNodeSeed({
  root:path.join(root,'node'),
  nodeId:'resource-discovery-proof-node',
  host:'127.0.0.1',
  port:0,
  advertiseHost:'127.0.0.1',
  allocatorToken:token,
  placementLabels:['worker'],
  announce:true,
  announceAddress:'127.0.0.1',
  announcePort:port,
  announceIntervalMs:75,
});

try{
  const need={
    need_id:'live-resource-discovery-proof',
    workload_class:'saban.multiplier-assignment.v1',
    topology:'single_node',
    memory_semantics:'local',
    resources:{
      cpu_units:1,
      memory_mb:64,
      storage_gb:0,
      gpu_units:0,
      vram_mb:0,
    },
    required_labels:['worker'],
  };

  const discovery=await discoverResourceFieldCandidates({
    need,
    allocatorTokens:{'resource-discovery-proof-node':token},
    discovery:{
      bindAddress:'127.0.0.1',
      multicastAddress:'127.0.0.1',
      port,
      timeoutMs:350,
      joinMulticast:false,
    },
    timeoutMs:1500,
  });

  assert.equal(discovery.discovered_count,1);
  assert.equal(discovery.attested_authorized_count,1);
  assert.equal(discovery.candidates[0].candidate_id,'resource-discovery-proof-node');
  assert.equal(discovery.candidates[0].attested,true);
  assert.equal(discovery.candidates[0].authority,'explicit_grant');
  assert.ok(discovery.candidates[0].resources.cpu_units>=1);
  assert.ok(discovery.candidates[0].resources.memory_mb>=64);
  assert.equal(JSON.stringify(discovery).includes(token),false);

  const acquired=await acquireResourceCapacity({
    need,
    candidates:discovery.candidates,
    runtimeAuthorities:discovery.runtime_authorities,
    marketAdapters:[],
  });
  assert.equal(acquired.state,'ready');
  assert.equal(acquired.mode,'resource_field');
  assert.equal(acquired.execution_leases.length,1);
  assert.equal(
    acquired.execution_leases[0].runtime_authority.allocator_token,
    token
  );
  assert.equal(JSON.stringify(acquired).includes(token),false);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.saban.resource-discovery-proof.v1',
    beacon_discovered:true,
    live_capacity_verified:true,
    allocator_authority_required:true,
    device_attested:true,
    hardware_ingested:true,
    resource_field_candidate_created:true,
    secret_not_serialized:true,
  },null,2));
}finally{
  await seed.close();
  fs.rmSync(root,{recursive:true,force:true});
}
