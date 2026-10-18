import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { YardOperator } from './operator.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-web-fetch-yard-proof-'));
const seed = await startNodeSeed({
  root:path.join(root,'node'),
  nodeId:'evercraft-web-fetch-proof-node',
  host:'127.0.0.1',
  port:0,
  announce:false,
});
const yard = new YardOperator({stateDir:path.join(root,'yard')});
const deploymentId='evercraft-web-fetch-private-proof';

try {
  const capacity=await fetch(seed.endpoint+'/v1/capacity').then(r=>r.json());
  assert.ok(capacity.supported_workloads.includes('systemia.evercraft-web-fetch-mcp.v1'));
  const d=await yard.deployRelease({
    deploymentId,
    releaseRef:'7'.repeat(40),
    workloadClass:'systemia.evercraft-web-fetch-mcp.v1',
    capacityEndpoint:seed.endpoint,
    input:{},
    rollbackTarget:'proof:private-only-stop',
    leaseTtlMs:120000,
  });
  assert.equal(d.state,'ready');
  assert.equal(d.receipt.health_verification,'healthy');
  assert.equal(d.receipt.route_verification,'private_web_fetch_health_verified_public_route_unbound');
  assert.equal(d.result.public_route_approved,false);
  assert.equal(d.result.http_bridge_allowed,false);
  assert.equal(d.result.registry_repoint_authorized,false);
  assert.equal(d.result.token_exposed,false);
  assert.equal(d.result.payment_authority,false);
  assert.equal(d.result.service_url,null);
  assert.match(d.result.local_url,/^http:\/\/127\.0\.0\.1:\d+$/);
  assert.match(d.receipt.receipt_hash,/^[a-f0-9]{64}$/);

  const endpoint=seed.endpoint+'/v1/services/'+d.result.service_id+'/health';
  const health=await fetch(endpoint).then(r=>r.json());
  assert.equal(health.ok,true);
  assert.equal(health.loopback_only,true);
  assert.equal(health.mode,'authenticated_read_only');
  assert.equal(health.deployment_receipt_bound,true);
  assert.equal(health.deployment_receipt_ref,d.receipt.receipt_hash);
  assert.equal(health.public_route_approved,false);
  assert.equal(health.payment_authority,false);
  assert.equal(JSON.stringify({d,health}).includes('Bearer '),false);

  const anonymous=await fetch(d.result.local_url+'/mcp',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})
  });
  assert.equal(anonymous.status,401);
  const arbitrary=await fetch(d.result.local_url+'/mcp',{
    method:'POST',headers:{authorization:'Bearer totally-invalid-token'},
    body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list'})
  });
  assert.equal(arbitrary.status,401);

  const bridge=await fetch(seed.endpoint+'/v1/services/'+d.result.service_id+'/http-bridge',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({path:'/mcp',method:'POST',body_base64:Buffer.from('{}').toString('base64')})
  });
  assert.equal(bridge.status,401,'unauthorized private bridge access must fail');
  const route=await yard.verifyRoute(deploymentId);
  assert.equal(route.ok,false);
  assert.equal(route.state,'public_route_unbound');

  const stopped=await yard.stopDeployment(deploymentId,{reason:'proof_complete'});
  assert.equal(stopped.ok,true);
  const healthAfterStop=await fetch(endpoint);
  assert.equal(healthAfterStop.status,404);
  console.log(JSON.stringify({
    schema:'evercraft.web-fetch.owned-yard-resident-proof.v1',
    ok:true,
    capacity_advertised:true,
    private_yard_deployment_health_verified:true,
    deployment_receipt_bound:true,
    secret_not_in_receipts:true,
    anonymous_mcp_rejected:true,
    public_route_unbound:true,
    no_bridge_or_registry_promotion:true,
    stop_lifecycle_verified:true,
    deployment_receipt:d.receipt.receipt_hash,
  },null,2));
} finally {
  await seed.close();
  fs.rmSync(root,{recursive:true,force:true});
}
