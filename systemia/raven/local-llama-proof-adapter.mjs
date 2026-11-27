// Isolated proof transport, not a registered resident provider.
// Only an explicit IPv4 loopback origin and exact selected model are accepted.
export function createLocalLlamaProofAdapter({origin,model,fetchImpl=globalThis.fetch,timeoutMs=35000}={}){
 const u=new URL(origin);
 if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port||u.username||u.password||
    u.pathname!=='/'||u.search||u.hash)throw Error('llama_proof_loopback_origin_required');
 if(typeof model!=='string'||!model.trim())throw Error('llama_proof_model_required');
 async function request(route,body){
  const res=await fetchImpl(u.origin+route,{method:body?'POST':'GET',
   redirect:'error',cache:'no-store',signal:AbortSignal.timeout(timeoutMs),
   headers:{accept:'application/json',...(body?{'content-type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  if(!res.ok)throw Error('llama_proof_backend_held');
  return res.json();
 }
 function result(extra){return {provider:'llama.cpp',model,
  provider_request_id:null,credential_ref:null,...extra}}
 return {
  async validate(){
   const data=await request('/v1/models');
   if(!Array.isArray(data?.data)||!data.data.some(x=>x?.id===model))
    throw Error('llama_proof_model_mismatch');
   return result({metadata_endpoint:'/v1/models'});
  },
  async infer(input){
   if(typeof input!=='string'||!input.trim()||input.length>2000)throw Error('llama_proof_input_bound');
   const body=await request('/v1/chat/completions',{model,messages:[{role:'user',content:input}],
    max_tokens:192,temperature:0.2,stream:false});
   const text=body?.choices?.[0]?.message?.content;
   if(body?.model!==model||typeof text!=='string'||!text.trim()||text.length>10000||
    body?.choices?.[0]?.message?.tool_calls?.length)throw Error('llama_proof_output_held');
   return result({text:text.trim()});
  }
 };
}
