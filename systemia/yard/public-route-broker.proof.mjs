import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { YardOperator } from './operator.mjs';
import { YardPublicRouteBroker } from './public-route-broker.mjs';

function send(res,status,body){
  const data=Buffer.from(JSON.stringify(body));
  res.writeHead(status,{'content-type':'application/json','content-length':data.length});
  res.end(data);
}
async function readJson(req){
  const chunks=[];
  for await(const chunk of req) chunks.push(chunk);
  const raw=Buffer.concat(chunks).toString('utf8');
  return raw?JSON.parse(raw):{};
}
async function startProvider(){
  const leases=new Map();
  let releaseCount=0;
  let corruptNext=false;
  const server=http.createServer(async(req,res)=>{
    if(req.method==='GET'&&req.url==='/v1/public-route/capabilities'){
      return send(res,200,{
        protocol:'evercraft.public-route.v1',
        provider:'proof-route-provider',
        https_required:false,
        lease_supported:true,
      });
    }
    if(req.method==='POST'&&req.url==='/v1/public-route/leases'){
      const body=await readJson(req);
      const id='route_lease_'+(leases.size+1);
      const lease={
        protocol:'evercraft.public-route.v1',
        lease_id:id,
        origin:body.upstream_origin,
        deployment_receipt_hash:body.deployment_receipt_hash,
        instance_id:corruptNext?'wrong-instance':body.instance_id,
      };
      corruptNext=false;
      leases.set(id,lease);
      return send(res,201,lease);
    }
    const release=req.url?.match(/^\/v1\/public-route\/leases\/([^/]+)\/release$/);
    if(req.method==='POST'&&release){
      releaseCount++;
      leases.delete(release[1]);
      return send(res,200,{ok:true,released:true});
    }
    send(res,404,{error:'not_found'});
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const address=server.address();
  return {
    endpoint:`http://127.0.0.1:${address.port}`,
    corruptNext:()=>{corruptNext=true;},
    releaseCount:()=>releaseCount,
    close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve())),
  };
}

const root=fs.mkdtempSync(path.join(os.tmpdir(),'yard-route-broker-proof-'));
const compute=await startEvercraftComputeNode({
  root:path.join(root,'compute'),
  nodeId:'route-broker-proof-node',
});
const yard=new YardOperator({stateDir:path.join(root,'yard')});
const provider=await startProvider();

try{
  const deployment=await yard.deployRelease({
    deploymentId:'route-broker-specialist-proof',
    releaseRef:'39840bb7f068551d41b513750c66d72f6310ad92',
    workloadClass:'systemia.specialist-handoff-mcp.v1',
    capacityEndpoint:compute.endpoint,
    input:{gateway_url:'https://example.invalid/machine-commerce'},
    rollbackTarget:'proof:previous-specialist-runtime',
    leaseTtlMs:120000,
  });

  const broker=new YardPublicRouteBroker({
    yard,
    providerEndpoint:provider.endpoint,
    allowLoopbackProof:true,
  });
  const binding=await broker.bindDeployment('route-broker-specialist-proof');

  assert.equal(binding.schema,'evercraft.yard.public-route-binding.v1');
  assert.equal(binding.provider,'proof-route-provider');
  assert.equal(binding.route_scope,'loopback_proof');
  assert.equal(binding.route_verified,false);
  assert.equal(binding.deployment_receipt_hash,deployment.receipt.receipt_hash);
  assert.equal(binding.instance_id,deployment.result.instance_id);

  const second=await yard.deployRelease({
    deploymentId:'route-broker-mismatch-proof',
    releaseRef:'39840bb7f068551d41b513750c66d72f6310ad92',
    workloadClass:'systemia.specialist-handoff-mcp.v1',
    capacityEndpoint:compute.endpoint,
    input:{gateway_url:'https://example.invalid/machine-commerce'},
    rollbackTarget:'proof:previous-specialist-runtime',
    leaseTtlMs:120000,
  });
  assert.equal(second.state,'ready');
  provider.corruptNext();
  const before=provider.releaseCount();
  await assert.rejects(
    broker.bindDeployment('route-broker-mismatch-proof'),
    /public_route_instance_mismatch/
  );
  assert.equal(provider.releaseCount(),before);

  await yard.stopDeployment('route-broker-specialist-proof',{reason:'proof_complete'});
  await yard.stopDeployment('route-broker-mismatch-proof',{reason:'proof_complete'});

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.yard.public-route-broker-proof.v1',
    protocol:'evercraft.public-route.v1',
    deployment_receipt_bound:true,
    instance_bound:true,
    verification_delegated_to_yard:true,
    loopback_is_proof_only:true,
    public_https_still_required_for_live_promotion:true,
    route_provider_is_pluggable:true,
    founder_login_required:false,
    binding_receipt:binding.receipt_hash,
  },null,2));
} finally {
  await provider.close();
  await compute.close();
  fs.rmSync(root,{recursive:true,force:true});
}
