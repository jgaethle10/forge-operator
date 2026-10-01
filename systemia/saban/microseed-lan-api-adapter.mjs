function clean(v){return String(v??'').trim();}

function validateBase(value,{allowInsecureLan=false}={}){
  const url=new URL(String(value||''));
  const loopback=['127.0.0.1','localhost','::1'].includes(url.hostname.toLowerCase());
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&(loopback||allowInsecureLan))){
    throw new Error('microseed_lan_api_https_or_explicit_lan_required');
  }
  if(url.username||url.password) throw new Error('microseed_lan_api_url_credentials_forbidden');
  return url;
}

async function boundedJson(response,maxBytes=512*1024){
  const text=await response.text();
  if(Buffer.byteLength(text)>maxBytes) throw new Error('microseed_lan_api_response_too_large');
  if(!text)return null;
  try{return JSON.parse(text);}
  catch{throw new Error('microseed_lan_api_response_invalid_json');}
}

export function createMicroSeedLanApiAdapter({
  credentialResolver=async()=>null,
  fetchImpl=fetch,
  allowInsecureLan=false,
  timeoutMs=10000,
}={}){
  if(typeof credentialResolver!=='function'){
    throw new Error('microseed_lan_api_credential_resolver_required');
  }

  return {
    async invokeCapability({
      manifest,
      capability,
      operation,
      payload,
      idempotency_key,
      approval_ref,
    }={}){
      if(manifest?.bridge_mode!=='lan_api') throw new Error('microseed_lan_api_manifest_required');
      const mapping=capability?.metadata?.http?.operations?.[operation];
      if(!mapping) throw new Error('microseed_lan_api_operation_mapping_required');

      const base=validateBase(capability.endpoint||manifest.endpoint,{allowInsecureLan});
      const pathValue=String(mapping.path||'').trim();
      if(!pathValue.startsWith('/')) throw new Error('microseed_lan_api_operation_path_invalid');
      const method=String(mapping.method||'GET').toUpperCase();
      if(!['GET','POST','PUT','PATCH','DELETE'].includes(method)){
        throw new Error('microseed_lan_api_method_invalid');
      }
      if(
        ['POST','PUT','PATCH','DELETE'].includes(method) &&
        capability.kind==='actuation' &&
        !clean(approval_ref)
      ){
        throw new Error('microseed_lan_api_actuation_approval_required');
      }

      const credential=await credentialResolver({
        device_id:manifest.device_id,
        capability,
        operation,
        manifest,
      });
      const headers={
        accept:'application/json',
        'x-evercraft-idempotency-key':String(idempotency_key||''),
      };
      if(credential?.bearer) headers.authorization='Bearer '+String(credential.bearer);
      if(credential?.headers&&typeof credential.headers==='object'){
        for(const [key,value] of Object.entries(credential.headers)){
          if(/^(host|content-length|connection)$/i.test(key)) continue;
          headers[key]=String(value);
        }
      }

      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeoutMs||10000)));
      try{
        const endpoint=new URL(pathValue,base);
        const init={method,headers,signal:controller.signal};
        if(method!=='GET'&&method!=='DELETE'){
          headers['content-type']='application/json';
          init.body=JSON.stringify(payload??null);
        }
        const response=await fetchImpl(endpoint,init);
        const body=await boundedJson(response);
        if(!response.ok){
          throw new Error(
            'microseed_lan_api_http_'+response.status+':'+clean(body?.error||'operation_failed')
          );
        }
        return {
          ok:true,
          schema:'evercraft.microseed.lan-api-result.v1',
          status:response.status,
          method,
          path:pathValue,
          body,
          credential_exposed:false,
          approval_value_exposed:false,
        };
      }finally{
        clearTimeout(timer);
      }
    },
  };
}
