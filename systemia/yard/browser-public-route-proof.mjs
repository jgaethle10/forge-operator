import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { startPublicEdgeRuntime } from '../network/public-edge-runtime.mjs';
import { startBrowserPublicAdapter } from '../evercraft-web/browser-worker/public-adapter.mjs';
import { YardOperator } from './operator.mjs';
import { YardPublicRouteBroker } from './public-route-broker.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'yard-browser-public-route-'));
const computeRoot=path.join(root,'compute');
const stateDir=path.join(root,'yard');
fs.mkdirSync(computeRoot,{recursive:true});

let closed=false;
let receiptRef='';
let browseCount=0;
const instanceId='browser-public-route-proof';

const browserRuntimeFactory=async()=>{
  const runtime={
    instanceId,
    async health(){
      return {
        ok:!closed,
        service:'evercraft-owned-browser-worker',
        engine:'evercraft-owned-browser-worker-v1',
        mode:'public_read_only',
        runtime:'Evercraft Compute',
        instance_id:instanceId,
        deployment_receipt_ref:receiptRef||null,
      };
    },
    async browse(job){
      const url=new URL(String(job?.url||''));
      if(
        url.hostname==='localhost' ||
        url.hostname==='127.0.0.1' ||
        url.hostname.endsWith('.local')
      ){
        throw new Error('private_or_reserved_target');
      }
      browseCount+=1;
      const evidence={
        engine:'evercraft-owned-browser-worker-v1',
        mode:'public_read_only',
        requested_url:url.toString(),
        final_url:url.toString(),
        title:'Browser public route proof',
        text_sha256:crypto.createHash('sha256').update('browser public route proof').digest('hex'),
        started_at:new Date().toISOString(),
        finished_at:new Date().toISOString(),
      };
      return {
        ok:true,
        ...evidence,
        snapshot:{
          title:'Browser public route proof',
          text:'browser public route proof',
          headings:[],
          links:[],
        },
        evidence_receipt_sha256:crypto
          .createHash('sha256')
          .update(JSON.stringify(evidence))
          .digest('hex'),
      };
    },
    setDeploymentReceipt(value){
      receiptRef=String(value||'');
      return {
        ok:true,
        service:'evercraft-owned-browser-worker',
        runtime:'Evercraft Compute',
        instance_id:instanceId,
        deployment_receipt_ref:receiptRef,
      };
    },
    async close(){},
  };

  const adapter=await startBrowserPublicAdapter({
    runtime,
    host:'127.0.0.1',
    port:0,
    maxRequestsPerMinute:30,
  });
  runtime.localPublicUrl=adapter.url;
  runtime.close=async()=>{
    if(closed) return;
    closed=true;
    await adapter.close();
  };
  return runtime;
};

const node=await startEvercraftComputeNode({
  root:computeRoot,
  nodeId:'browser-public-route-proof-node',
  browserRuntimeFactory,
});
const yard=new YardOperator({stateDir});
const edge=await startPublicEdgeRuntime({
  mode:'proof_loopback',
  controlHost:'127.0.0.1',
  controlPort:0,
  publicHost:'127.0.0.1',
  publicPort:0,
  allowPrivateUpstream:false,
});
const providerClient={
  capabilities:async()=>edge.capabilities(),
  createLease:async(route)=>edge.createRouteLease(route),
  releaseLease:async(id,reason)=>edge.releaseRouteLease(id,reason),
};

try{
  const releaseRef='8'.repeat(40);
  const deployment=await yard.deployRelease({
    deploymentId:'evercraft-browser-public-route-proof',
    releaseRef,
    workloadClass:'systemia.evercraft-web-browser.v1',
    capacityEndpoint:node.endpoint,
    input:{max_concurrency:2},
    rollbackTarget:'proof:previous-browser-worker',
    leaseTtlMs:120_000,
  });

  assert.equal(deployment.state,'ready');
  assert.equal(deployment.result.private_worker_endpoint_exposed,false);
  assert.match(deployment.result.local_url,/^http:\/\/127\.0\.0\.1:/);
  assert.equal(receiptRef,deployment.receipt.receipt_hash);

  const broker=new YardPublicRouteBroker({
    yard,
    providerClient,
    allowLoopbackProof:true,
  });
  const binding=await broker.bindDeployment(
    'evercraft-browser-public-route-proof',
    {
      requestedHostname:'evercraft-browser',
      ttlMs:120_000,
    }
  );

  assert.equal(binding.route_scope,'loopback_proof');
  assert.equal(binding.workload_class,'systemia.evercraft-web-browser.v1');
  assert.match(binding.origin,/^http:\/\/127\.0\.0\.1:/);

  const health=await fetch(binding.origin+'/health').then(r=>r.json());
  assert.equal(health.ok,true);
  assert.equal(health.service,'evercraft-web-browser-edge');
  assert.equal(health.runtime,'Evercraft Compute');
  assert.equal(health.instance_id,instanceId);
  assert.equal(health.deployment_receipt_bound,true);
  assert.equal(health.deployment_receipt_ref,deployment.receipt.receipt_hash);
  assert.equal(health.raw_worker_publicly_exposed,false);

  const renderResponse=await fetch(binding.origin+'/v1/browser/render',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({url:'https://example.com/'}),
  });
  assert.equal(renderResponse.status,200);
  const rendered=await renderResponse.json();
  assert.equal(rendered.ok,true);
  assert.equal(rendered.result.mode,'public_read_only');
  assert.match(rendered.result.evidence_receipt_sha256,/^[a-f0-9]{64}$/);
  assert.equal(browseCount,1);

  const privateResponse=await fetch(binding.origin+'/v1/browser/render',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({url:'http://127.0.0.1/'}),
  });
  assert.equal(privateResponse.status,400);
  const privateBody=await privateResponse.json();
  assert.equal(privateBody.error,'private_or_reserved_target');

  const released=await broker.releaseBinding(binding,{reason:'proof_complete'});
  assert.equal(released.released,true);

  const stopped=await yard.stopDeployment(
    'evercraft-browser-public-route-proof',
    {reason:'proof_complete'}
  );
  assert.equal(stopped.ok,true);
  assert.equal(closed,true);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.yard.browser-public-route-proof.v1',
    workload_class:'systemia.evercraft-web-browser.v1',
    route_scope:binding.route_scope,
    deployment_receipt_bound:true,
    raw_worker_publicly_exposed:false,
    public_adapter_health_verified:true,
    public_render_crossed_edge:true,
    private_target_rejection_crossed_edge:true,
    evidence_receipt:rendered.result.evidence_receipt_sha256,
    route_binding_receipt:binding.receipt_hash,
    route_release_receipt:released.receipt_hash,
  },null,2));
}finally{
  await edge.close().catch(()=>{});
  await node.close().catch(()=>{});
  fs.rmSync(root,{recursive:true,force:true});
}
