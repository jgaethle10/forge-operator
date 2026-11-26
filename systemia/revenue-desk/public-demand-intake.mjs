import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
// Search hits are untrusted pointers, never proof of purchasing demand.
export function planPublicDemandResearch({hits,now=new Date(),limit=20}={}){
 if(!Array.isArray(hits)||hits.length>200||!Number.isFinite(+now)||!Number.isInteger(limit)||limit<1||limit>40)throw Error('invalid_public_demand_bounds');
 const jobs=[],seen=new Set();let held=0;
 for(const h of hits){
  let u;try{u=new URL(h?.url)}catch{held++;continue;}
  if(u.protocol!=='https:'||u.username||u.password||u.port||!u.hostname.includes('.')||/^(?:\d|\[)|(?:\.local|\.internal|\.localhost)$/.test(u.hostname)||typeof h.title!=='string'||!h.title.trim()||!['commercial-media','software','ev-planning','research'].includes(h.lane)){held++;continue;}
  u.hash='';
  const ref='public-demand:'+hash(u.href);
  if(seen.has(ref))continue;seen.add(ref);
  jobs.push({job_ref:ref,source_url:u.href,title:h.title.slice(0,300),lane:h.lane,stage:'source_research_required',source_status:'search_pointer_unverified',required_evidence:['original_buyer_request','current_deadline_or_active_need','buyer_identity','regional_and_subcontract_eligibility','specific_deliverable_and_fulfillment','approved_response_channel','payment_terms','contact_history_and_suppression_review'],qualified:false,contact_authorized:false,execution_authorized:false});
 }
 return {schema:'evercraft.public-demand-research-plan.v1',observed_at:now.toISOString(),jobs:jobs.slice(0,limit),held,truncated:jobs.length>limit,search_performed:false,send_performed:false};
}
