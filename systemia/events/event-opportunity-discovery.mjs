// Event revenue intelligence: grounded public procurement review only.
// Never signs a bid, contacts a buyer, proposes a venue, or books an event.
import {createHash} from 'node:crypto';
const sha=x=>createHash('sha256').update(String(x)).digest('hex').slice(0,20);
const relevance=/(?:\bevents?\s+(?:planning|management|production|coordination|logistics|services)\b|\bfestival\b|\bconference\s+(?:management|production|organis(?:ation|ation)|organization|services|planning)\b|\b(?:live\s+event|concert\s+production|exhibition\s+management|sponsorship\s+management)\b)/i;
const officialUrl=url=>{
 try{const u=new URL(url);return u.protocol==='https:'&&
  ['www.find-tender.service.gov.uk','find-tender.service.gov.uk'].includes(u.hostname)&&
  !u.username&&!u.password&&!u.hash?u.href:null}catch{return null}
};
const str=(x,max=300)=>typeof x==='string'?x.trim().slice(0,max):'';
export function normalizePublicEventTender(release,{now=new Date()}={}){
 if(!release||typeof release!=='object'||Array.isArray(release))return null;
 const tags=Array.isArray(release.tag)?release.tag:[];
 if(!tags.includes('tender')||tags.some(t=>['tenderCancellation','award','contract','contractTermination'].includes(t)))return null;
 const tender=release.tender||{},title=str(tender.title,250),desc=str(tender.description,2400);
 if(!title||!relevance.test(title+' '+desc))return null;
 if(['cancelled','complete','withdrawn','unsuccessful'].includes(tender.status))return null;
 const buyer=str(release.buyer?.name||tender.procuringEntity?.name,200);
 if(!buyer)return null;
 const ocid=str(release.ocid,200);
 if(!/^ocds-[a-z0-9-]{8,150}$/i.test(ocid))return null;
 const documents=Array.isArray(tender.documents)?tender.documents:[];
 const source_url=[release.uri,...documents.map(d=>d?.url)]
  .map(officialUrl).find(Boolean);
 if(!source_url)return null;
 const clock=now instanceof Date?now:new Date(now);
 if(!Number.isFinite(clock.getTime()))throw Error('event_scout_invalid_clock');
 const rawEnd=tender.tenderPeriod?.endDate;
 const end=typeof rawEnd==='string'?Date.parse(rawEnd):NaN;
 if(Number.isFinite(end)&&end<clock.getTime())return null;
 const deadline=Number.isFinite(end)?new Date(end).toISOString():null;
 const amount=tender.value?.amount;
 const budget=typeof amount==='number'&&Number.isFinite(amount)&&amount>=0?
  {amount,currency:/^[A-Z]{3}$/.test(tender.value?.currency||'')?tender.value.currency:null}:null;
 const days=deadline?Math.ceil((end-clock.getTime())/86400000):null;
 const score=Math.min(100,35+(deadline?15:0)+(budget?5:0)+
   (/festival|conference|event production|event management/i.test(title)?18:0));
 return {
  opportunity_key:'event:'+sha(ocid),ocid,title,buyer,source_url,
  opportunity_kind:'public_event_services_tender',geography:'United Kingdom',
  observed_at:clock.toISOString(),deadline,budget,score,
  lifecycle:deadline?'needs_eligibility_and_scope_review':'deadline_unverified',
  source_status:'public_notice_pending_manual_review',buyer_contact_verified:false,
  eligibility_verified:false,proposal_sent:false,contract_awarded:false,
  revenue_confirmed:false,outreach_authorized:false,dispatch_authorized:false,
  first_action:'Open the official notice; verify live status, supplier eligibility, deadline, scope, budget, site and buyer before any proposal.',
  limitations:['Keyword relevance is not proof Evercraft is eligible or able to deliver','Notice data may be stale or amended','No client or partner contact permitted from this output']
 };
}
export function reconcileEventOpportunityBatch(packages,{now=new Date(),maxCandidates=20}={}){
 if(!Array.isArray(packages)||!Number.isInteger(maxCandidates)||maxCandidates<1||maxCandidates>50)
  throw Error('event_scout_invalid_batch');
 const clock=now instanceof Date?now:new Date(now);
 if(!Number.isFinite(clock.getTime()))throw Error('event_scout_invalid_clock');
 const matches=new Map(),sourceIssues=[];
 for(const pkg of packages){
  if(pkg?.releases&&!Array.isArray(pkg.releases)){sourceIssues.push('invalid_official_package');continue}
  if(!Array.isArray(pkg?.releases)){sourceIssues.push('source_package_missing');continue}
  for(const rel of pkg.releases.slice(0,200)){
   const o=normalizePublicEventTender(rel,{now:clock});
   if(!o)continue;
   // Later updates replace earlier observations for the same notice; no duplicate work.
   matches.set(o.opportunity_key,o);
  }
 }
 const all=[...matches.values()].sort((a,b)=>b.score-a.score||
  (a.deadline||'9999').localeCompare(b.deadline||'9999')||
  a.opportunity_key.localeCompare(b.opportunity_key));
 return {
  schema:'evercraft.events.opportunity-review.v1',observed_at:clock.toISOString(),
  source:'uk_find_a_tender_official_ocds',source_scope:'UK public procurement only; NOT global coverage',
  matches_found:all.length,candidates:all.slice(0,maxCandidates),
  truncated:all.length>maxCandidates,source_issues:sourceIssues,
  contract_revenue_confirmed:0,outreach_sent:0,production_bookings:0,
  automatically_executed:false,owner_approval_required:true,
  independent_buyer_verification_required:true
 };
}
