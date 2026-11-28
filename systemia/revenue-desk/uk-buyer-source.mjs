import {createHash} from 'node:crypto';
const endpoint='https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages';
// Discovery hints only: a text match never establishes capability, budget,
 // buyer eligibility, contact permission or an approved price.
const lanes=[
 ['ev-planning',/\b(?:electric vehicle charging|ev charg(?:ing|ers?)|charge\s?point(?:s| infrastructure)?|charging infrastructure|charging station feasibility|fleet electrification)\b/i],
 ['media',/\b(?:video production|film production|animation services|audio[ -]?visual production|videography|video editing|film making|filmmaking|promotional videos?|digital content production|multimedia production|commercial photography and video|motion graphics|subtitling|captioning services)\b/i],
 ['software',/\b(?:websites? (?:design|development|redesign|replacement|maintenance|migration)|software (?:development|modernisation|modernization|migration|integration)|web (?:development|design)|digital platform development|application development|legacy (?:software|system) moderni[sz]ation|workflow automation|systems integration|business process automation|website accessibility audit)\b/i],
 ['research',/\b(?:market research|market intelligence|research services|data analysis services|feasibility stud(?:y|ies)|desk research|literature review|research and analysis|economic impact stud(?:y|ies)|transcription services|audio transcription|document digitisation|document digitization)\b/i]
];
export function normalizeUk(packageData,{now=new Date()}={}){
 if(!Array.isArray(packageData?.releases)||packageData.releases.length>1000||!Number.isFinite(+now))throw Error('invalid_uk_package');
 const latest=new Map();
 for(const r of packageData.releases){
  if(typeof r.ocid!=='string'||!Number.isFinite(Date.parse(r.date)))continue;
  const prev=latest.get(r.ocid);
  if(!prev||Date.parse(r.date)>=Date.parse(prev.date))latest.set(r.ocid,r);
 }
 const candidates=[];
 const diagnostics={unique_notices:latest.size,inactive_or_non_tender:0,expired_or_unverified_deadline:0,missing_buyer_or_title:0,unmatched_scope:0,invalid_notice_id:0};
 for(const r of latest.values()){
  const t=r.tender;
  if(t?.status!=='active'||!Array.isArray(r.tag)||!r.tag.some(x=>x==='tender'||x==='tenderUpdate')||r.tag.some(x=>/Cancellation|award|contract/i.test(x))){diagnostics.inactive_or_non_tender++;continue;}
  const deadline=t.tenderPeriod?.endDate;
  if(typeof deadline!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(deadline)||!(Date.parse(deadline)>+now)){diagnostics.expired_or_unverified_deadline++;continue;}
  const title=t.title,buyer=r.buyer?.name;
  if(typeof title!=='string'||!title.trim()||typeof buyer!=='string'||!buyer.trim()){diagnostics.missing_buyer_or_title++;continue;}
  const lane=lanes.find(([,pattern])=>pattern.test(title+' '+String(t.description??'').slice(0,20000)))?.[0];
  if(!lane){diagnostics.unmatched_scope++;continue;}
  const id=String(r.id??'');
  if(!/^\d{6}-\d{4}$/.test(id)){diagnostics.invalid_notice_id++;continue;}
  candidates.push({candidate_ref:'uk:'+createHash('sha256').update(r.ocid).digest('hex').slice(0,40),source_url:'https://www.find-tender.service.gov.uk/Notice/'+id,buyer:buyer.slice(0,300),title:title.slice(0,300),deadline,deadline_timezone:null,suggested_lane:lane,stage:'research_required',qualified:false,contact_authorized:false});
 }
 return {schema:'evercraft.kaidance.buyer-source-receipt.v1',records_observed:packageData.releases.length,diagnostics,candidates,coverage_complete:false,qualified_count:0,send_performed:false};
}
export async function collectUkReleaseWindow({now=new Date(),fetchFn=fetch,maxPages=5,windowEnd=now,windowStart=new Date(+windowEnd-86400000)}={}){
 if(!Number.isFinite(+now)||!Number.isInteger(maxPages)||maxPages<1||maxPages>10||!(windowStart instanceof Date)||!(windowEnd instanceof Date)||!Number.isFinite(+windowStart)||!Number.isFinite(+windowEnd)||+windowStart>=+windowEnd||+windowEnd>+now||+windowEnd-+windowStart>86400000||+now-+windowStart>180*86400000)throw Error('invalid_uk_bounds');
 const u=new URL(endpoint);
 u.searchParams.set('updatedFrom',windowStart.toISOString().slice(0,19));
 u.searchParams.set('updatedTo',windowEnd.toISOString().slice(0,19));
 u.searchParams.set('limit','100');
 let next=u.href,pages=0;
 const visited=new Set(),releases=[];
 while(next&&pages<maxPages){
  if(visited.has(next))throw Error('uk_cursor_loop');
  visited.add(next);
  const response=await fetchFn(next,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('uk_http_'+response.status);
  const reader=response.body.getReader();let size=0;const chunks=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8000000)throw Error('uk_response_limit');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
  const pkg=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!Array.isArray(pkg.releases)||pkg.releases.length>100)throw Error('invalid_uk_page');
  releases.push(...pkg.releases);pages++;
  next=null;
  if(pkg.links?.next){
   const n=new URL(pkg.links.next,u);
   if(n.origin!==u.origin||n.pathname!==u.pathname||n.username||n.password||n.hash)throw Error('uk_cursor_target_invalid');
   for(const k of ['updatedFrom','updatedTo','limit'])if(n.searchParams.get(k)!==u.searchParams.get(k))throw Error('uk_cursor_window_changed');
   const cursor=n.searchParams.get('cursor');
   if(!cursor||cursor.length>300)throw Error('uk_cursor_invalid');
   next=n.href;
  }
 }
 return {releases,pages_observed:pages,coverage_complete:!next,window_start:windowStart.toISOString(),window_end:windowEnd.toISOString()};
}

export async function collectUk(options={}){
 const now=options.now??new Date();
 const window=await collectUkReleaseWindow({...options,now});
 return {...normalizeUk(window,{now}),pages_observed:window.pages_observed,coverage_complete:window.coverage_complete};
}
