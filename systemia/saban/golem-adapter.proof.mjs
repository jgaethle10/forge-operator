import assert from 'node:assert/strict';
import { negotiateCompute } from './compute-exchange.mjs';
import { runPortableChumAssignment } from './portable-workers/chum.mjs';
import {
  buildGolemOrder,
  estimateGolemCeilingGlm,
  createGolemMarketAdapter,
} from './markets/golem.mjs';

let rented=false;
let released=false;
let scanCount=0;
const fakeRental={id:'golem-rental-proof'};
const fakeClient={
  async scan({order}={}){
    scanCount+=1;
    assert.equal(order.demand.workload.imageTag,'golem/node:20-alpine');
    assert.equal(order.demand.workload.minCpuThreads,2);
    assert.equal(order.demand.workload.minMemGib,2);
    assert.equal(order.demand.workload.minStorageGib,4);
    return [
      {provider:{id:'golem-provider-a',name:'Provider A'}},
      {provider:{id:'golem-provider-b',name:'Provider B'}},
    ].filter((row)=>
      typeof order.market.offerProposalFilter!=='function' ||
      order.market.offerProposalFilter(row)
    );
  },
  async rentOne({order,providerId}={}){
    assert.equal(providerId,'golem-provider-a');
    assert.equal(order.payment.network,'hoodi');
    rented=true;
    return {rental:fakeRental,provider_id:providerId};
  },
  async executePortableWorker({rental,localWorkerPath,payload}={}){
    assert.equal(rental,fakeRental);
    assert.match(localWorkerPath,/systemia\/saban\/portable-workers\/chum\.mjs$/);
    assert.equal(payload.portable_worker_id,'chum-portable-v1');
    return runPortableChumAssignment(payload);
  },
  async release({rental}={}){
    assert.equal(rental,fakeRental);
    released=true;
    return {released:true};
  },
  async close(){},
};

const demand={
  demand_id:'golem-proof-demand',
  workload_class:'saban.multiplier-assignment.v1',
  container_image:'golem/node:20-alpine',
  portable_software_id:'chum',
  portable_worker_id:'chum-portable-v1',
  portable_worker_version:'1',
  cpu_units:2,
  memory_mb:2048,
  storage_gb:4,
  duration_seconds:900,
  negotiation_level:'lease',
  prefer_zero_cost:false,
  market_price_ceiling:{
    golem_max_start_glm:0.01,
    golem_max_cpu_per_hour_glm:0.02,
    golem_max_env_per_hour_glm:0.01,
    golem_payment_network:'hoodi',
  },
};

const order=buildGolemOrder({
  schema:'evercraft.saban.compute-demand.v1',
  resources:{cpu_units:2,memory_mb:2048,storage_gb:4,gpu_count:0,gpu_models:[]},
  economics:{market_price_ceiling:demand.market_price_ceiling},
  duration_seconds:900,
  container_image:'golem/node:20-alpine',
});
assert.equal(order.market.rentHours,0.25);
assert.equal(estimateGolemCeilingGlm(
  {resources:{cpu_units:2},duration_seconds:900},
  order
),0.0225);

const market=await createGolemMarketAdapter({
  client:fakeClient,
  scanTimeoutMs:1000,
});

const negotiation=await negotiateCompute({
  demand,
  adapters:[market],
  quoteAuthority:{
    schema:'evercraft.saban.compute-authority.v1',
    approved:true,
    demand_id:'golem-proof-demand',
    allowed_markets:['golem'],
    allow_market_orders:true,
    expires_at:new Date(Date.now()+60000).toISOString(),
  },
  leaseAuthority:{
    schema:'evercraft.saban.compute-authority.v1',
    approved:true,
    demand_id:'golem-proof-demand',
    allowed_markets:['golem'],
    allow_spend:true,
    max_total_glm:0.03,
    expires_at:new Date(Date.now()+60000).toISOString(),
  },
});

assert.equal(scanCount,2);
assert.equal(negotiation.selected_offer.market,'golem');
assert.equal(negotiation.selected_offer.provider_id,'golem-provider-a');
assert.equal(negotiation.selected_offer.economics.native_price.denom,'GLM');
assert.equal(negotiation.selected_offer.economics.native_price.ceiling_total_glm,0.0225);
assert.ok(negotiation.lease);
assert.equal(negotiation.lease.maximum_cost_glm,0.0225);
assert.equal(negotiation.lease.execution_ready,true);
assert.equal(negotiation.lease.portable_software_id,'chum');
assert.equal(negotiation.lease.portable_worker_id,'chum-portable-v1');
assert.equal(negotiation.lease.portable_image_tag,'golem/node:20-alpine');
assert.equal(negotiation.lease.max_concurrency,1);
assert.equal(rented,true);
assert.equal(JSON.stringify(negotiation).includes('golem-rental-proof'),false);

const execution=await market.execute({
  lease:negotiation.lease,
  workload_class:'saban.multiplier-assignment.v1',
  input:{
    software:'chum',
    assignment:{
      agent_id:'golem-portable-chum-00001',
      idempotency_key:'sha256:portable-proof',
      role:'surface_auditor',
      work:{kind:'product',key:'portable-proof'},
      item:{
        kind:'product',
        key:'portable-proof',
        raw:{
          canonical_url:'https://example.com/portable-proof',
          intents:['discover','evaluate','route'],
          authority:'proof',
          boundaries:['public only'],
        },
      },
    },
  },
  idempotency_key:'sha256:portable-proof',
});
assert.equal(execution.schema,'evercraft.saban.golem-portable-execution.v1');
assert.equal(execution.portable_worker_id,'chum-portable-v1');
assert.equal(
  execution.result.schema,
  'evercraft.saban.portable-worker-receipt.v1'
);
assert.equal(execution.result.result.role,'surface_auditor');
assert.equal(execution.result.result.status,'finding');
assert.ok(
  execution.result.result.actions.some((row)=>
    row.type==='verify_llms_and_structured_discovery_surfaces'
  )
);
assert.equal(execution.checkpoint.state,'portable_assignment_completed');
assert.ok(execution.result_receipt.startsWith('sha256:'));

await market.release({lease:negotiation.lease});
assert.equal(released,true);

const expensiveMarket=await createGolemMarketAdapter({
  client:fakeClient,
  scanTimeoutMs:1000,
});
const held=await negotiateCompute({
  demand:{...demand,demand_id:'golem-budget-hold'},
  adapters:[expensiveMarket],
  quoteAuthority:{
    schema:'evercraft.saban.compute-authority.v1',
    approved:true,
    demand_id:'golem-budget-hold',
    allowed_markets:['golem'],
    allow_market_orders:true,
  },
  leaseAuthority:{
    schema:'evercraft.saban.compute-authority.v1',
    approved:true,
    demand_id:'golem-budget-hold',
    allowed_markets:['golem'],
    allow_spend:true,
    max_total_glm:0.001,
  },
});
assert.equal(held.lease,null);
assert.equal(held.manual_reconciliation_required,true);
assert.ok(
  held.events.some((e)=>
    e.type==='lease.failed' &&
    String(e.reason).includes('golem_glm_spend_ceiling_exceeded')
  )
);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.golem-adapter-proof.v1',
  demand_translated:true,
  live_sdk_client_surface_defined:true,
  provider_targeted_quote_scan:true,
  provider_targeted_rental:true,
  glm_native_budget_preserved:true,
  glm_spend_ceiling_enforced:true,
  runtime_rental_not_serialized:true,
  portable_chum_worker_executed:true,
  arbitrary_remote_shell_not_required:true,
  result_receipt:execution.result_receipt,
  release_path:true,
  negotiation_receipt:negotiation.receipt_hash,
},null,2));
