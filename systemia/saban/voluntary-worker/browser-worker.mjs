const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));

async function requestJson(url,{method='GET',headers={},body=null}={}){
  const response=await fetch(url,{
    method,
    headers:{
      'content-type':'application/json',
      ...headers,
    },
    body:body==null?undefined:JSON.stringify(body),
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(`${response.status}:${payload.error||'request_failed'}`);
  return payload;
}

function detectedResources(overrides={}){
  const cpu=Number(overrides.cpu_units||globalThis.navigator?.hardwareConcurrency||1);
  const deviceMemory=Number(overrides.memory_gb||globalThis.navigator?.deviceMemory||0);
  return {
    cpu_units:Math.max(0.25,cpu),
    memory_mb:Math.max(256,Number(overrides.memory_mb||deviceMemory*1024||512)),
    storage_gb:Math.max(0,Number(overrides.storage_gb||0)),
    gpu_count:Math.max(0,Number(overrides.gpu_count||0)),
    gpu_models:Array.isArray(overrides.gpu_models)?overrides.gpu_models:[],
  };
}

export async function createBrowserVoluntaryWorker({
  exchangeEndpoint,
  providerId,
  handlers,
  resources={},
  economics={zero_cost:true,hourly_usd:0},
  decideProposal=async()=>({decision:'accept'}),
  pollMs=1000,
  heartbeatMs=30000,
  pauseWhenHidden=true,
  admissionToken='',
}={}){
  const base=String(exchangeEndpoint||'').replace(/\/$/,'');
  if(!base) throw new Error('exchangeEndpoint_required');
  if(!providerId) throw new Error('providerId_required');
  if(!handlers||typeof handlers!=='object'||!Object.keys(handlers).length){
    throw new Error('at_least_one_workload_handler_required');
  }
  for(const [workload,handler] of Object.entries(handlers)){
    if(typeof handler!=='function') throw new Error(`invalid_handler:${workload}`);
  }

  const registration=await requestJson(`${base}/v1/providers/register`,{
    method:'POST',
    headers:admissionToken
      ? {'x-evercraft-provider-admission':String(admissionToken)}
      : {},
    body:{
      provider_id:providerId,
      resources:detectedResources(resources),
      workload_classes:Object.keys(handlers),
      economics,
      trust:{uptime_7d:0,attested:false},
      terms_ref:'evercraft-browser-voluntary-worker-v1',
    },
  });
  const headers={authorization:`Bearer ${registration.provider_token}`};
  let running=false;
  let loopPromise=null;
  let lastHeartbeat=0;
  const seenProposals=new Set();
  const seenJobs=new Set();

  const heartbeat=async()=>{
    const result=await requestJson(
      `${base}/v1/providers/${encodeURIComponent(providerId)}/heartbeat`,
      {method:'POST',headers,body:{}}
    );
    lastHeartbeat=Date.now();
    return result;
  };

  const handleProposal=async()=>{
    const result=await requestJson(
      `${base}/v1/providers/${encodeURIComponent(providerId)}/proposals`,
      {headers}
    );
    const proposal=(result.proposals||[]).find((row)=>!seenProposals.has(row.proposal_id));
    if(!proposal) return null;
    seenProposals.add(proposal.proposal_id);
    if(!handlers[proposal.terms?.workload_class]){
      return requestJson(
        `${base}/v1/providers/${encodeURIComponent(providerId)}/proposals/${encodeURIComponent(proposal.proposal_id)}/respond`,
        {
          method:'POST',
          headers,
          body:{decision:'reject',reason:'workload_handler_not_registered'},
        }
      );
    }
    const decision=await decideProposal(structuredClone(proposal));
    const allowed=new Set(['accept','counter','reject']);
    if(!allowed.has(String(decision?.decision||''))){
      throw new Error('proposal_decision_invalid');
    }
    return requestJson(
      `${base}/v1/providers/${encodeURIComponent(providerId)}/proposals/${encodeURIComponent(proposal.proposal_id)}/respond`,
      {
        method:'POST',
        headers,
        body:{
          decision:decision.decision,
          counter_terms:decision.counter_terms||null,
          reason:decision.reason||null,
        },
      }
    );
  };

  const handleJob=async()=>{
    const result=await requestJson(
      `${base}/v1/providers/${encodeURIComponent(providerId)}/jobs/next`,
      {headers}
    );
    const job=result.job;
    if(!job||seenJobs.has(job.job_id)) return null;
    seenJobs.add(job.job_id);
    const handler=handlers[job.workload_class];
    if(typeof handler!=='function'){
      return requestJson(
        `${base}/v1/providers/${encodeURIComponent(providerId)}/jobs/${encodeURIComponent(job.job_id)}/result`,
        {
          method:'POST',
          headers,
          body:{
            ok:false,
            error:'workload_handler_not_registered',
            delivery_id:job.delivery_id,
          },
        }
      );
    }
    try{
      const output=await handler({
        input:structuredClone(job.input),
        checkpoint:structuredClone(job.checkpoint),
        job_id:job.job_id,
        agreement_id:job.agreement_id,
      });
      return requestJson(
        `${base}/v1/providers/${encodeURIComponent(providerId)}/jobs/${encodeURIComponent(job.job_id)}/result`,
        {
          method:'POST',
          headers,
          body:{
            ok:true,
            result:output?.result??output??null,
            checkpoint:output?.checkpoint??null,
            delivery_id:job.delivery_id,
          },
        }
      );
    }catch(error){
      return requestJson(
        `${base}/v1/providers/${encodeURIComponent(providerId)}/jobs/${encodeURIComponent(job.job_id)}/result`,
        {
          method:'POST',
          headers,
          body:{
            ok:false,
            error:String(error?.message||error),
            delivery_id:job.delivery_id,
          },
        }
      );
    }
  };

  const shouldPause=()=>Boolean(
    pauseWhenHidden&&globalThis.document?.visibilityState==='hidden'
  );

  const tick=async()=>{
    if(Date.now()-lastHeartbeat>=heartbeatMs) await heartbeat();
    if(shouldPause()) return {paused:true};
    const proposal=await handleProposal();
    const job=await handleJob();
    return {paused:false,proposal:Boolean(proposal),job:Boolean(job)};
  };

  const loop=async()=>{
    while(running){
      try{await tick();}catch(error){
        globalThis.console?.warn?.('Evercraft voluntary worker tick failed',error);
      }
      await sleep(Math.max(250,pollMs));
    }
  };

  return {
    schema:'evercraft.browser-voluntary-worker.v1',
    provider_id:providerId,
    registration_receipt:registration.receipt_hash,
    workload_classes:Object.keys(handlers),
    resources:detectedResources(resources),
    tick,
    start(){
      if(running) return loopPromise;
      running=true;
      loopPromise=loop();
      return loopPromise;
    },
    async stop(){
      running=false;
      await loopPromise;
      loopPromise=null;
    },
  };
}
