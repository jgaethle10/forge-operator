// SAM.gov Public Opportunities API v2: source-only event services discovery.
// API-key use is handled ONLY by the caller. Never record personal keys, POCs or source body.
import {createHash} from 'node:crypto';
const digest=x=>createHash('sha256').update(x).digest('hex').slice(0,20);
const text=(x,n=320)=>typeof x==='string'?x.trim().slice(0,n):'';
const MATCH=/\b(?:festival|live events?|concerts?|conferences?|exhibitions?|conventions?|event (?:production|planning|management|coordination|services|logistics)|sponsorship (?:activation|development)|trade show|community (?:celebration|festival))\b/i;
const ALLOWED=new Set(['Solicitation','Combined Synopsis/Solicitation','Sources Sought','Presolicitation','Pre-solicitation']);
function officialSamPage(url,id){
 try {
  const u=new URL(url);
  if(u.protocol!=='https:'||!['sam.gov','www.sam.gov','beta.sam.gov'].includes(u.hostname)||
    !/^\/opp\/[a-f0-9]{32}\/view\/?$/i.test(u.pathname)||
    u.search||u.hash||u.username||u.password)return null;
  return u.href;
 }catch{return null}
}
export function normalizeSAMEventOpportunity(raw,{now=new Date()}={}){
 const at=now instanceof Date?now:new Date(now);
 if(!Number.isFinite(at.getTime()))throw Error('us_event_clock_invalid');
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const id=text(raw.noticeId,80),title=text(raw.title,250);
 if(!/^[a-f0-9]{32}$/i.test(id)||!title||!MATCH.test(title))return null;
 const type=text(raw.type,80);
 if(!ALLOWED.has(type))return null;
 if(raw.active!==undefined&&!['yes','true'].includes(String(raw.active).toLowerCase()))return null;
 if(raw.award||raw.isDeleted===true)return null;
 const url=officialSamPage(raw.uiLink,id)||'https://sam.gov/opp/'+id+'/view';
 const rawDeadline=text(raw.responseDeadLine,70);
 const parsedDeadline=rawDeadline?Date.parse(rawDeadline):NaN;
 if(rawDeadline&&(!Number.isFinite(parsedDeadline)||parsedDeadline<=at.getTime()))return null;
 const deadline=Number.isFinite(parsedDeadline)?new Date(parsedDeadline).toISOString():null;
 const agency=text(raw.fullParentPathName,220);
 if(!agency)return null;
 const marketResearch=type==='Sources Sought'||type==='Presolicitation'||type==='Pre-solicitation';
 const sourceDate=text(raw.postedDate,40);
 const score=Math.min(100,30+(marketResearch?0:22)+(deadline?14:0)+
   (/event production|event management|festival|conference/i.test(title)?20:5));
 return {
  opportunity_key:'event:'+digest('us-sam:'+id),source:'us_sam_public_v2',
  notice_id:id,title,buyer:agency,source_url:url,observed_at:at.toISOString(),
  opportunity_kind:marketResearch?'us_market_research_notice':'us_public_event_services_notice',
  geography:'United States',deadline,source_posted_date:sourceDate||null,
  score,source_status:'official_notice_unverified_at_buyer',
  lifecycle:marketResearch?'early_market_research_not_a_solicitation':
    deadline?'needs_eligibility_scope_and_deadline_review':'deadline_unverified',
  buyer_contact_verified:false,eligibility_verified:false,proposal_sent:false,
  contract_awarded:false,revenue_confirmed:false,outreach_authorized:false,
  dispatch_authorized:false,registration_or_set_aside_verified:false,
  first_action:'Verify current notice, eligibility and required registrations, buyer, response deadline, scope, budget and partner delivery capacity before any submission.',
  limitations:['SAM.gov search is not a complete procurement history',
   'Pre-solicitation and sources sought are not contracts',
   'Unverified foreign/state/local eligibility or set-aside restrictions',
   'No automated outreach, bid, or spend authorization']
 };
}
export function reconcileSAMEventResults(payload,{now=new Date(),maxCandidates=20}={}){
 if(!Number.isInteger(maxCandidates)||maxCandidates<1||maxCandidates>50)
  throw Error('us_event_max_candidates_invalid');
 if(!payload||!Array.isArray(payload.opportunitiesData))
  throw Error('us_sam_official_payload_invalid');
 const matches=new Map();
 for(const item of payload.opportunitiesData.slice(0,100)){
  const candidate=normalizeSAMEventOpportunity(item,{now});
  if(candidate)matches.set(candidate.opportunity_key,candidate);
 }
 const all=[...matches.values()].sort((a,b)=>b.score-a.score||
  (a.deadline||'9999').localeCompare(b.deadline||'9999')||
  a.opportunity_key.localeCompare(b.opportunity_key));
 return {schema:'evercraft.events.us-sam-review.v1',
  observed_at:new Date(now).toISOString(),source:'us_sam_public_v2',
  source_scope:'SAM.gov federal opportunity search first page; NOT all US event jobs',
  matches_found:all.length,candidates:all.slice(0,maxCandidates),
  truncated:all.length>maxCandidates||Number(payload.totalRecords||0)>100,
  outreach_sent:0,contracts_signed:0,revenue_confirmed:0,
  executive_approval_required:true,eligibility_manual_review_required:true
 };
}
