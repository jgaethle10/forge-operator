// Official public solicitation view; research only, no contact or bid actions.
const endpoint='https://data.cityofnewyork.us/resource/3khw-qi8f.json';
const lanes=[['media',/video production|videography|motion graphics/i],['software',/website|web development|software development/i],['research',/research services|feasibility study|market research|data analysis/i],['ev-planning',/electric vehicle charging|ev charging/i]];
const localTime=now=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(now).replace(' ','T');
export async function collectNyc({now=new Date(),fetchImpl=fetch,limit=100}={}){
 if(!Number.isInteger(limit)||limit<1||limit>200||!Number.isFinite(+now))throw Error('invalid_collection_budget');
 const cutoff=localTime(now),u=new URL(endpoint);
 u.search=new URLSearchParams({'$select':'request_id,agency_name,short_title,due_date,pin,type_of_notice_description','$where':"due_date > '"+cutoff+"'",'$order':'due_date ASC,request_id ASC','$limit':String(limit)});
 const res=await fetchImpl(u,{redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!res.ok)throw Error('nyc_http_'+res.status);
 const rows=await res.json();if(!Array.isArray(rows)||rows.length>limit)throw Error('nyc_invalid_response');
 const seen=new Set(),candidates=[];
 for(const r of rows){
  const id=String(r?.request_id??''),title=r?.short_title,agency=r?.agency_name,due=r?.due_date;
  if(!/^\d{1,20}$/.test(id)||seen.has(id)||typeof title!=='string'||typeof agency!=='string'||!agency.trim()||typeof due!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(due)||due.slice(0,19)<=cutoff)continue;
  const lane=lanes.find(([,re])=>re.test(title));if(!lane)continue;
  seen.add(id);candidates.push({candidate_ref:'nyc:'+id,buyer:agency.slice(0,300),title:title.slice(0,300),deadline_local:due,deadline_timezone:'America/New_York',source_url:'https://data.cityofnewyork.us/resource/3khw-qi8f.json?request_id='+id,suggested_lane:lane[0],stage:'research_required',qualified:false,contact_authorized:false});
 }
 return {schema:'evercraft.kaidance.buyer-source-receipt.v1',source:'nyc-current-solicitations',observed_at:now.toISOString(),records_observed:rows.length,coverage_complete:false,candidates,qualified_count:0,send_performed:false};
}
