import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { YardOperator } from './operator.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'specialist-handoff-yard-proof-'));
const computeRoot=path.join(root,'compute');
const stateDir=path.join(root,'yard');
fs.mkdirSync(computeRoot,{recursive:true});

const node=await startEvercraftComputeNode({
  root:computeRoot,
  nodeId:'specialist-handoff-proof-node',
});
const yard=new YardOperator({stateDir});

try{
  const releaseRef='c095cf2c33446fcc68b66a8fd02f3ad76a5365c8';
  const deployment=await yard.deployRelease({
    deploymentId:'specialist-handoff-proof',
    releaseRef,
    workloadClass:'systemia.specialist-handoff-mcp.v1',
    capacityEndpoint:node.endpoint,
    input:{gateway_url:'https://example.invalid/machine-commerce'},
    rollbackTarget:'sha256:'+'a'.repeat(64),
  });

  assert.equal(deployment.state,'ready');
  assert.equal(deployment.receipt.runtime_fabric,'Evercraft Compute');
  assert.equal(deployment.receipt.workload_class,'systemia.specialist-handoff-mcp.v1');
  assert.equal(deployment.receipt.health_verification,'healthy');
  assert.equal(deployment.receipt.route_verification,'local_specialist_health_verified_public_route_unbound');
  assert.ok(deployment.result.local_url);
  assert.deepEqual(deployment.result.specialist_paths,[
    '/mcp/ibmi-rescue',
    '/mcp/foundry-app-escape',
    '/mcp/site-survive',
  ]);

  const health=await fetch(deployment.result.local_url+'/health').then(r=>r.json());
  assert.equal(health.ok,true);
  assert.equal(health.service,'specialist-handoff-mcp');
  assert.equal(health.runtime,'Evercraft Compute');
  assert.equal(health.instance_id,deployment.result.instance_id);
  assert.equal(health.deployment_receipt_bound,true);
  assert.equal(health.deployment_receipt_ref,deployment.receipt.receipt_hash);
  assert.equal(health.checkout_enabled,false);
  assert.equal(health.payment_enabled,false);

  const route=await yard.verifyPublicRoute('specialist-handoff-proof',{
    origin:deployment.result.local_url,
    allowLoopbackProof:true,
  });
  assert.equal(route.scope,'loopback_proof');
  assert.equal(route.verified,false);
  assert.equal(route.instance_id,deployment.result.instance_id);

  const init=await fetch(deployment.result.local_url+'/mcp/ibmi-rescue',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      jsonrpc:'2.0',id:1,method:'initialize',
      params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'proof',version:'1'}}
    })
  }).then(r=>r.json());
  assert.equal(init.result.serverInfo.name,'evercraft-ibmi-rescue');

  const tools=await fetch(deployment.result.local_url+'/mcp/ibmi-rescue',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list',params:{}})
  }).then(r=>r.json());
  assert.deepEqual(
    tools.result.tools.map(x=>x.name),
    ['get_ibmi_rescue_offer','prepare_ibmi_rescue_handoff']
  );
  assert.ok(tools.result.tools.every(x=>x.annotations.readOnlyHint===true));
  assert.ok(tools.result.tools.every(x=>x.annotations.destructiveHint===false));

  const stopped=await yard.stopDeployment('specialist-handoff-proof',{reason:'proof_complete'});
  assert.equal(stopped.ok,true);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.specialist-handoff.yard-proof.v1',
    workload_class:'systemia.specialist-handoff-mcp.v1',
    runtime:'Evercraft Compute',
    specialist_paths:deployment.result.specialist_paths,
    deployment_receipt:deployment.receipt.receipt_hash,
    loopback_route_receipt:route.receipt_hash,
    public_https_verified:false,
    payment_authority:false,
    checkout_authority:false,
  },null,2));
} finally {
  await node.close();
  fs.rmSync(root,{recursive:true,force:true});
}
