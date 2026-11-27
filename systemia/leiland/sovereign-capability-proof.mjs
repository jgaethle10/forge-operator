// Source-only operator canary over the EXISTING Raven gateway.
// Fixed fictional inputs, no product API, no scheduler, no public publication.
// Gateway bearer is an existing operator binding, not a new product credential.
import {createHash,randomUUID} from 'node:crypto';
import {createHttpInferenceAdapter} from '../raven/team-review-runtime.mjs';
const sha=x=>'sha256:'+createHash('sha256').update(x).digest('hex');
const schema='evercraft.leiland.sovereign-capability-proof.v1';
const boundary={synthetic_input:true,external_actions_authorized:false,
 purchase_authorized:false,publication_authorized:false,worker_dispatched:false};
const cases=Object.freeze([
 {lane:'findmypart',role:'leiland-repair-evidence-review',prompt:'Fictional QA case: a discontinued machine knob has an unverified listing. Name the two checks: exact part identity and equipment compatibility. Do not claim a fit or purchase.'},
 {lane:'atlas',role:'leiland-freight-evidence-review',prompt:'Fictional QA case: a draft freight record exists but carrier authority and delivery proof are missing. State that dispatch remains held. Do not dispatch or claim delivery.'}
]);
// Narrow known-answer fixture, ported from LEILAND-016 case A. Never use
// this oracle for real customer evidence or infer general model accuracy.
const extractionProfile='findmypart-extraction-fixture-v1';
const extractionPrompt='Fictional QA case. Extract part identifiers from the fictional text below. Return only JSON with two keys: "nameplate_part" and "catalog_part". Copy the exact identifier for each source, or use JSON null if absent. Do not infer, compare, recommend or add fields. Text: Equipment plate: replacement part TX-42. Catalog entry: part TX-42. Catalog availability and fitment not checked.';
// Deliberately accept only two literal fields in either order. No duplicate
// keys, escapes, extra text or nested values can pass this fixture contract.
export function validateSyntheticExtraction(raw){
 if(typeof raw!=='string'||Buffer.byteLength(raw,'utf8')>1024)return false;
 const m=raw.match(/^\s*\{\s*"(nameplate_part|catalog_part)"\s*:\s*"TX-42"\s*,\s*"(nameplate_part|catalog_part)"\s*:\s*"TX-42"\s*\}\s*$/);
 if(!m||m[1]===m[2])return false;
 try{JSON.parse(raw);return true}catch{return false}
}
export async function runSovereignCapabilityProof({origin='http://127.0.0.1:4322',token,
 fetchImpl=globalThis.fetch,allowInference=false,lane=null,expectedProvider='ollama',qualityProfile=null}={}){
 if(!['ollama','llama.cpp'].includes(expectedProvider))throw Error('leiland_local_provider_required');
 if(qualityProfile!==null&&(qualityProfile!==extractionProfile||lane!=='findmypart'||expectedProvider!=='llama.cpp'))throw Error('leiland_quality_profile_invalid');
 const selected=lane===null?cases:cases.filter(c=>c.lane===lane);
 if(!selected.length)throw Error('leiland_fixed_lane_required');
 const u=new URL(origin);
 if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.username||u.password||
    u.pathname!=='/'||u.search||u.hash)throw Error('leiland_loopback_gateway_required');
 if(typeof token!=='string'||token.trim().length<32||/[\x00-\x1f\x7f]/.test(token))
  throw Error('leiland_existing_operator_binding_required');
 const base=u.origin;
 const guardedFetch=(url,init={})=>{
  const target=new URL(url);
  if(target.origin!==base||!['/health','/v1/validate','/v1/infer'].includes(target.pathname))
   throw Error('leiland_gateway_route_denied');
  return fetchImpl(target.href,{...init,redirect:'error',cache:'no-store'});
 };
 const hold=reason=>({schema,state:'held',reason,model_validated:false,
  inference_completed:0,receipts:[],...boundary});
 let model,validation;
 try{
  const get=async(route,init)=>{
   const response=await guardedFetch(base+route,{...init,signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw Error('gateway_unavailable');
   return response.json();
  };
  const h=await get('/health',{method:'GET'});
  if(h.ok!==true||h.service!=='raven-inference-gateway'||h.provider!==expectedProvider||
    h.loopback_only!==true||h.base44_required!==false||
    h.external_side_effects_authorized!==false||typeof h.model!=='string'||!h.model)
   return hold('local_provider_not_verified');
  validation=await get('/v1/validate',{method:'POST',headers:{
   authorization:'Bearer '+token,'content-type':'application/json'},
   body:JSON.stringify({schema:'evercraft.raven.inference-validation.request.v1'})});
  if(validation.status!=='available'||validation.provider!==expectedProvider||
    validation.model!==h.model||validation.inference_performed!==false||
    validation.prompt_sent!==false||validation.base44_used!==false||
    validation.raw_credential_returned!==false||
    validation.external_side_effects_authorized!==false||
    !/^sha256:[a-f0-9]{64}$/.test(validation.validation_receipt||''))
   return hold('local_model_metadata_held');
  model=h.model;
 }catch{return hold('gateway_or_validation_unavailable')}
 const receipts=[];
 const report=state=>({schema,state,model_validated:true,provider:expectedProvider,
  model,validation_receipt:validation.validation_receipt,inference_completed:receipts.length,
  receipts,...boundary});
 if(allowInference!==true)return report('metadata_only');
 const adapter=createHttpInferenceAdapter({origin:base,token,fetchImpl:guardedFetch,timeoutMs:35000});
 for(const c of selected){
  try{
   const request_id='leiland-proof:'+randomUUID();
   const prompt=qualityProfile===extractionProfile?extractionPrompt:c.prompt;
   const r=await adapter.infer({request_id,role:c.role,prompt:expectedProvider==='llama.cpp'?prompt+' /no_think':prompt});
   if(r.provider!==expectedProvider||r.model!==model||
      !/^sha256:[a-f0-9]{64}$/.test(r.provider_receipt||'')||!r.text)
    throw Error('provider_receipt_mismatch');
   if(qualityProfile===extractionProfile&&!validateSyntheticExtraction(r.text))
    return {...report('held'),reason:'synthetic_extraction_validation_failed'};
   receipts.push({lane:c.lane,request_id,provider_receipt:r.provider_receipt,
    output_digest:sha(r.text),output_quality_verified:false,
    ...(qualityProfile===extractionProfile?{quality_profile:extractionProfile,synthetic_extraction_validated:true}: {})});
  }catch{return {...report('held'),reason:'inference_or_receipt_held'}}
 }
 return report('provider_reported_completed');
}
