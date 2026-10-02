import assert from 'node:assert/strict';
import path from 'node:path';
import {
  buildMultiplicationPlan,
  loadMultiplicationRegistry,
  resolveMultiplicationContract,
} from './multiplier.mjs';
import { executeDistributedMultiplicationPlan } from './distributed-executor.mjs';
import { createGolemMarketAdapter } from './markets/golem.mjs';
import { runPortableChumAssignment } from './portable-workers/chum.mjs';

let scanCount=0;
let rentCount=0;
let executeCount=0;
let releaseCount=0;
const rental={id:'distributed-golem-rental-proof'};

const fakeClient={
  async scan({order}={}){
    scanCount+=1;
    assert.equal(order.demand.workload.imageTag,'golem/node:20-alpine');
    return [{provider:{id:'distributed-golem-provider',name:'Distributed Golem Provider'}}];
  },
  async rentOne({providerId}={}){
    rentCount+=1;
    assert.equal(providerId,'distributed-golem-provider');
    return {rental,provider_id:providerId};
  },
  async executePortableWorker({rental:got,localWorkerPath,payload}={}){
    executeCount+=1;
    assert.equal(got,rental);
    assert.match(
      localWorkerPath,
      /systemia\/saban\/portable-workers\/chum\.mjs$/
    );
    return runPortableChumAssignment(payload);
  },
  async release({rental:got}={}){
    releaseCount+=1;
    assert.equal(got,rental);
    return {released:true};
  },
  async close(){},
};

const market=await createGolemMarketAdapter({
  client:fakeClient,
  scanTimeoutMs:1000,
});

const registry=loadMultiplicationRegistry(
  path.resolve(process.cwd(),'systemia/saban/multiplication-registry.json')
);
const contract=resolveMultiplicationContract('chum',registry);
assert.equal(contract.portable_execution?.golem?.enabled,true);
assert.equal(contract.portable_execution.golem.worker_id,'chum-portable-v1');

const workItems=[{
  kind:'product',
  key:'distributed-golem-proof',
  source_file:null,
  raw:{
    canonical_url:'https://example.com/distributed-golem-proof',
    intents:['discover','evaluate','route'],
    authority:'proof',
    boundaries:['public only'],
  },
}];

const plan=buildMultiplicationPlan({
  contract,
  logicalAgents:4,
  physicalWorkers:4,
  workItems,
});

const receipt=await executeDistributedMultiplicationPlan({
  contract,
  plan,
  workItems,
  rootDir:process.cwd(),
  reconcile:false,
  nodePool:{
    endpoints:[],
    discover:false,
    maxConcurrencyPerNode:4,
    assignmentTimeoutMs:5000,
    acquisition:{
      enabled:true,
      demand_id:'distributed-golem-proof',
      negotiation_level:'lease',
      prefer_zero_cost:false,
      duration_seconds:300,
      market_price_ceiling:{
        golem_max_start_glm:0.01,
        golem_max_cpu_per_hour_glm:0.02,
        golem_max_env_per_hour_glm:0.01,
        golem_payment_network:'hoodi',
      },
      adapters:[market],
      quoteAuthority:{
        schema:'evercraft.saban.compute-authority.v1',
        approved:true,
        demand_id:'distributed-golem-proof',
        allowed_markets:['golem'],
        allow_market_orders:true,
      },
      leaseAuthority:{
        schema:'evercraft.saban.compute-authority.v1',
        approved:true,
        demand_id:'distributed-golem-proof',
        allowed_markets:['golem'],
        allow_spend:true,
        max_total_glm:0.1,
      },
    },
  },
});

assert.equal(scanCount,2);
assert.equal(rentCount,1);
assert.equal(executeCount,4);
assert.equal(releaseCount,1);
assert.equal(receipt.scheduler_summary.counts.completed,4);
assert.equal(receipt.execution_fabric,'evercraft.negotiated-adapter-pool.v1');
assert.equal(receipt.pool_summary.capacity_acquisition.market,'golem');
assert.equal(
  receipt.pool_summary.capacity_acquisition.provider_id,
  'distributed-golem-provider'
);
assert.equal(
  receipt.pool_summary.capacity_acquisition.execution_fabric,
  'evercraft.negotiated-adapter-pool.v1'
);
assert.equal(receipt.node_pool_receipt.completed_assignments,4);
assert.equal(receipt.node_pool_receipt.failed_assignments,0);
assert.ok(
  receipt.node_pool_receipt.results.every((row)=>
    row.compute_receipt?.startsWith('sha256:')
  )
);
assert.deepEqual(
  receipt.sample_results.map((row)=>row.role),
  [
    'portfolio_archaeologist',
    'surface_auditor',
    'intent_cartographer',
    'answer_door_planner',
  ]
);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.distributed-golem-acquisition-proof.v1',
  configured_nodeseeds:0,
  acquisition_triggered:true,
  provider:'distributed-golem-provider',
  portable_worker_id:'chum-portable-v1',
  market_scans:scanCount,
  rentals:rentCount,
  assignments_completed:receipt.scheduler_summary.counts.completed,
  provider_max_concurrency_respected:true,
  executions:executeCount,
  rental_finalized:releaseCount===1,
  arbitrary_remote_shell_required:false,
  execution_fabric:receipt.execution_fabric,
  negotiation_receipt:
    receipt.pool_summary.capacity_acquisition.negotiation_receipt,
  lease_receipt:
    receipt.pool_summary.capacity_acquisition.lease_receipt,
},null,2));
