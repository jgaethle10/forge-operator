import assert from 'node:assert/strict';
import { normalizeComputeDemand } from './compute-exchange.mjs';
import {
  buildComputeCounterProposal,
  negotiateComputeAgreement,
  normalizeComputeProposal,
} from './negotiation-protocol.mjs';
import {
  buildGolemOrderFromDemand,
  createGolemNegotiationSession,
} from './markets/golem.mjs';

const demand=normalizeComputeDemand({
  demand_id:'negotiation-proof',
  container_image:'golem/node:20-alpine',
  cpu_units:2,
  memory_mb:4096,
  storage_gb:10,
  duration_seconds:1800,
  max_hourly_usd:0.20,
  max_total_usd:0.10,
  negotiation_level:'lease',
});

const initial=normalizeComputeProposal({
  proposal_id:'provider-proposal-1',
  demand_id:demand.demand_id,
  issuer:'provider',
  market:'golem',
  provider_id:'provider-proof',
  round:0,
  offer:{
    offer_id:'provider-proposal-1',
    provider_id:'provider-proof',
    market:'golem',
    access_class:'commercial_capacity',
    resources:{cpu_units:2,memory_mb:4096,storage_gb:10,gpu_count:0,gpu_models:[]},
    placement:{},
    trust:{uptime_7d:1,audited:true,valid_version:true,attested:false},
    economics:{zero_cost:false,quoted:true,hourly_usd:0.40,total_usd:0.20},
    quote_required:false,
  },
});
const counter=buildComputeCounterProposal({demand,proposal:initial});
assert.equal(counter.negotiable,true);
assert.equal(counter.counter.offer.economics.hourly_usd,0.20);
assert.equal(counter.counter.offer.economics.total_usd,0.10);
assert.equal(counter.counter.previous_proposal_id,initial.proposal_id);

let counterCalls=0;
let agreementCalls=0;
const client={
  async openDemand(){
    return initial;
  },
  async counterProposal({counter}){
    counterCalls+=1;
    return {
      ...counter,
      proposal_id:'provider-proposal-2',
      previous_proposal_id:counter.proposal_id,
      issuer:'provider',
      round:2,
      state:'draft',
    };
  },
  async proposeAgreement({proposal}){
    agreementCalls+=1;
    return {
      schema:'evercraft.saban.compute-agreement.v1',
      agreement_id:'agreement-proof',
      market:'golem',
      provider_id:proposal.provider_id,
      proposal_hash:proposal.proposal_hash,
      execution_ready:false,
      receipt:'sha256:agreement-proof',
    };
  },
};
const session=createGolemNegotiationSession({client});
const result=await negotiateComputeAgreement({
  demand,
  session,
  agreementAuthority:{
    schema:'evercraft.saban.compute-authority.v1',
    approved:true,
    demand_id:demand.demand_id,
    allowed_markets:['golem'],
    max_total_usd:0.10,
  },
  maxRounds:3,
});
assert.equal(result.status,'agreed');
assert.equal(counterCalls,1);
assert.equal(agreementCalls,1);
assert.equal(result.agreement.agreement_id,'agreement-proof');
assert.ok(result.events.some((e)=>e.type==='counter.sent'));
assert.ok(result.events.some((e)=>e.type==='agreement.accepted'));

const order=buildGolemOrderFromDemand(demand,{
  paymentNetwork:'polygon',
});
assert.equal(order.order.demand.workload.minCpuCores,2);
assert.equal(order.order.demand.workload.minMemGib,4);
assert.equal(order.order.demand.workload.minStorageGib,10);
assert.equal(order.order.market.rentHours,0.5);
assert.equal(order.order.market.pricing.maxCpuPerHourPrice,0.20);
assert.equal(order.order.payment.network,'polygon');

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.counteroffer-fabric-proof.v1',
  provider_proposal_received:true,
  requestor_counterproposal_sent:true,
  provider_counteraccepted:true,
  agreement_created:true,
  hard_budget_preserved:true,
  golem_order_translation_proven:true,
  external_golem_network_contacted:false,
},null,2));
