// Public procurement discovery only. No contact extraction, email or bid submission.
import {createHash} from 'node:crypto';
const endpoint='https://api.sam.gov/opportunities/v2/search';
const types=new Set(['Solicitation','Combined Synopsis/Solicitation']);
const lanes=[['commercial-media',/video production|videography|motion graphics/i],['software',/website|web development|software development/i],['research',/research services|feasibility study|market research|data analysis/i],['ev-planning',/electric vehicle charging|ev charging/i]];
const text=(v,n=300)=>typeof v==='string'?v.trim().slice(0,n):'';
const date=v=>new Date(v).toLocaleDateString('en-US',{timeZone:'UTC',month:'2-digit',day:'2-digit',year:'numeric'});
export function screenNotices(rows,now=new Date()){
 if(!Array.isArray(rows)||!Number.isFinite(+now))throw Error('invalid_input');
 const seen=new Set(),candidates=[];
 for(const r of rows){
  if(!r||!types.has(r.type)||r.active!=='Yes'||r.award||!/^[a-f0-9]{32}$/i.test(r.noticeId||''))continue;
  const id=r.noticeId.toLowerCase(), title=text(r.title), agency=text(r.fullParentPathName||r.department);
  const deadline=r.responseDeadLine;
  if(typeof deadline!=='string'||!/(?:Z|[+-]\d\d:\d\d)$/.test(deadline)||!Number.isFinite(Date.parse(deadline))||Date.parse(deadline)<=+now)continue;
  const lane=lanes.find(([,re])=>re.test(title));
  if(!lane||!agency||seen.has(id))continue;
  seen.add(id);
  candidates.push({schema:'evercraft.kaidance.buyer-source-candidate.v1',candidate_ref:'sam:'+id,source_url:'https://sam.gov/opp/'+id+'/view',buyer:agency,title,deadline,solicitation_number:text(r.solicitationNumber),set_aside:text(r.typeOfSetAside),suggested_lane:lane[0],stage:'research_required',qualified:false,contact_authorized:false,next_action:'Review original solicitation, amendments, eligibility, scope, budget, and official submission route.'});
 }
 return candidates.sort((a,b)=>Date.parse(a.deadline)-Date.parse(b.deadline)||a.candidate_ref.localeCompare(b.candidate_ref));
}
export async function collectSam({apiKey,now=new Date(),fetchImpl=fetch,maxPages=2}={}){
 if(typeof apiKey!=='string'||!apiKey.trim())throw Error('sam_key_required');
 if(!Number.isInteger(maxPages)||maxPages<1||maxPages>5)throw Error('invalid_page_budget');
 const limit=100,rows=[];let total=null,pages=0;
 for(let offset=0;offset<maxPages;offset++){
  const u=new URL(endpoint);
  u.search=new URLSearchParams({api_key:apiKey,postedFrom:date(new Date(+now-30*86400000)),postedTo:date(now),limit:String(limit),offset:String(offset)});
  let res;try{res=await fetchImpl(u,{redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw Error('sam_transport_failed');}
  if(!res.ok)throw Error('sam_http_'+res.status);
  let data;try{data=await res.json();}catch{throw Error('sam_invalid_json');}
  if(!Array.isArray(data.opportunitiesData)||!Number.isSafeInteger(data.totalRecords)||data.totalRecords<0||data.offset!==offset||data.limit!==limit||data.opportunitiesData.length>limit)throw Error('sam_invalid_page');
  if(total!==null&&total!==data.totalRecords)throw Error('sam_page_total_changed');
  total=data.totalRecords;rows.push(...data.opportunitiesData);pages++;
  if(rows.length>=total)break;
  if(data.opportunitiesData.length!==limit)throw Error('sam_incomplete_page');
 }
 const candidates=screenNotices(rows,now);
 return {schema:'evercraft.kaidance.buyer-source-receipt.v1',observed_at:now.toISOString(),source:'sam.gov',pages,records_observed:rows.length,coverage_complete:rows.length===total,candidates,qualified_count:0,send_performed:false,receipt_hash:'sha256:'+createHash('sha256').update(JSON.stringify(candidates)).digest('hex')};
}
