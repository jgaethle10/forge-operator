import assert from 'node:assert/strict';
import { buildSabanComputeMarketStack } from './market-stack.mjs';
import { negotiateCompute } from './compute-exchange.mjs';

const fakeYard={
  async listRemoteCapacityNodes(){return {nodes:[]};},
  async remoteCapacityGrant(){throw new Error('not_expected');},
};

const stack=await buildSabanComputeMarketStack({
  yard:fakeYard,
  brokerDeploymentId:'broker-proof',
  voluntaryEndpoint:'http://127.0.0.1:9999',
  voluntaryControlHeaders:{authorization:'Bearer proof'},
  includeGolem:true,
  includeAkash:true,
});

assert.deepEqual(
  stack.adapters.map((adapter)=>adapter.market),
  ['evercraft-broker','evercraft-voluntary','golem','akash']
);
assert.deepEqual(
  stack.adapters.map((adapter)=>adapter.routing_priority),
  [10,20,30,40]
);
assert.deepEqual(
  stack.inventory.map((row)=>row.priority),
  [10,20,30,40]
);
assert.equal(stack.doctrine.visibility_is_not_authorization,true);
assert.equal(
  stack.inventory.find((row)=>row.market==='evercraft-voluntary').execution_capable,
  true
);
assert.equal(
  stack.inventory.find((row)=>row.market==='golem').execution_capable,
  true
);
assert.equal(
  stack.inventory.find((row)=>row.market==='golem').portable_workloads_only,
  true
);

const offer=(market)=>({
  offer_id:`${market}:proof`,
  provider_id:`${market}:provider`,
  market,
  access_class:'commercial_capacity',
  resources:{
    cpu_units:4,
    memory_mb:4096,
    storage_gb:10,
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
    zero_cost:false,
    quoted:true,
    hourly_usd:0.01,
    total_usd:0.01,
  },
  quote_required:false,
});

for(const adapter of stack.adapters){
  adapter.discover=async()=>({
    offers:[offer(adapter.market)],
    receipt:{receipt_hash:`sha256:${adapter.market}`},
  });
}

const demand={
  demand_id:'market-priority-proof',
  cpu_units:1,
  memory_mb:512,
  storage_gb:1,
  duration_seconds:300,
  negotiation_level:'discover',
  max_total_usd:1,
  prefer_zero_cost:false,
};

const first=await negotiateCompute({
  demand,
  adapters:stack.adapters,
});
assert.equal(first.selected_offer.market,'evercraft-broker');
assert.equal(first.selected_offer.routing_priority,10);

stack.adapters.find((row)=>row.market==='evercraft-broker').discover=
  async()=>({offers:[],receipt:{receipt_hash:'sha256:none'}});
const second=await negotiateCompute({
  demand:{...demand,demand_id:'market-priority-proof-2'},
  adapters:stack.adapters,
});
assert.equal(second.selected_offer.market,'evercraft-voluntary');
assert.equal(second.selected_offer.routing_priority,20);

stack.adapters.find((row)=>row.market==='evercraft-voluntary').discover=
  async()=>({offers:[],receipt:{receipt_hash:'sha256:none'}});
const third=await negotiateCompute({
  demand:{...demand,demand_id:'market-priority-proof-3'},
  adapters:stack.adapters,
});
assert.equal(third.selected_offer.market,'golem');
assert.equal(third.selected_offer.routing_priority,30);

stack.adapters.find((row)=>row.market==='golem').discover=
  async()=>({offers:[],receipt:{receipt_hash:'sha256:none'}});
const fourth=await negotiateCompute({
  demand:{...demand,demand_id:'market-priority-proof-4'},
  adapters:stack.adapters,
});
assert.equal(fourth.selected_offer.market,'akash');
assert.equal(fourth.selected_offer.routing_priority,40);

const externalOnly=await buildSabanComputeMarketStack({
  includeAkash:true,
  includeGolem:false,
});
assert.deepEqual(externalOnly.adapters.map((adapter)=>adapter.market),['akash']);
assert.equal(externalOnly.adapters[0].routing_priority,40);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.compute-market-stack-proof.v1',
  routing_order_enforced:true,
  owned_first:true,
  voluntary_second:true,
  decentralized_third:true,
  commercial_fourth:true,
  golem_portable_execution_capable:true,
  fallthrough:[
    first.selected_offer.market,
    second.selected_offer.market,
    third.selected_offer.market,
    fourth.selected_offer.market,
  ],
},null,2));
