#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { normalizeComputeDemand, rankComputeOffers } from './compute-exchange.mjs';
import { createAkashMarketAdapter } from './markets/akash.mjs';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

function summarizeOffer(offer){
  if(!offer)return null;
  return {
    offer_id:offer.offer_id,
    provider_id:offer.provider_id,
    market:offer.market,
    endpoint:offer.endpoint,
    access_class:offer.access_class,
    resources:offer.resources,
    placement:offer.placement,
    trust:offer.trust,
    economics:offer.economics,
    quote_required:offer.quote_required,
    metadata:{
      provider_name:offer.metadata?.provider_name||null,
      host_uri:offer.metadata?.host_uri||null,
      cpu_arch:offer.metadata?.cpu_arch||null,
      cpu_model:offer.metadata?.cpu_model||null,
      network_provider:offer.metadata?.network_provider||null,
      network_speed_down:offer.metadata?.network_speed_down||null,
      network_speed_up:offer.metadata?.network_speed_up||null,
      last_check_date:offer.metadata?.last_check_date||null,
    },
  };
}

const profiles=[
  {
    role:'public_ingress',
    demand:normalizeComputeDemand({
      demand_id:'evercraft-production-public-ingress',
      workload_class:'systemia.public-edge.v1',
      cpu_units:1,
      memory_mb:1024,
      storage_gb:10,
      require_public_ingress:true,
      minimum_uptime_7d:0.95,
      valid_version_only:true,
      negotiation_level:'discover',
      prefer_zero_cost:true,
    }),
  },
  {
    role:'rivet_runtime',
    demand:normalizeComputeDemand({
      demand_id:'evercraft-production-rivet-runtime',
      workload_class:'systemia.rivet-report-runtime.v1',
      cpu_units:4,
      memory_mb:8192,
      storage_gb:50,
      require_persistent_storage:true,
      minimum_uptime_7d:0.95,
      valid_version_only:true,
      negotiation_level:'discover',
      prefer_zero_cost:true,
    }),
  },
  {
    role:'aliev_source_store',
    demand:normalizeComputeDemand({
      demand_id:'evercraft-production-aliev-source-store',
      workload_class:'systemia.aliev-source-runtime.v1',
      cpu_units:2,
      memory_mb:4096,
      storage_gb:100,
      require_persistent_storage:true,
      minimum_uptime_7d:0.95,
      valid_version_only:true,
      negotiation_level:'discover',
      prefer_zero_cost:true,
    }),
  },
];

const adapter=createAkashMarketAdapter();
const discovery=await adapter.discover();
const offers=discovery.offers||[];
const roles=[];

for(const profile of profiles){
  const ranking=rankComputeOffers(profile.demand,offers);
  roles.push({
    role:profile.role,
    demand:{
      demand_id:profile.demand.demand_id,
      workload_class:profile.demand.workload_class,
      resources:profile.demand.resources,
      placement:profile.demand.placement,
      trust:profile.demand.trust,
      negotiation_level:profile.demand.negotiation_level,
    },
    eligible_offer_count:ranking.eligible.length,
    rejected_offer_count:ranking.rejected.length,
    top_candidates:ranking.eligible.slice(0,5).map(x=>summarizeOffer(x.offer)),
    selected_candidate:summarizeOffer(ranking.eligible[0]?.offer||null),
    authority_state:'discovery_only',
    market_order_created:false,
    paid_lease_created:false,
  });
}

const body={
  schema:'evercraft.saban.production-capacity-radar.v1',
  synthetic_data:false,
  live_network_request:true,
  market:'akash',
  provider_count:Number(discovery.receipt?.provider_count||0),
  online_offer_count:Number(discovery.receipt?.online_offer_count||offers.length),
  roles,
  policy:{
    visibility_is_not_authorization:true,
    discovered_capacity_is_not_leased_capacity:true,
    no_market_order_without_demand_scoped_quote_authority:true,
    no_paid_lease_without_explicit_spend_authority:true,
    prefer_owned_or_authorized_zero_cost_capacity:true,
  },
  source_receipt:discovery.receipt||null,
  observed_at:new Date().toISOString(),
};
const receipt={...body,receipt_hash:sha(body)};
console.log(JSON.stringify(receipt,null,2));

if(roles.some(r=>r.eligible_offer_count<1)){
  process.exitCode=2;
}
