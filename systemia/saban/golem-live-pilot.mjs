#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  negotiateCompute,
  normalizeComputeDemand,
} from './compute-exchange.mjs';
import { createGolemMarketAdapter } from './markets/golem.mjs';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const demand=normalizeComputeDemand({
  demand_id:'saban-golem-live-scan',
  workload_class:'saban.multiplier-assignment.v1',
  cpu_units:2,
  memory_mb:4096,
  storage_gb:10,
  minimum_uptime_7d:0.80,
  negotiation_level:'discover',
});

const result=await negotiateCompute({
  demand,
  adapters:[createGolemMarketAdapter()],
});

const event=result.events.find(
  (row)=>row.type==='market.discovered'&&row.market==='golem'
);
const receipt=event?.receipt||{};
const body={
  schema:'evercraft.saban.golem-live-supply-pilot.v1',
  synthetic_data:false,
  live_network_request:true,
  source:receipt.source||null,
  provider_records_seen:Number(receipt.provider_records_seen||0),
  normalized_offer_count:Number(receipt.normalized_offer_count||0),
  eligible_offer_count:Number(result.eligible_offer_count||0),
  rejected_offer_count:Number(result.rejected_offer_count||0),
  selected_provider:result.selected_offer?{
    provider_id:result.selected_offer.provider_id,
    cpu_units:result.selected_offer.resources.cpu_units,
    memory_mb:Math.round(result.selected_offer.resources.memory_mb),
    storage_gb:Number(result.selected_offer.resources.storage_gb||0),
    uptime_7d:result.selected_offer.trust.uptime_7d,
    native_price:result.selected_offer.economics.native_price,
    provider_name:result.selected_offer.metadata?.provider_name||null,
  }:null,
  paid_lease_created:false,
  reason_no_lease:'discovery_only_canary_has_no_yagna_payment_authority',
  observed_at:new Date().toISOString(),
};
const out={...body,receipt_hash:sha(body)};
console.log(JSON.stringify(out,null,2));

if(out.provider_records_seen<1) throw new Error('golem_live_provider_records_missing');
if(out.normalized_offer_count<1) throw new Error('golem_live_offers_missing');
if(out.eligible_offer_count<1) throw new Error('golem_live_no_offer_satisfies_demand');
if(!out.selected_provider) throw new Error('golem_live_selected_provider_missing');
