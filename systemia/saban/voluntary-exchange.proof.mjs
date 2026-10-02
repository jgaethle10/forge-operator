import assert from 'node:assert/strict';
import { startVoluntaryComputeExchange } from './voluntary-exchange.mjs';
import {
  createEvercraftVoluntaryMarketAdapter,
  registerVoluntaryProvider,
} from './markets/evercraft-voluntary.mjs';
import { negotiateCompute } from './compute-exchange.mjs';

const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));

const exchange=await startVoluntaryComputeExchange({
  host:'127.0.0.1',
  port:0,
  providerOfferTtlMs:60000,
  maxLeaseSeconds:1800,
});

try{
  const provider=await registerVoluntaryProvider({
    endpoint:exchange.endpoint,
    provider_id:'chromebook-voluntary-proof',
    resources:{
      cpu_units:4,
      memory_mb:8192,
      storage_gb:25,
      gpu_count:0,
    },
    workload_classes:['saban.multiplier-assignment.v1'],
    economics:{
      zero_cost:false,
      hourly_usd:0.04,
    },
    trust:{
      uptime_7d:0.99,
      attested:false,
    },
    terms_ref:'proof:voluntary-compute',
  });

  const market=createEvercraftVoluntaryMarketAdapter({
    endpoint:exchange.endpoint,
    controlHeaders:exchange.controlHeaders,
    proposalPollMs:20,
    proposalTimeoutMs:3000,
  });

  const providerNegotiation=(async()=>{
    const deadline=Date.now()+3000;
    while(Date.now()<deadline){
      const proposal=await provider.pollProposal();
      if(proposal){
        assert.equal(proposal.provider_id,'chromebook-voluntary-proof');
        assert.equal(proposal.terms.workload_class,'saban.multiplier-assignment.v1');
        assert.equal(proposal.terms.cpu_units,2);
        return provider.respond(proposal,{
          decision:'counter',
          counter_terms:{
            hourly_usd:0.05,
            duration_seconds:900,
          },
        });
      }
      await sleep(20);
    }
    throw new Error('provider_never_received_proposal');
  })();

  const negotiationPromise=negotiateCompute({
    demand:{
      demand_id:'voluntary-proof-demand',
      workload_class:'saban.multiplier-assignment.v1',
      cpu_units:2,
      memory_mb:2048,
      storage_gb:2,
      duration_seconds:900,
      max_hourly_usd:0.06,
      max_total_usd:0.02,
      negotiation_level:'lease',
      prefer_zero_cost:true,
    },
    adapters:[market],
    quoteAuthority:{
      schema:'evercraft.saban.compute-authority.v1',
      approved:true,
      demand_id:'voluntary-proof-demand',
      allowed_markets:['evercraft-voluntary'],
      allow_spend:true,
      expires_at:new Date(Date.now()+60000).toISOString(),
    },
    leaseAuthority:{
      schema:'evercraft.saban.compute-authority.v1',
      approved:true,
      demand_id:'voluntary-proof-demand',
      allowed_markets:['evercraft-voluntary'],
      max_total_usd:0.02,
      expires_at:new Date(Date.now()+60000).toISOString(),
    },
  });

  await providerNegotiation;
  const negotiation=await negotiationPromise;

  assert.equal(negotiation.selected_offer.market,'evercraft-voluntary');
  assert.equal(negotiation.selected_offer.provider_id,'chromebook-voluntary-proof');
  assert.equal(negotiation.selected_offer.economics.hourly_usd,0.05);
  assert.equal(negotiation.selected_offer.economics.total_usd,0.0125);
  assert.equal(negotiation.selected_offer.metadata.proposal_origin,'provider');
  assert.ok(negotiation.lease);
  assert.equal(negotiation.lease.execution_ready,true);
  assert.equal(negotiation.lease.workload_class,'saban.multiplier-assignment.v1');
  assert.ok(negotiation.events.some((e)=>e.type==='quote.received'));
  assert.ok(negotiation.events.some((e)=>e.type==='lease.granted'));

  const agreements=await provider.agreements();
  assert.equal(agreements.length,1);
  assert.equal(agreements[0].state,'active');

  const providerExecution=(async()=>{
    const deadline=Date.now()+3000;
    while(Date.now()<deadline){
      const job=await provider.pollJob();
      if(job){
        assert.equal(job.workload_class,'saban.multiplier-assignment.v1');
        assert.deepEqual(job.input,{numbers:[2,3,5,7]});
        const sum=job.input.numbers.reduce((a,b)=>a+b,0);
        return provider.submitJobResult(job,{
          ok:true,
          result:{sum},
          checkpoint:{step:1,state:'complete'},
        });
      }
      await sleep(20);
    }
    throw new Error('provider_never_received_job');
  })();

  const executed=market.execute({
    lease:negotiation.lease,
    workload_class:'saban.multiplier-assignment.v1',
    input:{numbers:[2,3,5,7]},
    idempotency_key:'voluntary-proof-job-1',
    timeoutMs:3000,
  });

  await providerExecution;
  const job=await executed;
  assert.equal(job.state,'completed');
  assert.equal(job.result.sum,17);
  assert.equal(job.checkpoint.step,1);
  assert.ok(job.result_receipt?.startsWith('sha256:'));

  const released=await market.release({lease:negotiation.lease});
  assert.ok(released.receipt_hash?.startsWith('sha256:'));

  await assert.rejects(
    market.execute({
      lease:negotiation.lease,
      workload_class:'arbitrary.shell',
      input:{command:'whoami'},
      timeoutMs:500,
    }),
    /agreement_not_active|agreement_workload_mismatch/
  );

  const health=exchange.health();
  assert.equal(health.provider_count,1);
  assert.equal(health.agreement_count,1);
  assert.equal(health.job_count,1);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.saban.voluntary-negotiation-proof.v1',
    provider_registered:true,
    initial_proposal_received:true,
    provider_counteroffer:true,
    counteroffer_within_budget:true,
    agreement_created:true,
    bounded_registered_workload_executed:true,
    checkpoint_returned:true,
    result_receipt_returned:true,
    agreement_released:true,
    arbitrary_shell_denied:true,
    provider_id:'chromebook-voluntary-proof',
    negotiated_hourly_usd:negotiation.selected_offer.economics.hourly_usd,
    negotiated_total_usd:negotiation.selected_offer.economics.total_usd,
    negotiation_receipt:negotiation.receipt_hash,
    job_receipt:job.result_receipt,
    release_receipt:released.receipt_hash,
  },null,2));
}finally{
  await exchange.close();
}
