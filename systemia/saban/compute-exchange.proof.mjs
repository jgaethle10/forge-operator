import assert from 'node:assert/strict';
import {
  normalizeComputeDemand,
  normalizeComputeOffer,
  evaluateComputeOffer,
  negotiateCompute,
} from './compute-exchange.mjs';
import { createEvercraftBrokerMarketAdapter } from './markets/evercraft-broker.mjs';
import { buildAkashSDL, normalizeAkashBid, uactPerBlockToUsdHour } from './markets/akash.mjs';

const fingerprint='sha256:'+'a'.repeat(64);
const fakeYard={
  async listRemoteCapacityNodes(){
    return {
      nodes:[
        {
          node_id:'chromebook-proof',
          device_fingerprint:fingerprint,
          connected:true,
          last_seen_at:new Date().toISOString(),
          capacity:{
            protocol:'evercraft.capacity.v1',
            runtime:'Evercraft Compute',
            attestation_supported:true,
            device_fingerprint:fingerprint,
            placement_labels:['opportunistic','private','outbound-only','personal-compute'],
            supported_workloads:['saban.multiplier-assignment.v1'],
            capacity_hint:{cpu_units:4,memory_mb:4096,storage_gb:20},
          },
        },
        {
          node_id:'weak-node',
          device_fingerprint:'sha256:'+'b'.repeat(64),
          connected:true,
          last_seen_at:new Date().toISOString(),
          capacity:{
            protocol:'evercraft.capacity.v1',
            runtime:'Evercraft Compute',
            attestation_supported:true,
            device_fingerprint:'sha256:'+'b'.repeat(64),
            placement_labels:['voluntary'],
            supported_workloads:['saban.multiplier-assignment.v1'],
            capacity_hint:{cpu_units:0.5,memory_mb:256,storage_gb:1},
          },
        },
      ],
    };
  },
  async remoteCapacityGrant(_deploymentId,nodeId){
    assert.equal(nodeId,'chromebook-proof');
    return {
      node_id:'chromebook-proof',
      device_fingerprint:fingerprint,
      capacity_endpoint:'https://broker.example/nodes/chromebook-proof',
      allocator_token:'proof-secret-never-in-receipt',
      control_grant_receipt_hash:'sha256:grant',
      public_route_receipt_hash:null,
    };
  },
};

const broker=createEvercraftBrokerMarketAdapter({
  yard:fakeYard,
  brokerDeploymentId:'broker-proof',
});

const commercial={
  market:'paid-proof',
  async discover(){
    return {
      offers:[{
        offer_id:'paid-proof:1',
        provider_id:'paid-provider',
        access_class:'commercial_capacity',
        resources:{cpu_units:8,memory_mb:16384,storage_gb:100,gpu_count:0,gpu_models:[]},
        placement:{public_ingress:false,persistent_storage:false},
        trust:{uptime_7d:0.999,audited:true,valid_version:true,attested:false},
        economics:{zero_cost:false,quoted:true,hourly_usd:0.10,total_usd:0.10},
        quote_required:false,
      }],
      receipt:{receipt_hash:'sha256:paid-discovery'},
    };
  },
  async lease({offer}){
    return {schema:'proof.paid-lease.v1',provider_id:offer.provider_id,receipt:'sha256:paid-lease'};
  },
};

const demand=normalizeComputeDemand({
  demand_id:'proof-small',
  cpu_units:2,
  memory_mb:2048,
  storage_gb:2,
  duration_seconds:3600,
  negotiation_level:'lease',
  max_total_usd:1,
});

const freeFirst=await negotiateCompute({
  demand,
  adapters:[commercial,broker],
  leaseAuthority:{
    schema:'evercraft.saban.compute-authority.v1',
    approved:true,
    demand_id:'proof-small',
    allowed_markets:['evercraft-broker'],
    max_total_usd:0,
  },
});
assert.equal(freeFirst.selected_offer.market,'evercraft-broker');
assert.equal(freeFirst.selected_offer.provider_id,'chromebook-proof');
assert.equal(freeFirst.lease.zero_cost,true);
assert.equal(freeFirst.lease.capacity_endpoint,'https://broker.example/nodes/chromebook-proof');
assert.equal(JSON.stringify(freeFirst).includes('proof-secret-never-in-receipt'),false);
assert.equal(
  freeFirst.lease.runtime_authority.allocator_token,
  'proof-secret-never-in-receipt'
);

const tooLarge=normalizeComputeDemand({
  demand_id:'proof-large',
  cpu_units:8,
  memory_mb:8192,
  storage_gb:10,
  duration_seconds:3600,
  negotiation_level:'lease',
  max_total_usd:1,
});
const paidFallback=await negotiateCompute({
  demand:tooLarge,
  adapters:[broker,commercial],
  leaseAuthority:{
    schema:'evercraft.saban.compute-authority.v1',
    approved:true,
    demand_id:'proof-large',
    allow_spend:true,
    allowed_markets:['paid-proof'],
    max_total_usd:1,
  },
});
assert.equal(paidFallback.selected_offer.market,'paid-proof');
assert.equal(paidFallback.lease.provider_id,'paid-provider');

const expensive=normalizeComputeOffer({
  offer_id:'expensive',
  provider_id:'expensive-provider',
  market:'paid-proof',
  resources:{cpu_units:8,memory_mb:8192,storage_gb:10},
  placement:{},
  trust:{uptime_7d:1,audited:true,valid_version:true},
  economics:{zero_cost:false,quoted:true,hourly_usd:5,total_usd:5},
});
const budgetDecision=evaluateComputeOffer(tooLarge,expensive);
assert.equal(budgetDecision.eligible,false);
assert.ok(budgetDecision.reasons.includes('total_budget_exceeded'));

let quoteCancelled=false;
const quotedMarket={
  market:'quote-proof',
  async discover(){
    return {
      offers:[{
        offer_id:'quote-proof:supply',
        provider_id:'quote-provider',
        resources:{cpu_units:16,memory_mb:32768,storage_gb:100},
        placement:{},
        trust:{uptime_7d:1,audited:true,valid_version:true},
        economics:{zero_cost:false,quoted:false},
        quote_required:true,
      }],
    };
  },
  async requestQuotes(){
    return {
      schema:'proof.quote.v1',
      order_id:'quote-order-1',
      offers:[{
        offer_id:'quote-proof:bid',
        provider_id:'quote-provider',
        resources:{cpu_units:16,memory_mb:32768,storage_gb:100},
        placement:{},
        trust:{uptime_7d:1,audited:true,valid_version:true},
        economics:{zero_cost:false,quoted:true,hourly_usd:0.2,total_usd:0.2},
        quote_required:false,
      }],
      receipt:{receipt_hash:'sha256:quote'},
    };
  },
  async cancelQuote(){
    quoteCancelled=true;
    return {receipt_hash:'sha256:quote-cleanup'};
  },
};

const quoteOnly=await negotiateCompute({
  demand:{
    demand_id:'proof-quote',
    cpu_units:2,
    memory_mb:1024,
    negotiation_level:'quote',
    max_total_usd:1,
  },
  adapters:[quotedMarket],
  quoteAuthority:{
    schema:'evercraft.saban.compute-authority.v1',
    approved:true,
    demand_id:'proof-quote',
    allowed_markets:['quote-proof'],
    allow_market_orders:true,
  },
});
assert.equal(quoteOnly.selected_offer.offer_id,'quote-proof:bid');
assert.equal(quoteCancelled,true);
assert.ok(quoteOnly.events.some((e)=>e.type==='quote.cleaned_up'));

// A lease-level commercial demand must never skip a required quote round.
let unquotedLeaseAttempts=0;
const quoteRequiredMarket={
  market:'quote-required-proof',
  async discover(){
    return {
      offers:[{
        offer_id:'quote-required-proof:supply',
        provider_id:'quote-required-provider',
        resources:{cpu_units:8,memory_mb:8192,storage_gb:20},
        placement:{},
        trust:{uptime_7d:1,audited:true,valid_version:true},
        economics:{zero_cost:false,quoted:false},
        quote_required:true,
      }],
    };
  },
  async requestQuotes(){
    throw new Error('must_not_be_called_without_quote_authority');
  },
  async lease(){
    unquotedLeaseAttempts+=1;
    return {receipt:'sha256:should-not-exist'};
  },
};
const quoteHeld=await negotiateCompute({
  demand:{
    demand_id:'proof-quote-required-lease',
    cpu_units:2,
    memory_mb:1024,
    negotiation_level:'lease',
    max_total_usd:1,
  },
  adapters:[quoteRequiredMarket],
  leaseAuthority:{
    schema:'evercraft.saban.compute-authority.v1',
    approved:true,
    demand_id:'proof-quote-required-lease',
    allowed_markets:['quote-required-proof'],
    max_total_usd:1,
  },
});
assert.equal(unquotedLeaseAttempts,0);
assert.equal(quoteHeld.lease,null);
assert.ok(quoteHeld.events.some((e)=>e.type==='quote.held'));
assert.ok(quoteHeld.events.some((e)=>
  e.type==='lease.held'&&e.reason==='quote_required_before_lease'
));

// An uncertain lease failure requires reconciliation and must not auto-clean the quote.
let leaseFailureCleanupCalls=0;
const uncertainLeaseMarket={
  market:'uncertain-lease-proof',
  async discover(){
    return {
      offers:[{
        offer_id:'uncertain-lease-proof:supply',
        provider_id:'uncertain-provider',
        resources:{cpu_units:8,memory_mb:8192,storage_gb:20},
        placement:{},
        trust:{uptime_7d:1,audited:true,valid_version:true},
        economics:{zero_cost:false,quoted:false},
        quote_required:true,
      }],
    };
  },
  async requestQuotes(){
    return {
      schema:'proof.quote.v1',
      order_id:'uncertain-order',
      offers:[{
        offer_id:'uncertain-lease-proof:bid',
        provider_id:'uncertain-provider',
        resources:{cpu_units:8,memory_mb:8192,storage_gb:20},
        placement:{},
        trust:{uptime_7d:1,audited:true,valid_version:true},
        economics:{zero_cost:false,quoted:true,hourly_usd:0.1,total_usd:0.1},
        quote_required:false,
      }],
      receipt:{receipt_hash:'sha256:uncertain-quote'},
    };
  },
  async lease(){
    throw new Error('transport_dropped_after_commit_request');
  },
  async cancelQuote(){
    leaseFailureCleanupCalls+=1;
    return {receipt_hash:'sha256:unsafe-cleanup'};
  },
};
const uncertainLease=await negotiateCompute({
  demand:{
    demand_id:'proof-uncertain-lease',
    cpu_units:2,
    memory_mb:1024,
    negotiation_level:'lease',
    max_total_usd:1,
  },
  adapters:[uncertainLeaseMarket],
  quoteAuthority:{
    schema:'evercraft.saban.compute-authority.v1',
    approved:true,
    demand_id:'proof-uncertain-lease',
    allow_spend:true,
    allowed_markets:['uncertain-lease-proof'],
  },
  leaseAuthority:{
    schema:'evercraft.saban.compute-authority.v1',
    approved:true,
    demand_id:'proof-uncertain-lease',
    allowed_markets:['uncertain-lease-proof'],
    max_total_usd:1,
  },
});
assert.equal(uncertainLease.lease,null);
assert.equal(uncertainLease.manual_reconciliation_required,true);
assert.equal(leaseFailureCleanupCalls,0);
assert.ok(uncertainLease.events.some((e)=>
  e.type==='lease.failed'&&e.outcome==='reconciliation_required'
));

// A safe quote failure must fall through to the next eligible market.
let fallbackLowerLeaseCalls=0;
const quoteFailurePrimary={
  market:'quote-failure-primary',
  routing_priority:10,
  async discover(){
    return {
      offers:[{
        offer_id:'quote-failure-primary:supply',
        provider_id:'primary-provider',
        resources:{cpu_units:8,memory_mb:8192,storage_gb:20},
        placement:{},
        trust:{uptime_7d:1,audited:true,valid_version:true},
        economics:{zero_cost:false,quoted:false},
        quote_required:true,
      }],
      receipt:{receipt_hash:'sha256:primary-discovery'},
    };
  },
  async requestQuotes(){
    throw new Error('provider_declined_quote');
  },
};
const quoteFailureFallback={
  market:'quote-failure-fallback',
  routing_priority:20,
  async discover(){
    return {
      offers:[{
        offer_id:'quote-failure-fallback:supply',
        provider_id:'fallback-provider',
        resources:{cpu_units:8,memory_mb:8192,storage_gb:20},
        placement:{},
        trust:{uptime_7d:1,audited:true,valid_version:true},
        economics:{zero_cost:false,quoted:true,hourly_usd:0.15,total_usd:0.15},
        quote_required:false,
      }],
      receipt:{receipt_hash:'sha256:fallback-discovery'},
    };
  },
  async lease({offer}){
    fallbackLowerLeaseCalls+=1;
    assert.equal(offer.provider_id,'fallback-provider');
    return {
      schema:'proof.fallback-lease.v1',
      provider_id:offer.provider_id,
      execution_ready:true,
      receipt:'sha256:fallback-lease',
    };
  },
};
const safeQuoteFallback=await negotiateCompute({
  demand:{
    demand_id:'proof-safe-quote-fallback',
    cpu_units:2,
    memory_mb:1024,
    negotiation_level:'lease',
    max_total_usd:1,
    prefer_zero_cost:false,
  },
  adapters:[quoteFailureFallback,quoteFailurePrimary],
  quoteAuthority:{
    schema:'evercraft.saban.compute-authority.v1',
    approved:true,
    demand_id:'proof-safe-quote-fallback',
    allow_spend:true,
    allowed_markets:['quote-failure-primary','quote-failure-fallback'],
  },
  leaseAuthority:{
    schema:'evercraft.saban.compute-authority.v1',
    approved:true,
    demand_id:'proof-safe-quote-fallback',
    allowed_markets:['quote-failure-primary','quote-failure-fallback'],
    max_total_usd:1,
  },
});
assert.equal(safeQuoteFallback.selected_offer.market,'quote-failure-fallback');
assert.equal(safeQuoteFallback.lease.provider_id,'fallback-provider');
assert.equal(fallbackLowerLeaseCalls,1);
assert.equal(safeQuoteFallback.candidate_attempts,2);
assert.equal(safeQuoteFallback.manual_reconciliation_required,false);
assert.ok(safeQuoteFallback.events.some((e)=>
  e.type==='quote.failed' &&
  e.market==='quote-failure-primary' &&
  e.outcome==='fallback_allowed'
));

// An uncertain quote cleanup must stop before the next provider can be leased.
let unsafeCleanupFallbackLeaseCalls=0;
const cleanupUncertainPrimary={
  market:'cleanup-uncertain-primary',
  routing_priority:10,
  async discover(){
    return {
      offers:[{
        offer_id:'cleanup-uncertain-primary:supply',
        provider_id:'cleanup-primary-provider',
        resources:{cpu_units:8,memory_mb:8192,storage_gb:20},
        placement:{},
        trust:{uptime_7d:1,audited:true,valid_version:true},
        economics:{zero_cost:false,quoted:false},
        quote_required:true,
      }],
    };
  },
  async requestQuotes(){
    return {
      schema:'proof.quote.v1',
      order_id:'cleanup-uncertain-order',
      offers:[{
        offer_id:'cleanup-uncertain-primary:too-expensive',
        provider_id:'cleanup-primary-provider',
        resources:{cpu_units:8,memory_mb:8192,storage_gb:20},
        placement:{},
        trust:{uptime_7d:1,audited:true,valid_version:true},
        economics:{zero_cost:false,quoted:true,hourly_usd:9,total_usd:9},
        quote_required:false,
      }],
      receipt:{receipt_hash:'sha256:cleanup-uncertain-quote'},
    };
  },
  async cancelQuote(){
    throw new Error('quote_cleanup_transport_uncertain');
  },
};
const cleanupUncertainFallback={
  market:'cleanup-uncertain-fallback',
  routing_priority:20,
  async discover(){
    return {
      offers:[{
        offer_id:'cleanup-uncertain-fallback:supply',
        provider_id:'cleanup-fallback-provider',
        resources:{cpu_units:8,memory_mb:8192,storage_gb:20},
        placement:{},
        trust:{uptime_7d:1,audited:true,valid_version:true},
        economics:{zero_cost:false,quoted:true,hourly_usd:0.1,total_usd:0.1},
        quote_required:false,
      }],
    };
  },
  async lease(){
    unsafeCleanupFallbackLeaseCalls+=1;
    return {receipt:'sha256:must-not-happen'};
  },
};
const unsafeQuoteCleanup=await negotiateCompute({
  demand:{
    demand_id:'proof-unsafe-quote-cleanup',
    cpu_units:2,
    memory_mb:1024,
    negotiation_level:'lease',
    max_total_usd:1,
    prefer_zero_cost:false,
  },
  adapters:[cleanupUncertainFallback,cleanupUncertainPrimary],
  quoteAuthority:{
    schema:'evercraft.saban.compute-authority.v1',
    approved:true,
    demand_id:'proof-unsafe-quote-cleanup',
    allow_spend:true,
    allowed_markets:['cleanup-uncertain-primary','cleanup-uncertain-fallback'],
  },
  leaseAuthority:{
    schema:'evercraft.saban.compute-authority.v1',
    approved:true,
    demand_id:'proof-unsafe-quote-cleanup',
    allowed_markets:['cleanup-uncertain-primary','cleanup-uncertain-fallback'],
    max_total_usd:1,
  },
});
assert.equal(unsafeQuoteCleanup.lease,null);
assert.equal(unsafeCleanupFallbackLeaseCalls,0);
assert.equal(unsafeQuoteCleanup.candidate_attempts,1);
assert.equal(unsafeQuoteCleanup.manual_reconciliation_required,true);
assert.ok(unsafeQuoteCleanup.events.some((e)=>
  e.type==='quote.cleanup_failed' &&
  e.market==='cleanup-uncertain-primary' &&
  e.outcome==='reconciliation_required'
));

// Missing version evidence is not silently treated as current.
const unknownVersion=normalizeComputeOffer({
  offer_id:'unknown-version',
  provider_id:'unknown-version-provider',
  market:'proof',
  resources:{cpu_units:8,memory_mb:8192,storage_gb:20},
  placement:{},
  trust:{uptime_7d:1,audited:true},
  economics:{zero_cost:true,quoted:true,hourly_usd:0,total_usd:0},
});
const unknownVersionDecision=evaluateComputeOffer(
  normalizeComputeDemand({
    demand_id:'proof-version',
    cpu_units:1,
    memory_mb:512,
  }),
  unknownVersion
);
assert.equal(unknownVersionDecision.eligible,false);
assert.ok(unknownVersionDecision.reasons.includes('valid_version_required'));

const enrichedAkashBid=normalizeAkashBid(
  {
    bid:{
      id:{dseq:'100',gseq:1,oseq:1,provider:'akash-provider-proof'},
      price:{denom:'uact',amount:'100'},
      state:'open',
    },
  },
  normalizeComputeDemand({
    demand_id:'akash-bid-enrichment',
    cpu_units:2,
    memory_mb:2048,
    storage_gb:5,
  }),
  'proof-manifest',
  {
    owner:'akash-provider-proof',
    name:'Provider Proof',
    hostUri:'https://provider.example',
    ipRegionCode:'us-west',
    ipCountryCode:'US',
    featEndpointIp:true,
    featPersistentStorage:true,
    uptime7d:0.998,
    isAudited:true,
    isValidVersion:true,
    lastCheckDate:'2026-09-29T14:00:00Z',
  }
);
assert.equal(enrichedAkashBid.endpoint,'https://provider.example');
assert.equal(enrichedAkashBid.placement.region,'us-west');
assert.equal(enrichedAkashBid.placement.country,'US');
assert.equal(enrichedAkashBid.placement.public_ingress,true);
assert.equal(enrichedAkashBid.placement.persistent_storage,true);
assert.equal(enrichedAkashBid.trust.uptime_7d,0.998);
assert.equal(enrichedAkashBid.trust.audited,true);
assert.equal(enrichedAkashBid.trust.valid_version,true);
assert.equal(enrichedAkashBid.metadata.provider_metadata_found,true);

assert.equal(uactPerBlockToUsdHour(100),0.06);
const sdl=buildAkashSDL(normalizeComputeDemand({
  demand_id:'akash-sdl',
  container_image:'nginx:1.25.3',
  cpu_units:2,
  memory_mb:2048,
  storage_gb:5,
}),{maximumUactPerBlock:100});
assert.match(sdl,/image: "nginx:1.25.3"/);
assert.match(sdl,/units: 2/);
assert.match(sdl,/size: 2048Mi/);
assert.match(sdl,/denom: uact/);
assert.match(sdl,/amount: 100/);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.compute-exchange-proof.v1',
  zero_cost_owned_capacity_preferred:true,
  commercial_fallback_when_owned_capacity_insufficient:true,
  budget_enforcement:true,
  quote_orders_cleaned_up_when_not_leased:true,
  quote_required_before_commercial_lease:true,
  uncertain_lease_requires_manual_reconciliation:true,
  safe_quote_failure_falls_through:true,
  uncertain_quote_cleanup_stops_fallback:true,
  unknown_version_fails_closed:true,
  akash_quoted_bid_provider_metadata_preserved:true,
  akash_sdl_generated:true,
  uact_cost_conversion_proven:true,
},null,2));
