import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadOrCreateDeviceIdentity } from '../compute/device-identity.mjs';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { RemoteAdmissionKeeper } from '../compute/remote-admission-keeper.mjs';
import { SabanPublicGatewayAppliance } from './public-gateway-appliance.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-public-gateway-proof-'));
const remoteRoot=path.join(root,'remote');
const gatewayRoot=path.join(root,'gateway');
fs.mkdirSync(remoteRoot,{recursive:true});
fs.mkdirSync(gatewayRoot,{recursive:true});

const nodeId='chromebook-proof-node';
const allocator='proof-'+('a'.repeat(64));
const identity=loadOrCreateDeviceIdentity({root:remoteRoot,nodeId});

let remote=null;
let admission=null;
let gateway=null;

try{
  remote=await startEvercraftComputeNode({
    nodeId,
    root:remoteRoot,
    host:'127.0.0.1',
    port:0,
    allocatorToken:allocator,
    deviceIdentity:identity,
    placementLabels:['private','outbound-only','personal-compute'],
  });

  gateway=new SabanPublicGatewayAppliance({
    stateDir:gatewayRoot,
    gatewayNodeId:'saban-gateway-proof',
    releaseRef:'f'.repeat(40),
    domain:'fabric.example.test',
    brokerHost:'127.0.0.1',
    brokerPort:0,
    brokerAdvertiseHost:'127.0.0.1',
    bridgePort:0,
    commissioning:true,
    commissioningMs:60_000,
    reconcileMs:50,
    leaseTtlMs:120_000,
    renewEveryMs:60_000,
  });
  await gateway.start();

  admission=new RemoteAdmissionKeeper({
    brokerUrl:gateway.status().broker_endpoint,
    localCapacityEndpoint:remote.endpoint,
    localAllocatorToken:allocator,
    retryBaseMs:50,
    retryMaxMs:250,
    enrollmentRequestCooldownMs:100,
  });
  admission.start();

  const deadline=Date.now()+15_000;
  while(Date.now()<deadline&&!gateway.status().ok){
    await new Promise((resolve)=>setTimeout(resolve,50));
  }

  const status=gateway.status();
  assert.equal(status.ok,true);
  assert.equal(status.selected_remote_node_id,nodeId);
  assert.equal(status.authorized_device_count,1);
  assert.equal(status.connected_node_count,1);
  assert.equal(status.chromeos_host_forward_required,false);
  assert.equal(status.named_cloud_required,false);
  assert.ok(status.last_authorization_receipt);

  const health=await fetch(status.bridge_origin+'/health').then((r)=>r.json());
  assert.equal(health.ok,true);
  assert.equal(health.service,'evercraft-fabric-local');
  assert.equal(health.runtime,'Evercraft Compute');
  assert.equal(health.base44_transport_enabled,false);
  assert.equal(health.edge_attestation_supported,true);

  const init=await fetch(status.bridge_origin+'/mcp',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      jsonrpc:'2.0',
      id:1,
      method:'initialize',
      params:{
        protocolVersion:'2025-03-26',
        capabilities:{},
        clientInfo:{name:'saban-public-gateway-proof',version:'1'},
      },
    }),
  }).then((r)=>r.json());
  assert.equal(init.result.serverInfo.name,'evercraft-fabric');

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.saban.public-gateway-proof.v1',
    zero_touch_local_broker_discovery_path:true,
    bounded_single_device_commissioning:true,
    private_chromebook_compute:true,
    gateway_public_ingress_separated:true,
    chromeos_host_forward_required:false,
    named_cloud_required:false,
    remote_node_id:nodeId,
    device_fingerprint:identity.fingerprint,
  },null,2));
}finally{
  try{await admission?.close();}catch{}
  try{await gateway?.close();}catch{}
  try{await remote?.close();}catch{}
  fs.rmSync(root,{recursive:true,force:true});
}
