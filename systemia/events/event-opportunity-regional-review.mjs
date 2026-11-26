// Regional public solicitation intake, reviewed against exact official notice URLs.
// No external fetching, no private contact data, no authority to bid or spend.
import {createHash} from 'node:crypto';
const digest=s=>'event:'+createHash('sha256').update(s).digest('hex').slice(0,20);
const CLASSES=new Set(['event_production','event_creative_service','creative_service_adjacent']);
export const REGIONAL_OFFICIAL_PORTALS=Object.freeze([
 {name:'OregonBuys open bids',scope:'Oregon agencies and participating local governments',
  url:'https://oregonbuys.gov/bso/view/search/external/advancedSearchBid.xhtml?openBids=true',
  access:'public_browser_search_not_machine_verified',candidate_import:'owner_review_only'},
 {name:'Washington WEBS bid calendar',scope:'Washington state and participating agencies',
  url:'https://pr-webs-vendor.des.wa.gov/BidCalendar.aspx',
  access:'public_browser_search_not_machine_verified',candidate_import:'owner_review_only'},
 {name:'Seattle procurement',scope:'City of Seattle opportunities',
  url:'https://www.seattle.gov/purchasing-and-contracting/purchasing',
  access:'official_directory_to_its_OpenGov_portal',candidate_import:'owner_review_only'}
]);
function officialOregonLink(url,reference){
 try{const u=new URL(url);
  return u.protocol==='https:'&&u.hostname==='oregonbuys.gov'&&
   u.pathname==='/bso/external/bidDetail.sda'&&
   u.searchParams.size===3&&u.searchParams.get('docId')===reference&&
   u.searchParams.get('external')==='true'&&u.searchParams.get('parentUrl')==='close'&&
   !u.username&&!u.password&&!u.hash?
   'https://oregonbuys.gov/bso/external/bidDetail.sda?docId='+encodeURIComponent(reference)+'&external=true&parentUrl=close':null;
 }catch{return null}
}
export function normalizeRegionalEventNotice(row,{now=new Date()}={}){
 const at=now instanceof Date?now:new Date(now);
 if(!Number.isFinite(at.getTime()))throw Error('regional_clock_invalid');
 if(!row||typeof row!=='object'||Array.isArray(row)||row.source!=='oregonbuys')return null;
 const ref=row.notice_id;
 if(typeof ref!=='string'||!/^S-[A-Z0-9]{3,12}-\d{8}$/.test(ref))return null;
 const url=officialOregonLink(row.source_url,ref);
 if(!url||!CLASSES.has(row.service_class))return null;
 if(typeof row.title!=='string'||row.title.length<8||row.title.length>260||
    typeof row.buyer!=='string'||row.buyer.length<5||row.buyer.length>160)return null;
 const date=row.reviewed_on;
 if(typeof date!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(date))return null;
 // A reviewed-on *date* is not a continuously updated live bid feed.
 // Use UTC calendar dates to avoid fabricating a more precise verification timestamp.
 const reviewed=Date.parse(date+'T00:00:00Z');
 const age=at.getTime()-reviewed;
 if(!Number.isFinite(reviewed)||age< -86400000||age>72*3600000)return null;
 const deadlineRaw=row.deadline_iso;
 if(typeof deadlineRaw!=='string'||
    !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(deadlineRaw))return null;
 const deadline=Date.parse(deadlineRaw);
 if(!Number.isFinite(deadline)||deadline<=at.getTime())return null;
 if(row.status!=='listed_open_on_review_date')return null;
 const score=row.service_class==='event_production'?72:
  row.service_class==='event_creative_service'?58:40;
 return {opportunity_key:digest('oregonbuys:'+ref),
  source:'oregonbuys_manual_verified_notice',notice_id:ref,
  source_url:url,title:row.title,buyer:row.buyer,
  service_class:row.service_class,
  geography:'Oregon, USA',reviewed_on:date,
  deadline:new Date(deadline).toISOString(),score,
  source_status:'official_notice_seen_on_review_date_recheck_required',
  lifecycle:'regional_manual_scope_and_eligibility_review',
  budget:null,revenue_confirmed:false,contract_awarded:false,
  eligibility_verified:false,delivery_partner_verified:false,
  buyer_contact_verified:false,prior_outreach_history_checked:false,
  outreach_authorized:false,dispatch_authorized:false,
  first_action:'Reopen official OregonBuys notice, review attachments and live status; verify registration, qualifications, delivery partner, real budget and prior Evercraft contact before any founder-approved response.',
  limitations:['Manual evidence expires after 72 hours','Portal listing is not proof of current availability','No automated outreach or bid submission']
 };
}
export function reviewRegionalEventCandidates(rows,{now=new Date(),maxCandidates=12}={}){
 if(!Array.isArray(rows)||!Number.isInteger(maxCandidates)||maxCandidates<1||maxCandidates>30)
  throw Error('regional_candidates_invalid');
 const unique=new Map();
 for(const row of rows.slice(0,100)){
  const c=normalizeRegionalEventNotice(row,{now});
  if(c)unique.set(c.opportunity_key,c);
 }
 const candidates=[...unique.values()].sort((a,b)=>b.score-a.score||
  a.deadline.localeCompare(b.deadline)||a.opportunity_key.localeCompare(b.opportunity_key))
  .slice(0,maxCandidates);
 return {schema:'evercraft.events.regional-review.v1',
  observed_at:new Date(now).toISOString(),
  source_scope:'Only manually reviewed OregonBuys notices; WA/Seattle are official review links, not machine-monitored listings',
  official_portals:REGIONAL_OFFICIAL_PORTALS,
  candidates,scanned:Math.min(rows.length,100),
  source_claims_live:false,outreach_sent:0,
  qualification_confirmed:0,earned_revenue:0};
}
