import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { startPublicEdgeRuntime } from '../network/public-edge-runtime.mjs';
import { YardOperator } from './operator.mjs';
import { BrowserEdgeAttachment } from './browser-edge-attachment.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'browser-edge-attachment-proof-'));
let closed=false;
let deploymentReceipt='';

const browserRuntimeFactory=async()=>{
  const runtime={
    instanceId:'browser-edge-attachment-proof-instance',
    localPublicUrl:null,
    async health(){
      return {
        ok:!closed,
        service:'evercraft-owned-browser-worker',
        engine:'evercraft-owned-browser-worker-v1',
        mode:'public_read_only',
        runtime:'Evercraft Compute',
        instance_id:this.instanceId,
        deployment_receipt_ref:deploymentReceipt||null,
      };
    },
    async browse(job){
      const target=String(job?.url||'');
      if(target.includes('127.0.0.1')) throw new Error('private_or_reserved_target');
      const evidence={mode:'public_read_only',final_url:target,title:'Browser attachment proof'};
      return {
        ok:true,
        ...evidence,
        snapshot:{title:evidence.title,text:'browser attachment proof',headings:[],links:[]},
        evidence_receipt_sha256:crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex'),
      };
    },
    setDeploymentReceipt(value){
      deploymentReceipt=String(value||'');
      return {ok:true,deployment_receipt_ref:deploymentReceipt};
    },
    async close(){closed=true;},
  };

  const { startBrowserPublicAdapter }=await import('../evercraft-web/browser-worker/public-adapter.mjs');
  const adapter=await startBrowserPublicAdapter({runtime,host:'127.0.0.1',port:0});
  runtime.localPublicUrl=adapter.url;
  const originalClose=runtime.close.bind(runtime);
  runtime.close=async()=>{await adapter.close();await originalClose();};
  return runtime;
};

const compute=await startEvercraftComputeNode({
  root:path.join(root,'compute'),
  nodeId:'browser-edge-attachment-proof-node',
  browserRuntimeFactory,
});
const yard=new YardOperator({stateDir:path.join(root,'yard')});
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

const attachment=new BrowserEdgeAttachment({
  yard,
  stateDir:path.join(root,'browser-edge'),
  providerClient,
  allowLoopbackProof:true,
  leaseTtlMs:120000,
  renewEveryMs:60000,
  intervalMs:30000,
});

try{
  const provisioned=await attachment.provision({
    releaseRef:'7'.repeat(40),
    capacityEndpoint:compute.endpoint,
    requestedHostname:'evercraft-browser',
    maxConcurrency:2,
  });

  assert.equal(provisioned.action,'provisioned');
  assert.equal(provisioned.workload_class,'systemia.evercraft-web-browser.v1');
  assert.equal(provisioned.route_scope,'loopback_proof');
  assert.equal(provisioned.route_verified,false);
  assert.equal(provisioned.raw_worker_publicly_exposed,false);
  assert.match(provisioned.deployment_receipt,/^[a-f0-9]{64}$/);
  assert.match(provisioned.route_binding_receipt,/^sha256:[a-f0-9]{64}$/);

  const binding=attachment.binding;
  assert.ok(binding?.origin);

  const health=await fetch(binding.origin+'/health').then(r=>r.json());
  assert.equal(health.ok,true);
  assert.equal(health.service,'evercraft-web-browser-edge');
  assert.equal(health.deployment_receipt_bound,true);
  assert.equal(health.raw_worker_publicly_exposed,false);

  const render=await fetch(binding.origin+'/v1/browser/render',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({url:'https://example.com/'}),
  }).then(r=>r.json());
  assert.equal(render.ok,true);
  assert.match(render.result.evidence_receipt_sha256,/^[a-f0-9]{64}$/);

  const stopped=await attachment.close({reason:'proof_complete'});
  assert.equal(stopped.action,'stopped');
  assert.equal(closed,true);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.yard.browser-edge-attachment-proof.v1',
    shared_public_edge:true,
    browser_deployed_as_resident_workload:true,
    loopback_route_bound:true,
    deployment_receipt_bound:true,
    raw_worker_publicly_exposed:false,
    render_crossed_shared_edge:true,
    public_https_promotion_required:true,
  },null,2));
}finally{
  try{await attachment.close({reason:'proof_finally'});}catch{}
  await edge.close().catch(()=>{});
  await compute.close().catch(()=>{});
  fs.rmSync(root,{recursive:true,force:true});
}
