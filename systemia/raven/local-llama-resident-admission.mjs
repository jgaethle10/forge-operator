// The deployment request cannot select a new endpoint or grant itself admission.
// This validates configuration, not running model identity or process provenance.
const MODEL='leiland-qwen3-4b';
const ORIGIN='http://127.0.0.1:8080';
export function normalizeLocalLlamaResidentAdmission({input={},nodeId,ownerAdmission=false}={}){
 const provider=String(input.raven_inference_provider||'').trim().toLowerCase();
 const rawOrigin=input.raven_local_llama_origin;
 if(provider!=='llama.cpp'){
  if(rawOrigin)throw Error('raven_llama_origin_without_llama_provider');
  return null;
 }
 if(ownerAdmission!==true||nodeId!=='evercraft-node002-nextgen')
  throw Error('raven_llama_owner_node_admission_required');
 if(input.raven_inference_model!==MODEL||rawOrigin!==ORIGIN||
    input.raven_ollama_origin)
  throw Error('raven_llama_exact_binding_required');
 return {configured:true,provider:'llama.cpp',model:MODEL,
  ollama_origin:'',local_llama_origin:ORIGIN};
}
export function requireLocalLlamaResidentBinding({provider,model,origin,admitted=false}={}){
 if(provider!=='llama.cpp'){
  if(origin||admitted)throw Error('raven_llama_binding_without_provider');
  return {};
 }
 if(admitted!==true||model!==MODEL||origin!==ORIGIN)
  throw Error('raven_llama_resident_binding_required');
 return {allowLocalLlamaProof:true,localLlamaProofOrigin:ORIGIN};
}
