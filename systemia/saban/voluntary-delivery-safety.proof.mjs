import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { startVoluntaryComputeExchange } from './voluntary-exchange.mjs';
import {
  createEvercraftVoluntaryMarketAdapter,
  registerVoluntaryProvider,
} from './markets/evercraft-voluntary.mjs';
import { negotiateCompute } from './compute-exchange.mjs';

async function json(url,{method='GET',headers={},body=null}={}){
  const response=await fetch(url,{
    method,
    headers:{'content-type':'application/json',...headers},
    body:body==null?undefined:JSON.stringify(body),
  });
  const payload=await response.json().catch(()=>({}));
  return {status:response.status,ok:response.ok,payload};
}

await assert.rejects(
  startVoluntaryComputeExchange({
    host:'0.0.0.0',
    port:0,
    providerAdmissionToken:'',
  }),
  /provider_admission_token_required_for_non_loopback_exchange/
);

const exchange=await startVoluntaryComputeExchange({
  host:'127.0.0.1',
  port:0,
  providerOfferTtlMs:60000,
  jobDeliveryLeaseMs:1000,
  maxLeaseSeconds:600,
});

try{
  const provider=await registerVoluntaryProvider({
    endpoint:exchange.endpoint,
    provider_id:'replay-proof-provider',
    resources:{cpu_units:2,memory_mb:2048,storage_gb:2},
    workload_classes:['saban.multiplier-assignment.v1'],
    economics:{zero_cost:true,hourly_usd:0},
    trust:{uptime_7d:1,attested:false},
  });

  const market=createEvercraftVoluntaryMarketAdapter({
    endpoint:exchange.endpoint,
    controlHeaders:exchange.controlHeaders,
    proposalPollMs:10,
    proposalTimeoutMs:3000,
  });

  const providerAccept=(async()=>{
    const deadline=Date.now()+3000;
    while(Date.now()<deadline){
      const proposal=await provider.pollProposal();
      if(proposal){
        return provider.respond(proposal,{decision:'accept'});
      }
      await sleep(10);
    }
    throw new Error('proposal_not_received');
  })();

  const negotiationPromise=negotiateCompute({
    demand:{
      demand_id:'replay-proof-demand',
      workload_class:'saban.multiplier-assignment.v1',
      cpu_units:1,
      memory_mb:512,
      storage_gb:0,
      duration_seconds:300,
      max_hourly_usd:0,
      max_total_usd:0,
      negotiation_level:'lease',
    },
    adapters:[market],
    quoteAuthority:{
      schema:'evercraft.saban.compute-authority.v1',
      approved:true,
      demand_id:'replay-proof-demand',
      allowed_markets:['evercraft-voluntary'],
    },
    leaseAuthority:{
      schema:'evercraft.saban.compute-authority.v1',
      approved:true,
      demand_id:'replay-proof-demand',
      allowed_markets:['evercraft-voluntary'],
      max_total_usd:0,
    },
  });
  await providerAccept;
  const negotiation=await negotiationPromise;
  assert.ok(negotiation.lease);

  const headers=exchange.controlHeaders();
  const jobsUrl=
    `${exchange.endpoint}/v1/control/agreements/${encodeURIComponent(negotiation.lease.agreement_id)}/jobs`;

  const first=await json(jobsUrl,{
    method:'POST',
    headers,
    body:{
      workload_class:'saban.multiplier-assignment.v1',
      idempotency_key:'replay-proof-idem',
      input:{software:'chum',assignment:{proof:1}},
    },
  });
  assert.equal(first.status,201);

  const firstDelivery=await provider.pollJob();
  assert.equal(firstDelivery.job_id,first.payload.job_id);
  assert.ok(firstDelivery.delivery_id);

  const duplicate=await json(jobsUrl,{
    method:'POST',
    headers,
    body:{
      workload_class:'saban.multiplier-assignment.v1',
      idempotency_key:'replay-proof-idem',
      input:{software:'chum',assignment:{proof:1}},
    },
  });
  assert.equal(duplicate.status,200);
  assert.equal(duplicate.payload.job_id,first.payload.job_id);
  assert.equal(duplicate.payload.deduplicated,true);

  const conflict=await json(jobsUrl,{
    method:'POST',
    headers,
    body:{
      workload_class:'saban.multiplier-assignment.v1',
      idempotency_key:'replay-proof-idem',
      input:{software:'chum',assignment:{proof:2}},
    },
  });
  assert.equal(conflict.status,409);
  assert.equal(conflict.payload.error,'idempotency_key_conflict');

  await sleep(1100);
  const redelivery=await provider.pollJob();
  assert.equal(redelivery.job_id,firstDelivery.job_id);
  assert.notEqual(redelivery.delivery_id,firstDelivery.delivery_id);

  await assert.rejects(
    provider.submitJobResult(firstDelivery,{
      ok:true,
      result:{stale:true},
      checkpoint:{step:1},
    }),
    /409:job_delivery_lease_invalid/
  );

  const accepted=await provider.submitJobResult(redelivery,{
    ok:true,
    result:{fresh:true},
    checkpoint:{step:1,state:'fresh'},
  });
  assert.equal(accepted.ok,true);

  const finalJob=await json(
    `${exchange.endpoint}/v1/control/jobs/${encodeURIComponent(first.payload.job_id)}`,
    {headers}
  );
  assert.equal(finalJob.payload.state,'completed');
  assert.deepEqual(finalJob.payload.result,{fresh:true});
  assert.ok(finalJob.payload.result_receipt.startsWith('sha256:'));

  const release=await market.release({lease:negotiation.lease});
  assert.ok(release.receipt_hash.startsWith('sha256:'));

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.saban.voluntary-delivery-safety-proof.v1',
    non_loopback_exchange_requires_provider_admission:true,
    duplicate_job_deduplicated:true,
    idempotency_conflict_rejected:true,
    expired_delivery_requeued:true,
    stale_result_rejected:true,
    fresh_redelivery_result_accepted:true,
    result_receipt:finalJob.payload.result_receipt,
    release_receipt:release.receipt_hash,
  },null,2));
}finally{
  await exchange.close();
}
