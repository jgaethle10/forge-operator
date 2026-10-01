import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createVoluntaryMarketAdapter } from './markets/voluntary.mjs';
import { startVoluntaryMarketServer } from './voluntary-market-server.mjs';
import { VoluntaryProviderAgent } from './voluntary-provider-agent.mjs';
import {
  negotiateCompute,
  normalizeComputeDemand,
} from './compute-exchange.mjs';

const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const identity={
  node_id:'provider-agent-proof',
  fingerprint:'proof-fingerprint',
  public_key_pem:publicKey.export({type:'spki',format:'pem'}),
  private_key_pem:privateKey.export({type:'pkcs8',format:'pem'}),
};

assert.throws(
  ()=>new VoluntaryProviderAgent({
    marketUrl:'http://market.example',
    identity,
  }),
  /https_required/
);

const market=createVoluntaryMarketAdapter({maxRounds:6});
const server=await startVoluntaryMarketServer({
  market,
  registrationToken:'provider-agent-registration',
});

const agent=new VoluntaryProviderAgent({
  marketUrl:server.url,
  registrationToken:'provider-agent-registration',
  identity,
  pollWaitMs:5000,
  offer:{
    offer_id:'provider-agent-proof-offer',
    resources:{
      cpu_units:6,
      memory_mb:12288,
      storage_gb:50,
      gpu_count:0,
      gpu_models:[],
    },
    workload_classes:['saban.multiplier-assignment.v1'],
    economics:{
      zero_cost:false,
      hourly_usd:0.14,
      minimum_hourly_usd:0.075,
    },
    trust:{
      uptime_7d:0.97,
      valid_version:true,
    },
    execution:{
      transport:'outbound-evercraft',
      endpoint:null,
    },
  },
});

try{
  await agent.publishOffer();
  assert.equal(agent.status().registered,true);
  assert.equal(agent.status().offer_id,'provider-agent-proof-offer');
  assert.equal(JSON.stringify(agent.status()).includes('PRIVATE KEY'),false);

  const demand=normalizeComputeDemand({
    demand_id:'provider-agent-demand',
    workload_class:'saban.multiplier-assignment.v1',
    cpu_units:2,
    memory_mb:2048,
    storage_gb:5,
    duration_seconds:3600,
    negotiation_level:'quote',
    max_hourly_usd:0.08,
    max_total_usd:0.08,
  });

  const providerLoop=agent.pollOnce();
  const result=await negotiateCompute({
    demand,
    adapters:[market],
    quoteAuthority:{
      schema:'evercraft.saban.compute-authority.v1',
      approved:true,
      demand_id:demand.demand_id,
      allowed_markets:['evercraft-voluntary'],
    },
  });
  const decision=await providerLoop;

  assert.equal(decision.action,'accept');
  assert.equal(result.selected_offer.economics.hourly_usd,0.08);
  assert.equal(agent.status().negotiation_count,1);
  assert.equal(await agent.revoke(),true);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.saban.voluntary-provider-agent-proof.v1',
    device_identity_used_for_offer_signing:true,
    provider_agent_published_capacity:true,
    saban_counter_received:true,
    provider_floor_policy_applied:true,
    counter_accepted:true,
    provider_can_revoke:true,
    private_key_not_exposed_in_status:true,
  },null,2));
}finally{
  await agent.close();
  await server.close();
}
