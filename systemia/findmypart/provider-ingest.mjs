// Normalize results returned by an explicitly configured, approved supplier/CAD adapter.
// This module does not fetch third-party data and does not certify part fitment.
import {addRecoveryEvidence} from './recovery-engine.mjs';
const tracks=new Set(['original','interchange','salvage','cad_fabrication','repair','engineered_substitute']);
const short=(v,n)=>String(v??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n);
export function ingestProviderResults(recovery,provider,results){
 if(!provider||typeof provider!=='object'||!provider.id||provider.approved!==true)
  throw Error('approved_provider_required');
 if(!Array.isArray(results)||results.length>50)throw Error('bounded_results_required');
 let state=recovery;const accepted=[],rejected=[];
 for(const [index,item] of results.entries()){
  try{
   if(!tracks.has(item?.track))throw Error('unsupported_track');
   if(!item?.url||!item?.description)throw Error('missing_source_evidence');
   if(item?.claimed_available===true||item?.claimed_compatible===true){
    // Claims may be recorded but never treated as independent validation.
   }
   state=addRecoveryEvidence(state,{
    track:item.track,url:item.url,
    claim:short(item.description,650),
    sourceType:'provider:'+short(provider.id,60)
   });
   accepted.push({index,track:item.track,source_url:item.url,
    provider_id:short(provider.id,60),fitment:'unverified',
    availability:'unverified',cad_manufacturability:'unverified'});
  }catch(error){rejected.push({index,reason:String(error?.message||'invalid_result')})}
 }
 return {recovery:state,receipt:{schema:'evercraft.findmypart.provider-ingest.v1',
  provider_id:short(provider.id,60),results_seen:results.length,accepted,rejected,
  externally_verified:false,provider_claims_are_not_confirmed:true}};
}
