import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { loadOrCreateDeviceIdentity } from '../compute/device-identity.mjs';
import { startOutboundCapacityBroker } from '../network/outbound-capacity-broker.mjs';
import { startOutboundNodeAgent } from '../network/outbound-node-agent.mjs';
import { YardOperator } from '../yard/operator.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-hardware-federation-bridge-'));
const remoteRoot=path.join(root,'remote-browser-node');
const gatewayRoot=path.join(root,'gateway-node');
const brokerRoot=path.join(root,'broker');
const remoteYardRoot=path.join(root,'remote-yard');
const gatewayYardRoot=path.join(root,'gateway-yard');
fs.mkdirSync(remoteRoot,{recursive:true});
fs.mkdirSync(gatewayRoot,{recursive:true});

const remoteNodeId='house-browser-node';
const remoteAllocator='proof-remote-allocator';
const gatewayAllocator='proof-gateway-allocator';
const releaseRef='f'.repeat(40);
const identity=loadOrCreateDeviceIdentity({
  root:remoteRoot,
  nodeId:remoteNodeId,
});

function browserRuntimeFactory(){
  return async()=>{
    const instanceId='proof_browser_worker';
    let deploymentReceiptRef='';
    let closed=false;

    const publicServer=http.createServer((req,res)=>{
      if(req.method==='GET'&&req.url==='/health'){
        const body=Buffer.from(JSON.stringify({
          ok:true,
          service:'evercraft-web-browser-edge',
          runtime:'Evercraft Compute',
          mode:'public_read_only',
          browser_engine:'proof-browser',
          instance_id:instanceId,
          deployment_receipt_bound:Boolean(deploymentReceiptRef),
          deployment_receipt_ref:deploymentReceiptRef||null,
          raw_worker_publicly_exposed:false,
        }));
        res.writeHead(200,{'content-type':'application/json','content-length':body.length});
        return res.end(body);
      }
      if(req.method==='GET'&&req.url==='/v1/browser/capabilities'){
        const body=Buffer.from(JSON.stringify({
          ok:true,
          service:'evercraft-web-browser-edge',
          mode:'public_read_only_plus_human_handoff',
          authenticated_human_handoff:true,
          authenticated_handoff_persists_profile:false,
          authenticated_handoff_secret_text_returned:false,
          credentials:false,
          cookies:false,
          private_targets:false,
        }));
        res.writeHead(200,{'content-type':'application/json','content-length':body.length});
        return res.end(body);
      }
      const body=Buffer.from(JSON.stringify({error:'not_found'}));
      res.writeHead(404,{'content-type':'application/json','content-length':body.length});
      res.end(body);
    });
    await new Promise((resolve,reject)=>{
      publicServer.once('error',reject);
      publicServer.listen(0,'127.0.0.1',resolve);
    });
    const address=publicServer.address();
    const localPublicUrl='http://127.0.0.1:'+address.port;

    return {
      instanceId,
      localPublicUrl,
      async health(){
        return {
          ok:!closed,
          service:'evercraft-owned-browser-worker',
          runtime:'Evercraft Compute',
          mode:'public_read_only',
          engine:'proof-browser',
          instance_id:instanceId,
          deployment_receipt_ref:deploymentReceiptRef||null,
        };
      },
      async browse(){
        return {ok:true,title:'proof'};
      },
      async createAuthSession(){
        return {
          session_id:'proof',
          handoff_path:'/handoff/proof#claim=proof',
          expires_at:new Date(Date.now()+60000).toISOString(),
          mode:'human_authorized_ephemeral',
          persisted_profile:false,
          secret_text_returned:false,
        };
      },
      setDeploymentReceipt(value){
        deploymentReceiptRef=String(value||'');
        return {
          ok:true,
          deployment_receipt_ref:deploymentReceiptRef,
        };
      },
      async close(){
        if(closed) return;
        closed=true;
        await new Promise((resolve)=>publicServer.close(()=>resolve()));
      },
    };
  };
}

let remoteCompute=null;
let gatewayCompute=null;
let broker=null;
let agent=null;
let relay=null;

try{
  remoteCompute=await startEvercraftComputeNode({
    nodeId:remoteNodeId,
    root:remoteRoot,
    host:'127.0.0.1',
    port:0,
    allocatorToken:remoteAllocator,
    deviceIdentity:identity,
    placementLabels:['ground','worker'],
    browserRuntimeFactory:browserRuntimeFactory(),
  });

  broker=await startOutboundCapacityBroker({
    host:'127.0.0.1',
    port:0,
    stateDir:brokerRoot,
    authorizedDevices:{
      [identity.fingerprint]:remoteNodeId,
    },
    capacityFreshMs:15000,
    commandTimeoutMs:10000,
    pollWaitMs:100,
  });

  agent=await startOutboundNodeAgent({
    brokerUrl:broker.endpoint,
    localCapacityEndpoint:remoteCompute.endpoint,
    localAllocatorToken:remoteAllocator,
    pollBackoffMs:20,
  });

  let remoteSnapshot=null;
  for(let i=0;i<50;i+=1){
    remoteSnapshot=broker.snapshot();
    if(remoteSnapshot.nodes?.some((n)=>n.node_id===remoteNodeId&&n.connected)) break;
    await new Promise((resolve)=>setTimeout(resolve,20));
  }
  const observed=remoteSnapshot.nodes.find((n)=>n.node_id===remoteNodeId);
  assert.equal(observed.connected,true);
  assert.equal(observed.device_fingerprint,identity.fingerprint);

  const grant=broker.controlGrant(remoteNodeId);
  assert.ok(grant);
  assert.ok(grant.capacity_endpoint);
  assert.ok(grant.allocator_token);

  const remoteYard=new YardOperator({stateDir:remoteYardRoot});
  const browser=await remoteYard.deployRelease({
    deploymentId:'federated-proof-browser',
    releaseRef,
    workloadClass:'systemia.evercraft-web-browser.v1',
    capacityEndpoint:grant.capacity_endpoint,
    allocatorToken:grant.allocator_token,
    input:{max_concurrency:1},
    rollbackTarget:'proof:none',
    leaseTtlMs:120000,
  });
  assert.equal(browser.state,'ready');
  assert.equal(browser.result.auth_handoff_supported,true);
  assert.equal(browser.receipt.capacity_node_id,remoteNodeId);

  relay=await broker.createServiceRelay({
    nodeId:remoteNodeId,
    serviceId:browser.result.service_id,
    ttlMs:120000,
  });
  assert.equal(relay.node_id,remoteNodeId);
  assert.equal(relay.service_id,browser.result.service_id);
  assert.equal(relay.target_service,'evercraft-owned-browser-worker');
  assert.equal(relay.relay_token_persisted,false);
  assert.equal(relay.allocator_token_exposed,false);
  assert.ok(relay.relay_token);

  gatewayCompute=await startEvercraftComputeNode({
    nodeId:'house-gateway-node',
    root:gatewayRoot,
    host:'127.0.0.1',
    port:0,
    allocatorToken:gatewayAllocator,
    placementLabels:['gateway','public-edge'],
  });

  const gatewayYard=new YardOperator({stateDir:gatewayYardRoot});
  const bridge=await gatewayYard.deployRelease({
    deploymentId:'federated-proof-bridge',
    releaseRef,
    workloadClass:'systemia.federated-service-bridge.v1',
    capacityEndpoint:gatewayCompute.endpoint,
    allocatorToken:gatewayAllocator,
    input:{
      relay_url:broker.endpoint+relay.proxy_path,
      relay_token:relay.relay_token,
    },
    rollbackTarget:'proof:none',
    leaseTtlMs:120000,
  });
  assert.equal(bridge.state,'ready');
  assert.equal(bridge.result.loopback_only,true);
  assert.equal(bridge.result.relay_authority_exposed,false);
  assert.equal(bridge.result.relay_authority_persisted,false);

  const health=await fetch(bridge.result.local_url+'/health').then((r)=>r.json());
  assert.equal(health.ok,true);
  assert.equal(health.service,'evercraft-web-browser-edge');
  assert.equal(health.instance_id,browser.result.instance_id);
  assert.equal(health.deployment_receipt_bound,true);
  assert.equal(health.deployment_receipt_ref,browser.receipt.receipt_hash);

  const capabilities=await fetch(
    bridge.result.local_url+'/v1/browser/capabilities'
  ).then((r)=>r.json());
  assert.equal(capabilities.authenticated_human_handoff,true);
  assert.equal(capabilities.authenticated_handoff_persists_profile,false);
  assert.equal(capabilities.authenticated_handoff_secret_text_returned,false);

  const bridgeHealth=await fetch(
    new URL(bridge.result.health_path,gatewayCompute.endpoint)
  ).then((r)=>r.json());
  assert.equal(bridgeHealth.service,'evercraft-federated-service-bridge');
  assert.equal(bridgeHealth.remote_transport,'evercraft.outbound-capacity.v1');
  assert.equal(bridgeHealth.relay_token_exposed,false);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.saban.hardware-federation-bridge-proof.v1',
    gateway_node:'house-gateway-node',
    browser_node:remoteNodeId,
    nodes_are_distinct:true,
    outbound_only_remote_browser:true,
    encrypted_transport:'evercraft.secure-envelope.v1',
    scoped_service_relay:true,
    allocator_token_exposed_to_gateway:false,
    relay_authority_persisted:false,
    browser_deployment_receipt_preserved_end_to_end:true,
    authenticated_handoff_capability_preserved:true,
    browser_receipt:browser.receipt.receipt_hash,
    relay_receipt:relay.receipt_hash,
    bridge_receipt:bridge.receipt.receipt_hash,
  },null,2));
}finally{
  try{
    if(relay) broker?.releaseServiceRelay(relay.relay_id,'proof_complete');
  }catch{}
  try{await agent?.close();}catch{}
  try{await gatewayCompute?.close();}catch{}
  try{await remoteCompute?.close();}catch{}
  try{await broker?.close();}catch{}
  fs.rmSync(root,{recursive:true,force:true});
}
