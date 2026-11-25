// Single bounded research cycle. No scheduler, contact actions or CRM writes.
import {collectNyc} from './nyc-buyer-source.mjs';
import {collectUk} from './uk-buyer-source.mjs';
import {collectSam} from './sam-buyer-source.mjs';
export function sourceRegistry({samKey}={}){
 return [
  {key:'nyc',enabled:true,collect:()=>collectNyc()},
  {key:'uk',enabled:true,collect:()=>collectUk()},
  {key:'sam',enabled:typeof samKey==='string'&&!!samKey.trim(),collect:()=>collectSam({apiKey:samKey,maxPages:1})}
 ];
}
// Only known numeric counters cross the persistence boundary.
const diagnosticKeys=['unique_notices','inactive_or_non_tender','expired_or_unverified_deadline','missing_buyer_or_title','unmatched_scope','invalid_notice_id'];
function boundedDiagnostics(r){
 const d={};
 for(const key of diagnosticKeys){
  const n=r.diagnostics?.[key];
  if(Number.isSafeInteger(n)&&n>=0&&n<=r.records_observed)d[key]=n;
 }
 if(Number.isSafeInteger(r.pages_observed)&&r.pages_observed>=1&&r.pages_observed<=10)d.pages_observed=r.pages_observed;
 return d;
}
export async function runDiscovery({sources=sourceRegistry(),now=new Date()}={}){
 if(!Array.isArray(sources)||sources.length>10||!Number.isFinite(+now))throw Error('invalid_cycle');
 const keys=new Set(),seen=new Set(),candidates=[],results=[];
 for(const s of sources){
  if(!/^[a-z][a-z0-9-]{0,39}$/.test(s.key)||keys.has(s.key))throw Error('invalid_source_key');
  keys.add(s.key);
  if(!s.enabled){results.push({source:s.key,state:'unconfigured',records:null,candidates:null});continue;}
  try{
   const r=await s.collect();
   if(r?.schema!=='evercraft.kaidance.buyer-source-receipt.v1'||r.send_performed!==false||r.qualified_count!==0||!Array.isArray(r.candidates)||r.candidates.length>500||!Number.isSafeInteger(r.records_observed)||r.records_observed<0)throw Error('invalid_source_receipt');
   const accepted=[];
   for(const c of r.candidates){
    if(c?.stage!=='research_required'||c.qualified!==false||c.contact_authorized!==false||typeof c.candidate_ref!=='string'||!c.candidate_ref.startsWith(s.key+':')||typeof c.source_url!=='string'||!c.source_url.startsWith('https://'))throw Error('invalid_candidate');
    accepted.push({candidate_ref:c.candidate_ref,source_url:c.source_url,buyer:c.buyer,title:c.title,deadline:c.deadline??c.deadline_local??null,deadline_timezone:c.deadline_timezone??null,suggested_lane:c.suggested_lane,stage:'research_required',qualified:false,contact_authorized:false});
   }
   let added=0;
   for(const c of accepted){if(seen.has(c.candidate_ref))continue;seen.add(c.candidate_ref);candidates.push(c);added++;}
   results.push({source:s.key,state:'observed',records:r.records_observed,candidates:added,coverage_complete:r.coverage_complete===true,diagnostics:boundedDiagnostics(r)});
  }catch{results.push({source:s.key,state:'held',records:null,candidates:null});}
 }
 return {schema:'evercraft.kaidance.discovery-cycle.v1',observed_at:now.toISOString(),sources:results,candidates,unique_candidates:candidates.length,qualified_count:0,send_performed:false,crm_write_performed:false};
}
