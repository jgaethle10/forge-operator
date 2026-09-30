import assert from 'node:assert/strict';
import { acquireResourceCapacity } from './resource-acquirer.mjs';

const baseNeed={
  need_id:'resource-acquirer-proof',
  workload_class:'saban.multiplier-assignment.v1',
  topology:'single_node',
  memory_semantics:'local',
  resources:{
    cpu_units:4,
    memory_mb:4096,
    storage_gb:10,
    gpu_units:0,
    vram_mb:0,
  },
};

let marketDiscoveries=0;
const market={
  market:'proof-market',
  async discover(){
    marketDiscoveries+=1;
    return {
      offers:[{
        offer_id:'proof-market:1',
        provider_id:'proof-provider',
        market:'proof-market',
        resources:{
          cpu_units:8,
          memory_mb:8192,
          storage_gb:50,
          gpu_count:0,
          gpu_models:[],
        },
        placement:{},
        trust:{
          uptime_7d:1,
          audited:true,
          valid_version:true,
          attested:false,
        },
        economics:{
          zero_cost:false,
          quoted:true,
          hourly_usd:0.1,
          total_usd:0.1,
        },
        quote_required:false,
      }],
    };
  },
  async lease(){
    const lease={
      schema:'proof.market-lease.v1',
      execution_ready:true,
      capacity_endpoint:'https://proof-provider.invalid/capacity',
      receipt:'sha256:proof-market-lease',
    };
    Object.defineProperty(lease,'runtime_authority',{
      value:Object.freeze({allocator_token:'proof-market-secret'}),
      enumerable:false,
    });
    return lease;
  },
};

const owned={
  candidate_id:'owned-node',
  source_kind:'owned_node',
  authority:'owned',
  connected:true,
  attested:true,
  workloads:['saban.multiplier-assignment.v1'],
  labels:['worker'],
  transports:[],
  resources:{
    cpu_units:8,
    memory_mb:8192,
    storage_gb:100,
  },
};

const ready=await acquireResourceCapacity({
  need:baseNeed,
  candidates:[owned],
  runtimeAuthorities:{
    'owned-node':{
      capacity_endpoint:'http://127.0.0.1:8787',
      allocator_token:'owned-secret',
    },
  },
  marketAdapters:[market],
});
assert.equal(ready.state,'ready');
assert.equal(ready.mode,'resource_field');
assert.equal(ready.execution_leases.length,1);
assert.equal(
  ready.execution_leases[0].runtime_authority.allocator_token,
  'owned-secret'
);
assert.equal(JSON.stringify(ready).includes('owned-secret'),false);
assert.equal(marketDiscoveries,0);

let spawnCalls=0;
const spawnCandidate={
  candidate_id:'owned-dormant-box',
  source_kind:'owned_bootstrap_target',
  authority:'owned',
  connected:false,
  attested:false,
  spawn_capable:true,
  workloads:[],
  labels:['worker'],
  transports:[],
  resources:{
    cpu_units:16,
    memory_mb:16384,
    storage_gb:200,
  },
};
const spawned=await acquireResourceCapacity({
  need:baseNeed,
  candidates:[spawnCandidate],
  spawnAdapters:{
    owned_bootstrap_target:{
      async activate({candidate}){
        spawnCalls+=1;
        assert.equal(candidate.candidate_id,'owned-dormant-box');
        const lease={
          execution_ready:true,
          capacity_endpoint:'http://127.0.0.1:9797',
          receipt:'sha256:spawn',
        };
        Object.defineProperty(lease,'runtime_authority',{
          value:Object.freeze({allocator_token:'spawn-secret'}),
          enumerable:false,
        });
        return lease;
      },
    },
  },
  marketAdapters:[market],
});
assert.equal(spawned.mode,'resource_field');
assert.equal(spawnCalls,1);
assert.equal(marketDiscoveries,0);
assert.equal(
  spawned.execution_leases[0].runtime_authority.allocator_token,
  'spawn-secret'
);

const missingAuthority=await acquireResourceCapacity({
  need:{...baseNeed,need_id:'missing-runtime-authority'},
  candidates:[owned],
  runtimeAuthorities:{},
  marketAdapters:[market],
  leaseAuthority:{
    schema:'evercraft.saban.compute-authority.v1',
    approved:true,
    demand_id:'missing-runtime-authority',
    allowed_markets:['proof-market'],
    max_total_usd:1,
  },
});
assert.equal(missingAuthority.mode,'compute_exchange');
assert.equal(marketDiscoveries,1);
assert.equal(
  missingAuthority.execution_leases[0].runtime_authority.allocator_token,
  'proof-market-secret'
);
assert.equal(JSON.stringify(missingAuthority).includes('proof-market-secret'),false);

const unauthorizedMonster={
  candidate_id:'unauthorized-monster',
  source_kind:'enrolled_peer',
  authority:'unknown',
  connected:true,
  attested:true,
  workloads:['saban.multiplier-assignment.v1'],
  resources:{
    cpu_units:1000,
    memory_mb:1000000,
    storage_gb:10000,
  },
};
const rejectedThenMarket=await acquireResourceCapacity({
  need:{...baseNeed,need_id:'unauthorized-fallback'},
  candidates:[unauthorizedMonster],
  marketAdapters:[market],
  leaseAuthority:{
    schema:'evercraft.saban.compute-authority.v1',
    approved:true,
    demand_id:'unauthorized-fallback',
    allowed_markets:['proof-market'],
    max_total_usd:1,
  },
});
assert.equal(rejectedThenMarket.mode,'compute_exchange');
assert.equal(marketDiscoveries,2);
assert.ok(rejectedThenMarket.events.some((event)=>
  event.type==='resource.scarcity'
));

const held=await acquireResourceCapacity({
  need:{...baseNeed,need_id:'held-without-authority'},
  candidates:[],
  marketAdapters:[market],
});
assert.equal(held.state,'held');
assert.equal(held.engineering_required,true);
assert.equal(held.next_action,'expand_resource_discovery_or_create_capacity_adapter');

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.resource-acquirer-proof.v1',
  ready_owned_capacity_executes_without_market:true,
  dormant_owned_capacity_can_be_spawned:true,
  missing_local_runtime_authority_falls_through:true,
  unauthorized_capacity_rejected:true,
  compute_exchange_fallback_execution_ready:true,
  secrets_not_serialized:true,
  unresolved_capacity_becomes_engineering_work:true,
},null,2));
