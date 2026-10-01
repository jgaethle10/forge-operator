import assert from 'node:assert/strict';
import {
  generateKeyPairSync,
  sign,
} from 'node:crypto';
import {
  canonicalVoluntaryOffer,
  prepareVoluntaryOffer,
  createVoluntaryMarketAdapter,
} from './markets/voluntary.mjs';
import {
  negotiateCompute,
  normalizeComputeDemand,
} from './compute-exchange.mjs';

const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const publicPem=publicKey.export({type:'spki',format:'pem'});

const market=createVoluntaryMarketAdapter({maxRounds:6});
market.registerProvider({
  provider_id:'chromebook-volunteer',
  public_key_pem:publicPem,
  negotiator:async({proposal})=>{
    assert.equal(proposal.issuer,'requestor');
    assert.equal(proposal.terms.economics.hourly_usd,0.08);
    return {action:'accept'};
  },
  leaseFactory:async()=>({
    execution_endpoint:'https://broker.example/nodes/chromebook-volunteer',
    transport:'evercraft-nodeseed',
    execution_ready:true,
    authority:Object.freeze({allocator_token:'runtime-secret-proof'}),
  }),
});

const prepared=prepareVoluntaryOffer({
  provider_id:'chromebook-volunteer',
  offer_id:'chromebook-evening-capacity',
  access_class:'voluntary_compute',
  resources:{
    cpu_units:4,
    memory_mb:8192,
    storage_gb:40,
    gpu_count:0,
    gpu_models:[],
  },
  workload_classes:['saban.multiplier-assignment.v1'],
  economics:{
    zero_cost:false,
    hourly_usd:0.12,
    minimum_hourly_usd:0.07,
    terms_ref:'evercraft://voluntary/chromebook-evening-capacity',
  },
  placement:{
    public_ingress:false,
    persistent_storage:false,
  },
  trust:{
    uptime_7d:0.99,
    audited:false,
    valid_version:true,
  },
  execution:{
    transport:'evercraft-nodeseed',
    endpoint:'https://broker.example/nodes/chromebook-volunteer',
  },
  available_until:new Date(Date.now()+15*60_000).toISOString(),
  nonce:'proof-nonce-1',
});
const signature=sign(
  null,
  Buffer.from(canonicalVoluntaryOffer(prepared)),
  privateKey
).toString('base64');

const admission=market.submitSignedOffer({
  offer:prepared,
  signature_base64:signature,
});
assert.equal(admission.signature_verified,true);

assert.throws(
  ()=>market.submitSignedOffer({
    offer:{...prepared,offer_id:'tampered-offer',nonce:'proof-nonce-2'},
    signature_base64:signature,
  }),
  /signature_invalid/
);

const demand=normalizeComputeDemand({
  demand_id:'voluntary-proof-demand',
  workload_class:'saban.multiplier-assignment.v1',
  cpu_units:2,
  memory_mb:2048,
  storage_gb:5,
  duration_seconds:3600,
  negotiation_level:'lease',
  max_hourly_usd:0.08,
  max_total_usd:0.08,
});

const result=await negotiateCompute({
  demand,
  adapters:[market],
  quoteAuthority:{
    schema:'evercraft.saban.compute-authority.v1',
    approved:true,
    demand_id:demand.demand_id,
    allowed_markets:['evercraft-voluntary'],
  },
  leaseAuthority:{
    schema:'evercraft.saban.compute-authority.v1',
    approved:true,
    demand_id:demand.demand_id,
    allowed_markets:['evercraft-voluntary'],
    allow_spend:true,
    max_total_usd:0.08,
  },
});

assert.equal(result.selected_offer.market,'evercraft-voluntary');
assert.equal(result.selected_offer.economics.hourly_usd,0.08);
assert.equal(result.lease.execution_ready,true);
assert.equal(result.lease.transport,'evercraft-nodeseed');
assert.equal(JSON.stringify(result).includes('runtime-secret-proof'),false);
assert.equal(
  result.lease.runtime_authority.allocator_token,
  'runtime-secret-proof'
);
assert.ok(result.events.some((e)=>e.type==='quote.received'));
assert.ok(result.events.some((e)=>e.type==='lease.granted'));

assert.equal(market.revokeOffer({
  provider_id:'chromebook-volunteer',
  offer_id:'chromebook-evening-capacity',
}),true);
const after=await market.discover({demand});
assert.equal(after.offers.length,0);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.voluntary-compute-market-proof.v1',
  signed_offer_required:true,
  tampered_offer_rejected:true,
  above_budget_opening_offer_countered:true,
  mutually_accepted_price:0.08,
  bounded_lease_created:true,
  runtime_secret_non_serializable:true,
  immediate_offer_revocation:true,
},null,2));
