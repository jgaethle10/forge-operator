function clean(v){return String(v??'').trim();}

function validateEndpoint(value,{allowInsecureLan=false}={}){
  const url=new URL(String(value||''));
  const loopback=['127.0.0.1','localhost','::1'].includes(url.hostname.toLowerCase());
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&(loopback||allowInsecureLan))){
    throw new Error('microseed_native_agent_https_or_explicit_lan_required');
  }
  if(url.username||url.password) throw new Error('microseed_native_agent_url_credentials_forbidden');
  return url;
}

async function readBoundedJson(response,maxBytes=256*1024){
  const text=await response.text();
  if(Buffer.byteLength(text)>maxBytes) throw new Error('microseed_native_agent_response_too_large');
  try{return JSON.parse(text);}
  catch{throw new Error('microseed_native_agent_response_invalid_json');}
}

export function createMicroSeedNativeAgentAdapter({
  credentialResolver,
  fetchImpl=fetch,
  allowInsecureLan=false,
  timeoutMs=10000,
}={}){
  if(typeof credentialResolver!=='function'){
    throw new Error('microseed_native_agent_credential_resolver_required');
  }

  return {
    async execute({manifest,workload_class,payload,idempotency_key}={}){
      if(manifest?.bridge_mode!=='native_agent'||manifest?.compute_execution_mode!=='native_device'){
        throw new Error('microseed_native_agent_manifest_required');
      }
      const base=validateEndpoint(manifest.endpoint,{allowInsecureLan});
      const token=clean(await credentialResolver({
        device_id:manifest.device_id,
        manifest,
      }));
      if(!token) throw new Error('microseed_native_agent_credential_missing');

      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeoutMs||10000)));
      try{
        const endpoint=new URL('/v1/execute',base);
        const idempotencyKey=clean(idempotency_key);
        if(!idempotencyKey) throw new Error('microseed_native_agent_idempotency_key_required');
        const requestPayload=payload;
        const response=await fetchImpl(endpoint,{
          method:'POST',
          headers:{
            authorization:'Bearer '+token,
            'content-type':'application/json',
            accept:'application/json',
          },
          body:JSON.stringify({
            request:{
              device_id:manifest.device_id,
              workload_class,
              idempotency_key:idempotencyKey,
              payload:requestPayload,
              requested_memory_mb:0,
              requested_cpu_fraction:0,
            },
          }),
          signal:controller.signal,
        });
        const body=await readBoundedJson(response);
        if(!response.ok||body?.ok!==true){
          throw new Error('microseed_native_agent_http_'+response.status+':'+clean(body?.error||'execution_failed'));
        }
        return {
          ok:true,
          schema:'evercraft.microseed.native-agent-relay-result.v1',
          remote_device_id:manifest.device_id,
          remote_execution_location:body.execution_location||null,
          remote_receipt_hash:body.receipt_hash||null,
          remote_result:body.result??null,
          remote_arbitrary_code_execution:body.arbitrary_code_execution===true,
          credential_exposed:false,
        };
      }finally{
        clearTimeout(timer);
      }
    },
  };
}
