#!/usr/bin/env node
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {classifyIBMiDirectBuyerEvidence} from '../organism/ibmi-direct-buyer-signal.mjs';
import {buildIBMiBuyerResearchQueue} from '../organism/ibmi-direct-buyer-queue.mjs';

export function buildFirstOfferBuyerResearch(pack){
 if(pack?.schema!=='evercraft.systemia.ibmi.public-buyer-observation-pack.v1')throw new Error('buyer_observations_schema_invalid');
 const observations=pack.observations;
 if(!Array.isArray(observations))throw new Error('buyer_observations_array_required');
 const classified=observations.map((observation)=>{
  const finding=classifyIBMiDirectBuyerEvidence({
   company:observation.company,url:observation.url,text:observation.text,
   source_type:observation.source_type,observed_at:observation.observed_at
  });
  const noContactAllowed=['unnamed_end_buyer_third_party_recruiter','formal_competitive_procurement_large_infrastructure'].includes(observation.audience_type);
  return {...finding,
   observed_audience_type:observation.audience_type,
   observation_state:observation.source_state,
   role_of_source:noContactAllowed?'context_not_target':'research_only_not_qualified_buyer',
   outreach_state:'not_authorized',
   independent_7_4_release_evidence: Boolean(finding.observed_release==='7.4'),
   direct_purchase_intent_confirmed:false,
   decision: noContactAllowed?'hold_due_to_target_mismatch':'verify_actual_release_and_business_trigger_before_any_contact',
   derived_from_source_ref:observation.url
  };
 });
 const rawQueue=buildIBMiBuyerResearchQueue({
  buyers:classified.map(row=>({
   company:row.company,source_name:row.company,source_ref:row.derived_from_source_ref,
   observed_at:row.observed_at,score:row.score,evidence_quality:row.evidence_quality,
   technology_use_state:row.technology_use_state,release_state:row.release_state,observed_release:row.observed_release,
   recommended_offer_key:row.recommended_offer_key,upgrade_need_state:row.upgrade_need_state
  }))
 });
 return {
  schema:'evercraft.systemia.ibmi.first-offer-buyer-research.v1',
  mission_key:'systemia-first-commercial-offer-2026-10-07',
  source_count:classified.length,observations:classified,
  queue:rawQueue.prospects.map(row=>{
   const origin=classified.find(item=>item.derived_from_source_ref===row.source_ref);
   return {...row,queue_state:origin?.decision==='hold_due_to_target_mismatch'?'hold':row.queue_state,
    contact_state:'unverified',outreach_state:'not_authorized',
    release_7_4_unverified:row.observed_release!=='7.4',
    buyer_intent_unverified:true,reason:origin?.decision||'reverify_before_contact'};
  }),
  verified_buyer_count:0,permissioned_contact_count:0,real_payment_count:null,
  classification_is_not_authority:true,automatic_outreach_allowed:false
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const file=new URL('./ibmi-public-buyer-observations-2026-10-07.json',import.meta.url);
 process.stdout.write(JSON.stringify(buildFirstOfferBuyerResearch(JSON.parse(fs.readFileSync(file,'utf8'))),null,2)+'\n');
}
