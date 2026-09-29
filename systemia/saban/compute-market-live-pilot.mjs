#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  negotiateCompute,
  normalizeComputeDemand,
} from './compute-exchange.mjs';
import { createAkashMarketAdapter } from './markets/akash.mjs';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const demand=normalizeComputeDemand({
  demand_id:'saban-live-market-scan',
  workload_class:'saban.multiplier-assignment.v1',
  cpu_units:2,
  memory_mb:4096,
  storage_gb:10,
  gpu_count:0,
  minimum_uptime_7d:0.90,
  valid_version_only:true,
  negotiation_level:'discover',
  prefer_zero_cost:true,
});

const result=await negotiateCompute({
  demand,
  adapters:[createAkashMarketAdapter()],
});

const discovery=result.events.find((e)=>
  e.type==='market.discovered'&&e.market==='akash'
);
const providerCount=Number(discovery?.receipt?.provider_count||0);
const onlineOffers=Number(discovery?.receipt?.online_offer_count||0);

const body={
  schema:'evercraft.saban.compute-market-live-pilot.v1',
  synthetic_data:false,
  live_network_request:true,
  demand:{
    demand_id:demand.demand_id,
    cpu_units:demand.resources.cpu_units,
    memory_mb:demand.resources.memory_mb,
    storage_gb:demand.resources.storage_gb,
    minimum_uptime_7d:demand.trust.minimum_uptime_7d,
  },
  market:'akash',
  providers_seen:providerCount,
  online_offers_seen:onlineOffers,
  eligible_offer_count:result.eligible_offer_count,
  rejected_offer_count:result.rejected_offer_count,
  selected_provider:result.selected_offer?{
    provider_id:result.selected_offer.provider_id,
    cpu_units:result.selected_offer.resources.cpu_units,
    memory_mb:Math.round(result.selected_offer.resources.memory_mb),
    storage_gb:Number(result.selected_offer.resources.storage_gb.toFixed(2)),
    gpu_count:result.selected_offer.resources.gpu_count,
    uptime_7d:result.selected_offer.trust.uptime_7d,
    audited:result.selected_offer.trust.audited,
    country:result.selected_offer.placement.country,
    region:result.selected_offer.placement.region,
  }:null,
  market_order_created:false,
  provider_bids_requested:false,
  paid_lease_created:false,
  reason_paid_negotiation_not_started:'no_quote_authority_or_market_credentials_in_live_scan',
  exchange_receipt:result.receipt_hash,
  observed_at:new Date().toISOString(),
};
const receipt={...body,receipt_hash:sha(body)};

if(providerCount<1) throw Object.assign(new Error('akash_no_providers_seen'),{receipt});
if(onlineOffers<1) throw Object.assign(new Error('akash_no_online_offers_seen'),{receipt});
if(result.eligible_offer_count<1) throw Object.assign(new Error('akash_no_offer_satisfies_live_demand'),{receipt});
if(!result.selected_offer) throw Object.assign(new Error('akash_no_selected_supply_candidate'),{receipt});

console.log(JSON.stringify(receipt,null,2));
