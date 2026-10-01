import { createHash, randomBytes } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

async function requestJson(url,{method='GET',headers={},body=null}={},timeoutMs=5000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{
      method,
      signal:controller.signal,
      headers:{
        'content-type':'application/json',
        ...headers,
      },
      body:body==null?undefined:JSON.stringify(body),
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(`${response.status}:${payload.error||'request_failed'}`);
    return payload;
  }finally{
    clearTimeout(timer);
  }
}

const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));

function quoteOfferFromProposal(baseOffer,proposal){
  return {
    ...baseOffer,
    offer_id:`evercraft-voluntary-quote:${proposal.proposal_id}`,
    provider_id:proposal.provider_id,
    market:'evercraft-voluntary',
    resources:{
      ...baseOffer.resources,
      cpu_units:Number(proposal.terms.cpu_units),
      memory_mb:Number(proposal.terms.memory_mb),
      storage_gb:Number(proposal.terms.storage_gb),
      gpu_count:Number(proposal.terms.gpu_count),
    },
    economics:{
      zero_cost:Number(proposal.terms.hourly_usd)===0,
      quoted:true,
      hourly_usd:Number(proposal.terms.hourly_usd),
      total_usd:Number(proposal.terms.total_usd),
      native_price:null,
    },
    quote_required:false,
    metadata:{
      ...(baseOffer.metadata||{}),
      proposal_id:proposal.proposal_id,
      proposal_origin:proposal.origin||null,
      proposal_round:proposal.round,
      proposal_state:proposal.state,
      workload_class:proposal.terms.workload_class,
    },
  };
}

export function createEvercraftVoluntaryMarketAdapter({
  endpoint,
  controlHeaders,
  proposalPollMs=100,
  proposalTimeoutMs=10000,
}={}){
  const base=String(endpoint||'').replace(/\/$/,'');
  if(!base) throw new Error('voluntary_exchange_endpoint_required');
  const headers=typeof controlHeaders==='function'?controlHeaders():{...(controlHeaders||{})};

  return {
    market:'evercraft-voluntary',

    async discover(){
      const result=await requestJson(`${base}/v1/offers`);
      const body={
        schema:'evercraft.saban.market-discovery.v1',
        market:'evercraft-voluntary',
        offer_count:Number(result.offers?.length||0),
        observed_at:result.observed_at||new Date().toISOString(),
      };
      return {
        offers:result.offers||[],
        receipt:{...body,receipt_hash:sha(body)},
      };
    },

    async requestQuotes({demand,offer}={}){
      const maxHourly=demand.economics.max_hourly_usd;
      const proposedHourly=offer.economics.hourly_usd==null
        ? (maxHourly==null?0:Number(maxHourly))
        : Number(offer.economics.hourly_usd);
      const created=await requestJson(`${base}/v1/control/proposals`,{
        method:'POST',
        headers,
        body:{
          demand_id:demand.demand_id,
          provider_id:offer.provider_id,
          terms:{
            cpu_units:demand.resources.cpu_units,
            memory_mb:demand.resources.memory_mb,
            storage_gb:demand.resources.storage_gb,
            gpu_count:demand.resources.gpu_count,
            duration_seconds:demand.duration_seconds,
            hourly_usd:proposedHourly,
            workload_class:demand.workload_class,
          },
        },
      });

      const deadline=Date.now()+proposalTimeoutMs;
      let state=null;
      while(Date.now()<deadline){
        state=await requestJson(
          `${base}/v1/control/proposals/${encodeURIComponent(created.proposal_id)}`,
          {headers}
        );
        if(['accepted','rejected','countered'].includes(state.proposal?.state)) break;
        await sleep(proposalPollMs);
      }
      if(!state) throw new Error('voluntary_proposal_no_state');
      if(state.proposal?.state==='rejected') throw new Error('voluntary_provider_rejected');
      if(state.proposal?.state==='pending') throw new Error('voluntary_proposal_timeout');

      const negotiated=state.proposal.state==='countered'
        ? state.counter_proposal
        : state.proposal;
      if(!negotiated) throw new Error('voluntary_negotiated_proposal_missing');

      const quoted=quoteOfferFromProposal(offer,negotiated);
      const body={
        schema:'evercraft.saban.voluntary-quote-round.v1',
        demand_id:demand.demand_id,
        initial_proposal_id:created.proposal_id,
        negotiated_proposal_id:negotiated.proposal_id,
        provider_id:offer.provider_id,
        outcome:state.proposal.state,
        round:Number(negotiated.round||1),
        quoted_total_usd:quoted.economics.total_usd,
        observed_at:new Date().toISOString(),
      };
      return {
        schema:body.schema,
        offers:[quoted],
        receipt:{...body,receipt_hash:sha(body)},
      };
    },

    async lease({demand,offer}={}){
      const proposalId=String(offer?.metadata?.proposal_id||'');
      if(!proposalId) throw new Error('voluntary_proposal_id_missing');

      if(offer.metadata?.proposal_origin==='provider'){
        await requestJson(
          `${base}/v1/control/proposals/${encodeURIComponent(proposalId)}/accept`,
          {method:'POST',headers,body:{}}
        );
      }

      const agreement=await requestJson(`${base}/v1/control/agreements`,{
        method:'POST',
        headers,
        body:{
          proposal_id:proposalId,
          lease_seconds:demand.duration_seconds,
        },
      });
      const body={
        schema:'evercraft.saban.voluntary-lease.v1',
        market:'evercraft-voluntary',
        demand_id:demand.demand_id,
        provider_id:offer.provider_id,
        proposal_id:proposalId,
        agreement_id:agreement.agreement_id,
        workload_class:demand.workload_class,
        expires_at:agreement.expires_at,
        estimated_total_usd:Number(offer.economics.total_usd||0),
        zero_cost:offer.economics.zero_cost===true,
        execution_ready:true,
        created_at:new Date().toISOString(),
      };
      return {...body,receipt:sha(body)};
    },

    async release({lease}={}){
      if(!lease?.agreement_id) throw new Error('voluntary_agreement_id_missing');
      return requestJson(
        `${base}/v1/control/agreements/${encodeURIComponent(lease.agreement_id)}/release`,
        {method:'POST',headers,body:{}}
      );
    },

    async execute({lease,workload_class,input,idempotency_key=null,checkpoint=null,timeoutMs=30000}={}){
      if(!lease?.agreement_id) throw new Error('voluntary_agreement_id_missing');
      const created=await requestJson(
        `${base}/v1/control/agreements/${encodeURIComponent(lease.agreement_id)}/jobs`,
        {
          method:'POST',
          headers,
          body:{
            workload_class,
            input,
            checkpoint,
            idempotency_key:idempotency_key||`idem-${randomBytes(8).toString('hex')}`,
          },
        }
      );
      const deadline=Date.now()+timeoutMs;
      while(Date.now()<deadline){
        const job=await requestJson(
          `${base}/v1/control/jobs/${encodeURIComponent(created.job_id)}`,
          {headers}
        );
        if(job.state==='completed') return job;
        if(job.state==='failed') throw new Error(`voluntary_job_failed:${job.error||'unknown'}`);
        await sleep(100);
      }
      throw new Error('voluntary_job_timeout');
    },
  };
}

export async function registerVoluntaryProvider({
  endpoint,
  provider_id,
  resources,
  workload_classes,
  economics={zero_cost:true,hourly_usd:0},
  placement={},
  trust={},
  terms_ref='evercraft-voluntary-v1',
}={}){
  const base=String(endpoint||'').replace(/\/$/,'');
  const registration=await requestJson(`${base}/v1/providers/register`,{
    method:'POST',
    body:{
      provider_id,
      resources,
      workload_classes,
      economics,
      placement,
      trust,
      terms_ref,
    },
  });
  const providerId=registration.provider_id;
  const providerToken=registration.provider_token;
  const providerHeaders={authorization:`Bearer ${providerToken}`};

  return {
    provider_id:providerId,
    registration_receipt:registration.receipt_hash,

    async pollProposal(){
      const result=await requestJson(
        `${base}/v1/providers/${encodeURIComponent(providerId)}/proposals`,
        {headers:providerHeaders}
      );
      return result.proposals?.[0]||null;
    },

    async respond(proposal,{decision,counter_terms=null,reason=null}={}){
      return requestJson(
        `${base}/v1/providers/${encodeURIComponent(providerId)}/proposals/${encodeURIComponent(proposal.proposal_id)}/respond`,
        {
          method:'POST',
          headers:providerHeaders,
          body:{decision,counter_terms,reason},
        }
      );
    },

    async agreements(){
      const result=await requestJson(
        `${base}/v1/providers/${encodeURIComponent(providerId)}/agreements`,
        {headers:providerHeaders}
      );
      return result.agreements||[];
    },

    async pollJob(){
      const result=await requestJson(
        `${base}/v1/providers/${encodeURIComponent(providerId)}/jobs/next`,
        {headers:providerHeaders}
      );
      return result.job||null;
    },

    async submitJobResult(job,{ok=true,result=null,error=null,checkpoint=null}={}){
      return requestJson(
        `${base}/v1/providers/${encodeURIComponent(providerId)}/jobs/${encodeURIComponent(job.job_id)}/result`,
        {
          method:'POST',
          headers:providerHeaders,
          body:{ok,result,error,checkpoint},
        }
      );
    },

    async heartbeat(){
      return requestJson(
        `${base}/v1/providers/${encodeURIComponent(providerId)}/heartbeat`,
        {method:'POST',headers:providerHeaders,body:{}}
      );
    },
  };
}
