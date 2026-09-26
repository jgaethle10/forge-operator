import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { YardOperator } from './operator.mjs';
import { YardPublicRouteBroker } from './public-route-broker.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-public-edge-proof-'));
const computeRoot=path.join(root,'compute');
const yardState=path.join(root,'yard');
fs.mkdirSync(computeRoot,{recursive:true});

const node=await startEvercraftComputeNode({
  root:computeRoot,
  nodeId:'evercraft-public-edge-proof-node',
});
const yard=new YardOperator({stateDir:yardState});

try{
  const releaseRef='9ccedfb62c627761c22a08267a56f5bb3c7e35bb';

  const edge=await yard.deployRelease({
    deploymentId:'evercraft-public-edge-proof',
    releaseRef,
    workloadClass:'systemia.public-edge.v1',
    capacityEndpoint:node.endpoint,
    input:{
      mode:'proof_loopback',
      control_host:'127.0.0.1',
      control_port:0,
    },
    rollbackTarget:'proof:previous-public-edge',
    leaseTtlMs:120000,
  });

  assert.equal(edge.state,'ready');
  assert.equal(edge.receipt.health_verification,'healthy');
  assert.equal(edge.receipt.route_verification,'private_route_provider_health_verified');
  assert.equal(edge.result.public_route_provider,true);
  assert.equal(edge.result.route_protocol,'evercraft.public-route.v1');
  assert.ok(edge.result.local_url);

  const edgeHealth=await fetch(edge.result.local_url+'/health').then(r=>r.json());
  assert.equal(edgeHealth.ok,true);
  assert.equal(edgeHealth.service,'evercraft-public-edge');
  assert.equal(edgeHealth.runtime,'Evercraft Compute');
  assert.equal(edgeHealth.instance_id,edge.result.instance_id);
  assert.equal(edgeHealth.deployment_receipt_bound,true);
  assert.equal(edgeHealth.deployment_receipt_ref,edge.receipt.receipt_hash);
  assert.equal(edgeHealth.public_https,false);

  const specialist=await yard.deployRelease({
    deploymentId:'specialist-behind-public-edge-proof',
    releaseRef,
    workloadClass:'systemia.specialist-handoff-mcp.v1',
    capacityEndpoint:node.endpoint,
    input:{gateway_url:'https://example.invalid/machine-commerce'},
    rollbackTarget:'proof:previous-specialist-runtime',
    leaseTtlMs:120000,
  });
  assert.equal(specialist.state,'ready');
  assert.equal(specialist.receipt.health_verification,'healthy');

  const broker=new YardPublicRouteBroker({
    yard,
    providerEndpoint:edge.result.local_url,
    allowLoopbackProof:true,
  });
  const binding=await broker.bindDeployment('specialist-behind-public-edge-proof',{
    requestedHostname:'specialist-proof',
    ttlMs:120000,
  });

  assert.equal(binding.schema,'evercraft.yard.public-route-binding.v1');
  assert.equal(binding.provider,'evercraft-public-edge');
  assert.equal(binding.route_scope,'loopback_proof');
  assert.equal(binding.route_verified,false);
  assert.equal(binding.deployment_receipt_hash,specialist.receipt.receipt_hash);
  assert.equal(binding.instance_id,specialist.result.instance_id);

  const proxiedHealth=await fetch(binding.origin+'/health').then(r=>r.json());
  assert.equal(proxiedHealth.ok,true);
  assert.equal(proxiedHealth.service,'specialist-handoff-mcp');
  assert.equal(proxiedHealth.instance_id,specialist.result.instance_id);
  assert.equal(proxiedHealth.deployment_receipt_ref,specialist.receipt.receipt_hash);

  const init=await fetch(binding.origin+'/mcp/site-survive',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      jsonrpc:'2.0',id:1,method:'initialize',
      params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'edge-proof',version:'1'}}
    }),
  }).then(r=>r.json());
  assert.equal(init.result.serverInfo.name,'evercraft-site-survive');

  const tools=await fetch(binding.origin+'/mcp/site-survive',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list',params:{}}),
  }).then(r=>r.json());
  assert.deepEqual(
    tools.result.tools.map(x=>x.name),
    ['get_site_survive_offer','prepare_site_survive_handoff']
  );
  assert.ok(tools.result.tools.every(x=>x.annotations.readOnlyHint===true));
  assert.ok(tools.result.tools.every(x=>x.annotations.destructiveHint===false));

  const routeStatus=await yard.verifyRoute('specialist-behind-public-edge-proof');
  assert.equal(routeStatus.ok,false);
  assert.equal(routeStatus.state,'public_route_unbound');

  const beforeRelease=await fetch(edge.result.local_url+'/health').then(r=>r.json());
  assert.equal(beforeRelease.active_routes,1);
  const released=await broker.releaseBinding(binding,{reason:'proof_complete'});
  assert.equal(released.schema,'evercraft.yard.public-route-release.v1');
  assert.equal(released.released,true);
  const afterRelease=await fetch(edge.result.local_url+'/health').then(r=>r.json());
  assert.equal(afterRelease.active_routes,0);

  await yard.stopDeployment('specialist-behind-public-edge-proof',{reason:'proof_complete'});
  await yard.stopDeployment('evercraft-public-edge-proof',{reason:'proof_complete'});

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.public-edge.specialist-proof.v1',
    runtime_fabric:'Evercraft Compute',
    deployment_surface:'Yard Operator',
    edge_protocol:'evercraft.public-route.v1',
    edge_and_specialist_separate_resident_workloads:true,
    deployment_receipt_bound:true,
    proxied_mcp_initialize:true,
    proxied_mcp_tools_list:true,
    payment_authority:false,
    checkout_authority:false,
    founder_login_required:false,
    external_saas_route_provider_required:false,
    public_https_verified:false,
    proof_scope:'loopback_only',
    edge_deployment_receipt:edge.receipt.receipt_hash,
    specialist_deployment_receipt:specialist.receipt.receipt_hash,
    route_binding_receipt:binding.receipt_hash,
    route_release_receipt:released.receipt_hash,
  },null,2));
} finally {
  await node.close();
  fs.rmSync(root,{recursive:true,force:true});
}
