// Discovery only: accepts an authorized private Gmail metadata export.
// Never treats search hits, sent labels, attachments or thread matches as proof
// of a records request, agency response, project binding or completed delivery.
import {createHmac} from 'node:crypto';
const str=v=>typeof v==='string'&&v.trim().length>0&&v.length<=1000;
const allowed=['sent_candidate','inbound_candidate','both_directions_candidate','direction_unknown'];
export function discoverHistoricalRequestThreads({messages,coverage='partial',hmacKey}={}){
 if(!Array.isArray(messages)||messages.length>10000||!['partial','complete_query'].includes(coverage))throw Error('bounded_export_required');
 if(typeof hmacKey!=='string'||Buffer.byteLength(hmacKey)<32)throw Error('private_hmac_key_required');
 const opaque=(kind,id)=>kind+':'+createHmac('sha256',hmacKey).update(kind+'\0'+id).digest('hex');
 const seen=new Map(),groups=new Map();let invalid=0;
 for(const m of messages){
  if(!str(m?.message_id)||!str(m?.thread_id)||!['sent','inbound','unknown','draft'].includes(m?.direction)||
    !str(m?.occurred_at)||!Number.isFinite(Date.parse(m.occurred_at))){invalid++;continue}
  if(m.direction==='draft')continue;
  const row={thread_id:m.thread_id,direction:m.direction,occurred_at:new Date(m.occurred_at).toISOString(),has_attachment:m.has_attachment===true};
  const prior=seen.get(m.message_id);
  if(prior){if(JSON.stringify(prior)!==JSON.stringify(row))throw Error('conflicting_message_identity');continue}
  seen.set(m.message_id,row);
  let g=groups.get(row.thread_id);
  if(!g){g={thread_ref:opaque('gmail-thread',row.thread_id),message_refs:[],sent:0,inbound:0,unknown:0,attachment_candidates:0,first_at:row.occurred_at,last_at:row.occurred_at};groups.set(row.thread_id,g)}
  g.message_refs.push(opaque('gmail-message',m.message_id));
  g[row.direction]++;
  if(row.has_attachment)g.attachment_candidates++;
  if(row.occurred_at<g.first_at)g.first_at=row.occurred_at;
  if(row.occurred_at>g.last_at)g.last_at=row.occurred_at;
 }
 const candidates=[...groups.values()].map(g=>({...g,message_refs:g.message_refs.sort(),
  disposition:g.sent&&g.inbound?allowed[2]:g.sent?allowed[0]:g.inbound?allowed[1]:allowed[3],
  review_required:true,submission_verified:false,response_verified:false,mission_binding_verified:false,
  next_action:'review_original_request_and_recover_mission_context'})).sort((a,b)=>a.thread_ref.localeCompare(b.thread_ref));
 return {schema:'evercraft.crm.historical-request-discovery.v1',source_coverage:invalid?'partial':coverage,
  query_coverage_only:true,verified_requests:null,invalid_rows:invalid,candidates,
  summary:{candidate_threads:candidates.length,with_sent:candidates.filter(x=>x.sent).length,
   with_inbound:candidates.filter(x=>x.inbound).length,both:candidates.filter(x=>x.sent&&x.inbound).length,
   with_attachments:candidates.filter(x=>x.attachment_candidates).length},execution_authorized:false};
}
