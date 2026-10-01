import assert from 'node:assert/strict';
import {
  ComputeNegotiationSession,
  createComputeLeaseFromAgreement,
} from './negotiation-protocol.mjs';

const session=new ComputeNegotiationSession({
  demand_id:'proof-demand',
  market:'proof-market',
  provider_id:'provider-1',
  max_rounds:4,
});

const opening=session.propose({
  issuer:'provider',
  terms:{
    resources:{cpu_units:4,memory_mb:4096},
    economics:{hourly_usd:0.12,total_usd:0.12},
    duration_seconds:3600,
    workload_class:'saban.multiplier-assignment.v1',
  },
});
assert.equal(opening.round,1);

const counter=session.counter({
  issuer:'requestor',
  terms:{
    ...opening.terms,
    economics:{hourly_usd:0.08,total_usd:0.08},
  },
});
assert.equal(counter.round,2);
assert.equal(counter.previous_proposal_id,opening.proposal_id);

session.accept({issuer:'provider',proposal_id:counter.proposal_id});
session.accept({issuer:'requestor',proposal_id:counter.proposal_id});
assert.equal(session.state,'agreed');

const agreement=session.agreement();
assert.equal(agreement.terms.economics.hourly_usd,0.08);
assert.match(agreement.agreement_hash,/^sha256:/);

const lease=createComputeLeaseFromAgreement(agreement,{
  execution_endpoint:'https://worker.example/capacity',
  transport:'evercraft-nodeseed',
  ttl_seconds:300,
});
assert.equal(lease.provider_id,'provider-1');
assert.equal(lease.transport,'evercraft-nodeseed');
assert.match(lease.receipt_hash,/^sha256:/);

const transcript=session.transcript();
assert.equal(transcript.state,'agreed');
assert.equal(transcript.entries.filter((e)=>e.type==='proposal').length,2);
assert.equal(transcript.entries.filter((e)=>e.type==='acceptance').length,2);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.compute-negotiation-protocol-proof.v1',
  provider_opening_proposal:true,
  requestor_counteroffer:true,
  mutual_acceptance_required:true,
  immutable_agreement_receipt:true,
  bounded_lease_from_agreement:true,
},null,2));
