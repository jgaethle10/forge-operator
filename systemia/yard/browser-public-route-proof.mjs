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
let authSessionCount=0;
let authRedeemed=false;
let authClosed=false;
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
    async createAuthSession(job={}){
      const target=new URL(String(job?.url||''));
      if(target.hostname==='localhost'||target.hostname==='127.0.0.1'||target.hostname.endsWith('.local')){
        throw new Error('private_or_reserved_target');
      }
      authSessionCount+=1;
      return {
        session_id:'browser-edge-auth-proof',
        handoff_path:'/handoff/browser-edge-auth-proof#claim=edge-proof-claim',
        expires_at:new Date(Date.now()+60_000).toISOString(),
        mode:'human_authorized_ephemeral',
        persisted_profile:false,
        secret_text_returned:false,
      };
    },
    async authHandoffPage(sessionId){
      return '<!doctype html><title>Evercraft Control Room</title><main>session '+sessionId+'</main>';
    },
    async authRedeem(sessionId,claim){
      if(sessionId!=='browser-edge-auth-proof'||claim!=='edge-proof-claim'){
        throw new Error('authenticated_browser_claim_invalid');
      }
      if(authRedeemed) throw new Error('authenticated_browser_claim_already_redeemed');
      authRedeemed=true;
      return {
        ok:true,
        session_id:sessionId,
        access_token:'edge-proof-access',
        claim_redeemed:true,
        expires_at:new Date(Date.now()+60_000).toISOString(),
      };
    },
    async authSnapshot(sessionId,access){
      if(sessionId!=='browser-edge-auth-proof'||access!=='edge-proof-access'){
        throw new Error('authenticated_browser_access_invalid');
      }
      return {
        ok:true,
        session_id:sessionId,
        title:'Evercraft browser edge auth proof',
        url:'https://example.com/',
        origin:'https://example.com',
        secure_transport:true,
        viewport:{width:1280,height:800},
        screenshot_base64:'cHJvb2Y=',
        screenshot_sha256:crypto.createHash('sha256').update('proof').digest('hex'),
        expires_at:new Date(Date.now()+60_000).toISOString(),
        mode:'human_authorized_ephemeral',
      };
    },
    async authAction(sessionId,access,action){
      if(sessionId!=='browser-edge-auth-proof'||access!=='edge-proof-access'){
        throw new Error('authenticated_browser_access_invalid');
      }
      return {
        ok:true,
        session_id:sessionId,
        type:String(action?.type||''),
        action_count:1,
        secret_text_recorded:false,
        expires_at:new Date(Date.now()+60_000).toISOString(),
      };
    },
    async authClose(sessionId,access){
      if(sessionId!=='browser-edge-auth-proof'||access!=='edge-proof-access'){
        throw new Error('authenticated_browser_access_invalid');
      }
      authClosed=true;
      return {ok:true,closed:true,session_id:sessionId};
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

  const authHandoff=await yard.createBrowserAuthHandoff(
    'evercraft-browser-public-route-proof',
    {url:'https://example.com/'}
  );
  assert.equal(authHandoff.ok,true);
  assert.equal(authHandoff.result.session_id,'browser-edge-auth-proof');
  assert.equal(authHandoff.result.public_route_verified,false);
  assert.equal(authHandoff.result.handoff_url,null);
  assert.match(authHandoff.result.handoff_path,/^\/handoff\/browser-edge-auth-proof#claim=/);
  assert.equal(authSessionCount,1);

  const handoffUrl=new URL(authHandoff.result.handoff_path,binding.origin);
  const claim=new URLSearchParams(handoffUrl.hash.slice(1)).get('claim');
  assert.equal(claim,'edge-proof-claim');
  handoffUrl.hash='';

  const handoffPage=await fetch(handoffUrl).then(r=>r.text());
  assert.match(handoffPage,/Evercraft Control Room/);

  const authSnapshot=await fetch(
    binding.origin+'/v1/auth-browser/sessions/browser-edge-auth-proof/snapshot',
    {headers:{'x-evercraft-browser-claim':claim}}
  ).then(r=>r.json());
  assert.equal(authSnapshot.ok,true);
  assert.equal(authSnapshot.secure_transport,true);
  assert.match(authSnapshot.screenshot_sha256,/^[a-f0-9]{64}$/);

  const authAction=await fetch(
    binding.origin+'/v1/auth-browser/sessions/browser-edge-auth-proof/action',
    {
      method:'POST',
      headers:{
        'content-type':'application/json',
        'x-evercraft-browser-claim':claim,
      },
      body:JSON.stringify({type:'reload'}),
    }
  ).then(r=>r.json());
  assert.equal(authAction.ok,true);
  assert.equal(authAction.type,'reload');
  assert.equal(authAction.secret_text_recorded,false);

  const authClose=await fetch(
    binding.origin+'/v1/auth-browser/sessions/browser-edge-auth-proof',
    {
      method:'DELETE',
      headers:{'x-evercraft-browser-claim':claim},
    }
  ).then(r=>r.json());
  assert.equal(authClose.closed,true);
  assert.equal(authClosed,true);

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
    authenticated_handoff_created_through_private_yard:true,
    loopback_proof_not_misrepresented_as_public_https:true,
    authenticated_handoff_crossed_public_edge:true,
    authenticated_handoff_claim_enforced:true,
    authenticated_handoff_close_destroyed_session:true,
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
