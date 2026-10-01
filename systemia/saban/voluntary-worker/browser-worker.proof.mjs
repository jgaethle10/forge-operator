import assert from 'node:assert/strict';
import { startVoluntaryComputeExchange } from '../voluntary-exchange.mjs';
import { createBrowserVoluntaryWorker } from './browser-worker.mjs';
import { createEvercraftVoluntaryMarketAdapter } from '../markets/evercraft-voluntary.mjs';
import { negotiateCompute } from '../compute-exchange.mjs';

const exchange=await startVoluntaryComputeExchange({
  host:'127.0.0.1',
  port:0,
  providerOfferTtlMs:60000,
  maxLeaseSeconds:600,
});

let worker=null;
let market=null;
try{
  worker=await createBrowserVoluntaryWorker({
    exchangeEndpoint:exchange.endpoint,
    providerId:'browser-worker-proof',
    resources:{
      cpu_units:2,
      memory_mb:2048,
      storage_gb:1,
    },
    economics:{zero_cost:true,hourly_usd:0},
    handlers:{
      'evercraft.browser.sum.v1':async({input})=>({
        result:{sum:(input?.numbers||[]).reduce((a,b)=>a+Number(b),0)},
        checkpoint:{step:1,state:'done'},
      }),
    },
    decideProposal:async()=>({decision:'accept'}),
    pollMs:20,
    heartbeatMs:500,
    pauseWhenHidden:false,
  });
  worker.start();

  market=createEvercraftVoluntaryMarketAdapter({
    endpoint:exchange.endpoint,
    controlHeaders:exchange.controlHeaders,
    proposalPollMs:20,
    proposalTimeoutMs:3000,
  });

  const negotiation=await negotiateCompute({
    demand:{
      demand_id:'browser-proof-demand',
      workload_class:'evercraft.browser.sum.v1',
      cpu_units:1,
      memory_mb:512,
      storage_gb:0,
      duration_seconds:300,
      max_hourly_usd:0,
      max_total_usd:0,
      negotiation_level:'lease',
      prefer_zero_cost:true,
    },
    adapters:[market],
    quoteAuthority:{
      schema:'evercraft.saban.compute-authority.v1',
      approved:true,
      demand_id:'browser-proof-demand',
      allowed_markets:['evercraft-voluntary'],
    },
    leaseAuthority:{
      schema:'evercraft.saban.compute-authority.v1',
      approved:true,
      demand_id:'browser-proof-demand',
      allowed_markets:['evercraft-voluntary'],
      max_total_usd:0,
    },
  });

  assert.ok(negotiation.lease);
  assert.equal(negotiation.selected_offer.provider_id,'browser-worker-proof');
  assert.equal(negotiation.selected_offer.economics.zero_cost,true);

  const job=await market.execute({
    lease:negotiation.lease,
    workload_class:'evercraft.browser.sum.v1',
    input:{numbers:[11,13,17]},
    idempotency_key:'browser-proof-sum',
    timeoutMs:3000,
  });

  assert.equal(job.state,'completed');
  assert.equal(job.result.sum,41);
  assert.equal(job.checkpoint.step,1);
  assert.ok(job.result_receipt?.startsWith('sha256:'));

  const released=await market.release({lease:negotiation.lease});
  assert.ok(released.receipt_hash?.startsWith('sha256:'));

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.saban.browser-voluntary-worker-proof.v1',
    browser_compatible_provider_registered:true,
    host_supplied_handler_only:true,
    negotiated_through_same_exchange:true,
    bounded_job_executed:true,
    result:job.result,
    checkpoint:job.checkpoint,
    result_receipt:job.result_receipt,
    release_receipt:released.receipt_hash,
  },null,2));
}finally{
  if(worker) await worker.stop();
  if(market?.close) await market.close();
  await exchange.close();
}
