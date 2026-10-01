import { verifyMicroSeedExecutionReceipt } from './microseed-receipt-signature.mjs';
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

  async function authContext(manifest){
    if(manifest?.bridge_mode!=='native_agent'||manifest?.compute_execution_mode!=='native_device'){
      throw new Error('microseed_native_agent_manifest_required');
    }
    const base=validateEndpoint(manifest.endpoint,{allowInsecureLan});
    const token=clean(await credentialResolver({
      device_id:manifest.device_id,
      manifest,
    }));
    if(!token) throw new Error('microseed_native_agent_credential_missing');
    return {base,token};
  }

  return {
    async telemetry({manifest}={}){
      const {base,token}=await authContext(manifest);
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeoutMs||10000)));
      try{
        const endpoint=new URL('/v1/telemetry',base);
        const response=await fetchImpl(endpoint,{
          method:'GET',
          headers:{authorization:'Bearer '+token,accept:'application/json'},
          signal:controller.signal,
        });
        const body=await readBoundedJson(response);
        if(!response.ok||body?.ok!==true||body?.schema!=='evercraft.microseed.device-telemetry.v1'){
          throw new Error('microseed_native_agent_telemetry_http_'+response.status+':'+clean(body?.error||'telemetry_failed'));
        }
        if(body.device_id!==manifest.device_id){
          throw new Error('microseed_native_agent_telemetry_device_mismatch');
        }
        return body.telemetry||{};
      }finally{
        clearTimeout(timer);
      }
    },

    async execute({manifest,workload_class,payload,idempotency_key}={}){
      const {base,token}=await authContext(manifest);

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

        const signingRequired=manifest.attestation?.receipt_signing_required===true;
        let signatureVerification=null;
        if(signingRequired||body?.device_signature){
          signatureVerification=verifyMicroSeedExecutionReceipt(body,{
            publicKey:manifest.attestation?.receipt_public_key_pem||null,
            expected_device_id:manifest.device_id,
          });
          if(signingRequired&&signatureVerification.verified!==true){
            throw new Error('microseed_native_agent_signature_rejected:'+signatureVerification.reason);
          }
        }

        return {
          ok:true,
          schema:'evercraft.microseed.native-agent-relay-result.v1',
          remote_device_id:manifest.device_id,
          remote_execution_location:body.execution_location||null,
          remote_receipt_hash:body.receipt_hash||null,
          remote_result:body.result??null,
          remote_arbitrary_code_execution:body.arbitrary_code_execution===true,
          remote_signature_verified:signatureVerification?.verified===true,
          remote_signature_key_id:signatureVerification?.key_id||null,
          remote_signature_payload_sha256:signatureVerification?.payload_sha256||null,
          credential_exposed:false,
        };
      }finally{
        clearTimeout(timer);
      }
    },
  };
}
