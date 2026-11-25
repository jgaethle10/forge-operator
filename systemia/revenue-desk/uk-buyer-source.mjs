import {createHash} from 'node:crypto';
const endpoint='https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages';
const lanes=[['media',/video production|film production|animation services|audiovisual production/i],['software',/website (design|development|redesign)|software development|web development/i],['ev-planning',/electric vehicle charging|ev charging|chargepoint feasibility/i]];
export function normalizeUk(packageData,{now=new Date()}={}){
 if(!Array.isArray(packageData?.releases)||packageData.releases.length>1000||!Number.isFinite(+now))throw Error('invalid_uk_package');
 const latest=new Map();
 for(const r of packageData.releases){
  if(typeof r.ocid!=='string'||!Number.isFinite(Date.parse(r.date)))continue;
  const prev=latest.get(r.ocid);
  if(!prev||Date.parse(r.date)>=Date.parse(prev.date))latest.set(r.ocid,r);
 }
 const candidates=[];
 for(const r of latest.values()){
  const t=r.tender;
  if(t?.status!=='active'||!Array.isArray(r.tag)||!r.tag.some(x=>x==='tender'||x==='tenderUpdate')||r.tag.some(x=>/Cancellation|award|contract/i.test(x)))continue;
  const deadline=t.tenderPeriod?.endDate;
  if(typeof deadline!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(deadline)||!(Date.parse(deadline)>+now))continue;
  const title=t.title,buyer=r.buyer?.name;
  if(typeof title!=='string'||!title.trim()||typeof buyer!=='string'||!buyer.trim())continue;
  const lane=lanes.find(([,pattern])=>pattern.test(title+' '+String(t.description??'').slice(0,20000)))?.[0];
  if(!lane)continue;
  const id=String(r.id??'');
  if(!/^\d{6}-\d{4}$/.test(id))continue;
  candidates.push({candidate_ref:'uk:'+createHash('sha256').update(r.ocid).digest('hex').slice(0,40),source_url:'https://www.find-tender.service.gov.uk/Notice/'+id,buyer:buyer.slice(0,300),title:title.slice(0,300),deadline,deadline_timezone:null,suggested_lane:lane,stage:'research_required',qualified:false,contact_authorized:false});
 }
 return {schema:'evercraft.kaidance.buyer-source-receipt.v1',records_observed:packageData.releases.length,candidates,coverage_complete:false,qualified_count:0,send_performed:false};
}
export async function collectUk({now=new Date(),fetchFn=fetch,maxPages=5}={}){
 if(!Number.isFinite(+now)||!Number.isInteger(maxPages)||maxPages<1||maxPages>10)throw Error('invalid_uk_bounds');
 const u=new URL(endpoint);
 u.searchParams.set('updatedFrom',new Date(+now-86400000).toISOString().slice(0,19));
 u.searchParams.set('updatedTo',now.toISOString().slice(0,19));
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
 const result=normalizeUk({releases},{now});
 return {...result,pages_observed:pages,coverage_complete:!next};
}
