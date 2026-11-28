import {canadaNoticeUrl} from './ca-notice-url.mjs';
// Pure research handoff; does not admit contacts, invoke agents or send messages.
import {createHash} from 'node:crypto';
const lanes=Object.freeze({'media':'commercial-media','commercial-media':'commercial-media','software':'software','research':'research','ev-planning':'ev-planning'});
export function planBuyerResearch(checkpoint,{now=new Date(),limit=25}={}){
 if(checkpoint?.schema!=='evercraft.kaidance.discovery-checkpoint.v1'||!Array.isArray(checkpoint.records)||checkpoint.records.length>20000||!Number.isInteger(limit)||limit<1||limit>100||!Number.isFinite(+now))throw Error('invalid_research_input');
 const jobs=[],seen=new Set();let held=0;
 for(const c of checkpoint.records){
  const lane=Object.hasOwn(lanes,c?.suggested_lane)?lanes[c.suggested_lane]:null;
  if(!lane||c.stage!=='research_required'||c.qualified!==false||c.contact_authorized!==false||typeof c.candidate_ref!=='string'||! /^(nyc|sam|uk|ca):[a-z0-9]{1,40}$/.test(c.candidate_ref)||seen.has(c.candidate_ref)||typeof c.buyer!=='string'||!c.buyer.trim()||typeof c.title!=='string'||!c.title.trim()){held++;continue;}
  let u;try{u=new URL(c.source_url);}catch{held++;continue;}
  const expected={nyc:'data.cityofnewyork.us',sam:'sam.gov',uk:'www.find-tender.service.gov.uk',ca:'canadabuys.canada.ca'}[c.candidate_ref.split(':')[0]];
  if(c.candidate_ref.startsWith('uk:')&&!/^\/Notice\/\d{6}-\d{4}$/.test(u.pathname)){held++;continue;}
  if(c.candidate_ref.startsWith('ca:')){if(!canadaNoticeUrl(c.source_url)){held++;continue;}}
  else if(u.protocol!=='https:'||u.hostname!==expected||u.username||u.password||u.port){held++;continue;}
  // Local wall-clock deadlines require independent verification; do not invent an offset.
  let due=null;
  if(c.deadline_timezone===null&&typeof c.deadline==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(c.deadline)){
   due=Date.parse(c.deadline);if(!Number.isFinite(due)||due<=+now){held++;continue;}
  }
  // Rank unverified wall-clock deadlines by earliest plausible closing instant.
  // This is scheduling urgency only, never a verified deadline or contact authority.
  if(c.deadline_timezone==='unverified-source-local'){
   if(typeof c.deadline!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(c.deadline)){held++;continue;}
   const wall=Date.parse(c.deadline+'Z');
   if(!Number.isFinite(wall)||new Date(wall).toISOString().slice(0,19)!==c.deadline||wall+14*3600000<=+now){held++;continue;}
   due=wall-14*3600000;
  }
  seen.add(c.candidate_ref);
  const fingerprint=createHash('sha256').update(JSON.stringify([c.candidate_ref,c.source_url,c.buyer,c.title,c.deadline,c.deadline_timezone,lane])).digest('hex');
  jobs.push({job_ref:'buyer-research:'+fingerprint,source_ref:c.candidate_ref,source_url:u.href,buyer:c.buyer.slice(0,300),title:c.title.slice(0,300),offer_lane_hint:lane,deadline:c.deadline??null,deadline_timezone:c.deadline_timezone??null,sort_due:due??Number.MAX_SAFE_INTEGER,required_evidence:['original_request_current','buyer_identity','eligibility_and_submission_rules','specific_scope_and_fulfillment','approved_response_channel','payment_terms'],stage:'research_pending',contact_authorized:false,execution_authorized:false});
 }
 jobs.sort((a,b)=>a.sort_due-b.sort_due||a.job_ref.localeCompare(b.job_ref));
 return {schema:'evercraft.kaidance.buyer-research-plan.v1',observed_at:now.toISOString(),jobs:jobs.slice(0,limit).map(({sort_due,...job})=>job),held,eligible_for_research:jobs.length,qualified_count:0,dispatch_performed:false,send_performed:false};
}
