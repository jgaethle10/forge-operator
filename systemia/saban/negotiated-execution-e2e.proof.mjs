import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sign } from 'node:crypto';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { loadOrCreateDeviceIdentity } from '../compute/device-identity.mjs';
import { buildMultiplicationPlan } from './multiplier.mjs';
import { executeDistributedMultiplicationPlan } from './distributed-executor.mjs';
import {
  createVoluntaryMarketAdapter,
  prepareVoluntaryOffer,
  canonicalVoluntaryOffer,
} from './markets/voluntary.mjs';
import { createYardVoluntaryLeaseResolver } from './markets/voluntary-yard.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-negotiated-execution-'));
const nodeRoot=path.join(root,'node');
const nodeId='negotiated-node-proof';
const allocatorToken='negotiated-proof-allocator';

const identity=loadOrCreateDeviceIdentity({
  root:nodeRoot,
  nodeId,
});
const seed=await startNodeSeed({
  root:nodeRoot,
  nodeId,
  host:'127.0.0.1',
  port:0,
  advertiseHost:'127.0.0.1',
  allocatorToken,
  placementLabels:['voluntary','outbound-only'],
  announce:false,
});

const fakeYard={
  async remoteCapacityGrant(_deploymentId,requestedNodeId){
    assert.equal(requestedNodeId,nodeId);
    return {
      node_id:nodeId,
      device_fingerprint:identity.fingerprint,
      capacity_endpoint:seed.endpoint,
      allocator_token:allocatorToken,
      control_grant_receipt_hash:'sha256:negotiated-control-grant',
      public_route_receipt_hash:null,
    };
  },
};

const market=createVoluntaryMarketAdapter({
  leaseResolver:createYardVoluntaryLeaseResolver({
    yard:fakeYard,
    brokerDeploymentId:'proof-broker',
  }),
});

market.registerProvider({
  provider_id:nodeId,
  public_key_pem:identity.public_key_pem,
});

const offer=prepareVoluntaryOffer({
  provider_id:nodeId,
  offer_id:'negotiated-node-capacity',
  resources:{
    cpu_units:8,
    memory_mb:8192,
    storage_gb:20,
    gpu_count:0,
    gpu_models:[],
  },
  workload_classes:['saban.multiplier-assignment.v1'],
  economics:{zero_cost:true},
  placement:{public_ingress:false,persistent_storage:false},
  trust:{uptime_7d:1,valid_version:true},
  execution:{transport:'outbound-evercraft',endpoint:null},
  available_until:new Date(Date.now()+10*60_000).toISOString(),
  nonce:'negotiated-execution-proof',
});
market.submitSignedOffer({
  offer,
  signature_base64:sign(
    null,
    Buffer.from(canonicalVoluntaryOffer(offer)),
    identity.private_key_pem
  ).toString('base64'),
});

const contract={
  software_id:'chum',
  name:'CHUM negotiated execution proof',
  adapter:'systemia/chum/saban-adapter.mjs',
  max_logical_agents:1,
  default_logical_agents:1,
  max_physical_workers:1,
  default_physical_workers:1,
  lease_seconds:300,
  roles:['surface_auditor'],
  assignment_strategy:'role_item_cartesian',
  side_effects:{default:'deny'},
  resources:{
    minimum_node_cpu_units:1,
    minimum_node_memory_mb:128,
    cpu_units_per_worker:1,
    memory_mb_per_worker:128,
    require_capacity_hint:false,
  },
  quality:{
    minimum_completion_ratio:1,
    dead_letter_allowed:false,
    require_all_roles:true,
    require_reconciliation:false,
    enforcement:'fail_execution',
  },
};

const workItems=[{
  kind:'product',
  key:'negotiated-proof-product',
  source_file:null,
  raw:{
    canonical_url:'https://example.com',
    intents:['one','two','three'],
    authority:'proof',
    boundaries:['public only'],
  },
}];

const plan=buildMultiplicationPlan({
  contract,
  logicalAgents:1,
  physicalWorkers:1,
  workItems,
  generatedAt:'2026-10-01T00:00:00.000Z',
});

const demandId='negotiated-capacity-deficit-proof';
try{
  const receipt=await executeDistributedMultiplicationPlan({
    contract,
    plan,
    workItems,
    reconcile:false,
    nodePool:{
      endpoints:[],
      discover:false,
      maxConcurrencyPerNode:1,
      assignmentTimeoutMs:10_000,
      acquisition:{
        enabled:true,
        demand_id:demandId,
        negotiation_level:'lease',
        prefer_zero_cost:true,
        max_total_usd:0,
        adapters:[market],
        quoteAuthority:{
          schema:'evercraft.saban.compute-authority.v1',
          approved:true,
          demand_id:demandId,
          allowed_markets:['evercraft-voluntary'],
        },
        leaseAuthority:{
          schema:'evercraft.saban.compute-authority.v1',
          approved:true,
          demand_id:demandId,
          allowed_markets:['evercraft-voluntary'],
          max_total_usd:0,
        },
      },
    },
  });

  assert.equal(receipt.quality.status,'pass');
  assert.equal(receipt.scheduler_summary.counts.completed,1);
  assert.equal(
    receipt.pool_summary.capacity_acquisition.trigger_reason,
    'no_eligible_nodeseed_capacity'
  );
  assert.equal(
    receipt.pool_summary.capacity_acquisition.market,
    'evercraft-voluntary'
  );
  assert.equal(
    receipt.pool_summary.capacity_acquisition.provider_id,
    nodeId
  );
  assert.equal(
    receipt.node_pool_receipt.results[0].result.schema,
    'evercraft.saban.registered-worker-receipt.v1'
  );
  assert.equal(
    receipt.node_pool_receipt.results[0].result.software_id,
    'chum'
  );

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.saban.negotiated-execution-e2e-proof.v1',
    started_with_zero_worker_endpoints:true,
    capacity_deficit_triggered_negotiation:true,
    signed_voluntary_offer_selected:true,
    yard_identity_grant_bound:true,
    acquired_nodeseed_reentered_scheduler:true,
    registered_saban_assignment_executed:true,
    quality_gate_passed:true,
    provider_id:nodeId,
    acquisition_receipt:
      receipt.pool_summary.capacity_acquisition.negotiation_receipt,
  },null,2));
}finally{
  await seed.close().catch(()=>{});
  fs.rmSync(root,{recursive:true,force:true});
}
