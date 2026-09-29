import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startNodeSeed } from '../compute/node-seed.mjs';
import {
  buildMultiplicationPlan,
  loadMultiplicationRegistry,
  resolveMultiplicationContract,
} from './multiplier.mjs';
import { executeDistributedMultiplicationPlan } from './distributed-executor.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-distributed-acquisition-'));
const allocatorToken='distributed-acquisition-proof-token';
const seed=await startNodeSeed({
  root:path.join(root,'acquired-node'),
  nodeId:'acquired-capacity-proof-node',
  host:'127.0.0.1',
  port:0,
  advertiseHost:'127.0.0.1',
  allocatorToken,
  announce:false,
});

let discoverCalls=0;
let leaseCalls=0;
const market={
  market:'proof-execution-market',
  async discover({demand}={}){
    discoverCalls+=1;
    assert.equal(demand.workload_class,'saban.multiplier-assignment.v1');
    return {
      offers:[{
        offer_id:'proof-execution-market:node',
        provider_id:'proof-provider',
        access_class:'voluntary_compute',
        resources:{
          cpu_units:8,
          memory_mb:8192,
          storage_gb:20,
          gpu_count:0,
          gpu_models:[],
        },
        placement:{
          public_ingress:false,
          persistent_storage:false,
        },
        trust:{
          uptime_7d:1,
          audited:true,
          valid_version:true,
          attested:true,
        },
        economics:{
          zero_cost:true,
          quoted:true,
          hourly_usd:0,
          total_usd:0,
        },
        quote_required:false,
      }],
      receipt:{receipt_hash:'sha256:proof-discovery'},
    };
  },
  async lease({demand,offer}={}){
    leaseCalls+=1;
    assert.equal(demand.demand_id,'distributed-acquisition-proof');
    assert.equal(offer.provider_id,'proof-provider');
    const lease={
      schema:'evercraft.saban.proof-execution-lease.v1',
      execution_ready:true,
      capacity_endpoint:seed.endpoint,
      provider_id:'proof-provider',
      receipt:'sha256:proof-acquisition',
    };
    Object.defineProperty(lease,'runtime_authority',{
      value:Object.freeze({allocator_token:allocatorToken}),
      enumerable:false,
    });
    return lease;
  },
};

const registry=loadMultiplicationRegistry(
  path.resolve(process.cwd(),'systemia/saban/multiplication-registry.json')
);
const contract=resolveMultiplicationContract('chum',registry);
const workItems=[{
  kind:'product',
  key:'acquisition-proof-product',
  source_file:null,
  raw:{
    canonical_url:'https://example.com/acquisition-proof',
    intents:['discover','evaluate','route'],
    authority:'proof',
    boundaries:['public only'],
  },
}];
const plan=buildMultiplicationPlan({
  contract,
  logicalAgents:4,
  physicalWorkers:2,
  workItems,
});

try{
  const receipt=await executeDistributedMultiplicationPlan({
    contract,
    plan,
    workItems,
    rootDir:process.cwd(),
    reconcile:false,
    nodePool:{
      endpoints:[],
      discover:false,
      maxConcurrencyPerNode:2,
      assignmentTimeoutMs:10000,
      acquisition:{
        enabled:true,
        demand_id:'distributed-acquisition-proof',
        negotiation_level:'lease',
        prefer_zero_cost:true,
        adapters:[market],
        leaseAuthority:{
          schema:'evercraft.saban.compute-authority.v1',
          approved:true,
          demand_id:'distributed-acquisition-proof',
          allowed_markets:['proof-execution-market'],
          max_total_usd:0,
        },
      },
    },
  });

  assert.equal(discoverCalls,1);
  assert.equal(leaseCalls,1);
  assert.equal(receipt.scheduler_summary.counts.completed,4);
  assert.equal(receipt.pool_summary.capacity_acquisition.execution_ready,true);
  assert.equal(
    receipt.pool_summary.capacity_acquisition.market,
    'proof-execution-market'
  );
  assert.equal(
    receipt.pool_summary.capacity_acquisition.provider_id,
    'proof-provider'
  );
  assert.equal(
    receipt.pool_summary.capacity_acquisition.lease_receipt,
    'sha256:proof-acquisition'
  );
  assert.equal(
    JSON.stringify(receipt).includes(allocatorToken),
    false
  );

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.saban.distributed-acquisition-proof.v1',
    started_with_configured_endpoints:0,
    acquisition_triggered:true,
    market_discovery_calls:discoverCalls,
    lease_calls:leaseCalls,
    assignments_completed:receipt.scheduler_summary.counts.completed,
    acquired_provider:receipt.pool_summary.capacity_acquisition.provider_id,
    execution_on_acquired_capacity:true,
    authority_secret_serialized:false,
  },null,2));
}finally{
  await seed.close().catch(()=>{});
  fs.rmSync(root,{recursive:true,force:true});
}
