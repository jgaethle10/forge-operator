import assert from 'node:assert/strict';
import {
  createGolemMarketAdapter,
  buildGolemMarketOrder,
} from './markets/golem.mjs';
import {
  normalizeComputeDemand,
} from './compute-exchange.mjs';

const provider={
  node_id:'0xprovider-proof',
  online:true,
  uptime:99.8,
  earnings_total:12,
  version:'0.17.4',
  computing_now:false,
  network:'mainnet',
  wallet:'0xwallet',
  reputation:{blacklisted:false,blacklistedReason:null},
  runtimes:{
    vm:{
      hourly_price_glm:0.5,
      properties:{
        'golem.inf.cpu.threads':8,
        'golem.inf.mem.gib':16,
        'golem.inf.storage.gib':100,
        'golem.inf.cpu.brand':'Proof CPU',
        'golem.node.id.name':'proof-provider',
        'golem.com.payment.platform.erc20-polygon-glm.address':'0xpolygon',
      },
    },
  },
};

const fakeFetch=async()=>({
  ok:true,
  status:200,
  async json(){return [provider];},
});

let connected=false;
let disconnected=false;
let finalized=false;
let capturedOrder=null;
const fakeNetwork={
  async connect(){connected=true;},
  async oneOf({order}){
    capturedOrder=order;
    return {
      agreement:{provider:{id:'0xprovider-proof'}},
      async stopAndFinalize(){finalized=true;},
    };
  },
  async disconnect(){disconnected=true;},
};

const adapter=createGolemMarketAdapter({
  appKey:'proof-app-key',
  fetchImpl:fakeFetch,
  networkFactory:async()=>fakeNetwork,
});

const demand=normalizeComputeDemand({
  demand_id:'golem-proof-demand',
  workload_class:'saban.multiplier-assignment.v1',
  container_image:'golem/alpine:latest',
  cpu_units:2,
  memory_mb:4096,
  storage_gb:10,
  duration_seconds:600,
  negotiation_level:'lease',
  market_price_ceiling:{
    golem_start_glm:0.2,
    golem_cpu_hour_glm:0.4,
    golem_env_hour_glm:0.3,
  },
});

const discovery=await adapter.discover({demand});
assert.equal(discovery.offers.length,1);
assert.equal(discovery.offers[0].provider_id,'0xprovider-proof');
assert.equal(discovery.offers[0].resources.cpu_units,8);
assert.equal(discovery.offers[0].resources.memory_mb,16384);
assert.equal(discovery.offers[0].metadata.polygon_payment_ready,true);

const order=buildGolemMarketOrder(
  demand,
  discovery.offers[0],
  {
    golem_network:'hoodi',
    golem_max_start_price_glm:0.2,
    golem_max_cpu_hour_glm:0.4,
    golem_max_env_hour_glm:0.3,
  }
);
assert.equal(order.demand.workload.imageTag,'golem/alpine:latest');
assert.equal(order.market.rentHours,600/3600);
assert.equal(order.market.pricing.maxCpuPerHourPrice,0.4);

const lease=await adapter.lease({
  demand,
  offer:discovery.offers[0],
  authority:{
    schema:'evercraft.saban.compute-authority.v1',
    approved:true,
    demand_id:demand.demand_id,
    allow_spend:true,
    golem_network:'hoodi',
    golem_max_start_price_glm:0.2,
    golem_max_cpu_hour_glm:0.4,
    golem_max_env_hour_glm:0.3,
  },
});
assert.equal(connected,true);
assert.equal(lease.execution_ready,true);
assert.equal(lease.provider_id,'0xprovider-proof');
assert.equal(capturedOrder.market.pricing.maxEnvPerHourPrice,0.3);
assert.equal(JSON.stringify(lease).includes('proof-app-key'),false);

await adapter.release({lease});
assert.equal(finalized,true);
assert.equal(disconnected,true);

await assert.rejects(
  adapter.lease({
    demand,
    offer:discovery.offers[0],
    authority:{
      schema:'evercraft.saban.compute-authority.v1',
      approved:true,
      demand_id:demand.demand_id,
      allow_spend:true,
      golem_network:'polygon',
      allow_mainnet:false,
      golem_max_start_price_glm:0.2,
      golem_max_cpu_hour_glm:0.4,
      golem_max_env_hour_glm:0.3,
    },
  }),
  /mainnet_authority_required/
);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.golem-market-proof.v1',
  live_supply_shape_normalized:true,
  provider_specific_market_order:true,
  native_price_ceilings_required:true,
  requestor_lease_created:true,
  release_finalizes_rental:true,
  mainnet_requires_explicit_authority:true,
  app_key_not_serialized:true,
},null,2));
