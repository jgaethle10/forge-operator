import assert from 'node:assert/strict';
import { negotiateCompute } from './compute-exchange.mjs';
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
    assert.equal(order.demand.workload.imageTag,'golem/alpine:latest');
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
  container_image:'golem/alpine:latest',
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
  container_image:'golem/alpine:latest',
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
assert.equal(negotiation.lease.execution_ready,false);
assert.equal(
  negotiation.lease.execution_hold,
  'registered_saban_worker_image_not_yet_wired'
);
assert.equal(rented,true);
assert.equal(JSON.stringify(negotiation).includes('golem-rental-proof'),false);

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
  execution_truthfully_held_until_registered_worker_image:true,
  release_path:true,
  negotiation_receipt:negotiation.receipt_hash,
},null,2));
