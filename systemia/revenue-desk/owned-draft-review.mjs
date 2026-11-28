// Existing read-only Gmail grant -> private draft review. No send/draft edits.
// The OAuth refresh function is supplied by the existing owned binding.
import {reviewPreparedDrafts} from './prepared-draft-review.mjs';
const BASE='https://gmail.googleapis.com/gmail/v1/users/me';
const validId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(s);
const address=s=>typeof s==='string'&&/^[a-z0-9.!#$%&'*+/=?^_{}|~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(s.trim())?s.trim().toLowerCase():null;
function mailbox(value){
 const v=String(value??'').trim(),m=/^[^<>\r\n]*<([^<>]+)>$/.exec(v);
 return address(m?m[1]:v);
}
const lanes=new Set(['direct_offer','customer_reply','supplier','partner','procurement','other']);
async function get({token,fetchImpl,pathname,query,clock,deadline}){
 if(clock()>=deadline)throw Error('gmail_draft_budget_hold');
 const url=new URL(BASE+pathname);
 url.search=new URLSearchParams(query);
 const r=await fetchImpl(url,{method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.min(10000,deadline-clock())))});
 if(!r.ok)throw Error('gmail_draft_http_'+r.status);
 const reader=r.body.getReader(),chunks=[];let n=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>2000000)throw Error('gmail_draft_response_limit');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function header(p,name){
 const h=p?.headers?.filter(x=>String(x.name).toLowerCase()===name.toLowerCase())??[];
 if(h.length>1)throw Error('gmail_draft_duplicate_header');
 return h[0]?.value??'';
}
function plain(p){
 if(p?.mimeType==='text/plain'&&typeof p.body?.data==='string'&&!p.body.attachmentId)return Buffer.from(p.body.data,'base64url').toString('utf8');
 if(p?.mimeType==='multipart/alternative'||p?.mimeType==='multipart/mixed'){
  const parts=(p.parts??[]).filter(x=>x.mimeType==='text/plain'&&!x.filename);
  if(parts.length===1)return plain(parts[0]);
 }
 return null;
}
export async function reviewOwnedDrafts({accessToken,reviewedLanes={},fetchImpl=fetch,now=new Date(),clock=Date.now,maxDrafts=20}={}){
 if(typeof accessToken!=='string'||accessToken.length<16||!Number.isFinite(+now)||!Number.isInteger(maxDrafts)||maxDrafts<1||maxDrafts>40)throw Error('gmail_draft_input_hold');
 const deadline=clock()+90000;
 const req=(pathname,query={})=>get({token:accessToken,fetchImpl,pathname,query,clock,deadline});
 const list=await req('/drafts',{maxResults:String(maxDrafts)});
 if(list.drafts!==undefined&&!Array.isArray(list.drafts))throw Error('gmail_draft_list_hold');
 const entries=list.drafts??[];
 if(entries.length>maxDrafts||entries.some(d=>!validId(d.id)||!validId(d.message?.id))||new Set(entries.map(d=>d.id)).size!==entries.length)throw Error('gmail_draft_list_hold');
 const records=[],holds={};let skipped=0;
 for(const item of entries){
  // No automatic sales label inferred from private messages. The existing
  // reviewer can supply lane labels by exact draft ID, otherwise 'other'.
  const lane=Object.hasOwn(reviewedLanes,item.id)&&lanes.has(reviewedLanes[item.id])?reviewedLanes[item.id]:'other';
  try{
   const result=await req('/drafts/'+item.id,{format:'full'});
   const m=result?.message,p=m?.payload;
   if(result.id!==item.id||m?.id!==item.message.id||!m.labelIds?.includes('DRAFT'))throw Error('gmail_draft_changed');
   const a=mailbox(header(p,'To'));
   const cc=header(p,'Cc'),bcc=header(p,'Bcc');
   const body=plain(p);
   const t=Number(m.internalDate);
   if(!Number.isFinite(t)||t<=0)throw Error('gmail_draft_clock_hold');
   const draft={id:item.id,to:a?[a]:[],cc:cc?['present']:[],bcc:bcc?['present']:[],email_ts:new Date(t).toISOString(),body};
   let history=null;
   // Only individually reviewed commercial drafts warrant a history query.
   if(a&&!cc&&!bcc&&(lane==='direct_offer'||lane==='customer_reply')){
    const q='in:anywhere -in:drafts {from:'+a+' to:'+a+' cc:'+a+' bcc:'+a+'}';
    const h=await req('/messages',{q,maxResults:'50',includeSpamTrash:'true'});
    if(h.messages!==undefined&&!Array.isArray(h.messages))throw Error('gmail_history_list_hold');
    const msgs=h.messages??[];
    if(msgs.length>50||msgs.some(x=>!validId(x.id))||new Set(msgs.map(x=>x.id)).size!==msgs.length)throw Error('gmail_history_list_hold');
    const verified=[];
    for(const x of msgs){
     const meta=await req('/messages/'+x.id,{format:'metadata',metadataHeaders:'To'});
     // Search hits are positive holds only, not exact identity or complete history.
     if(meta.id!==x.id||!Array.isArray(meta.labelIds))throw Error('gmail_history_message_hold');
     verified.push({id:x.id,labels:meta.labelIds});
    }
    history={recipient:a,search_exhausted:!h.nextPageToken,messages:verified};
   }
   records.push({draft,lane,history});
  }catch(e){skipped++;const key=/^gmail_[a-z0-9_]+$/.test(e?.message||'')?e.message:'gmail_draft_read_hold';holds[key]=(holds[key]??0)+1;if(clock()>=deadline)break;}
 }
 const reviewed=reviewPreparedDrafts(records,{now});
 // Do not export bodies, addresses, draft IDs, thread IDs or token.
 return {schema:'evercraft.systemia.owned-draft-review.v1',observed_at:now.toISOString(),listed:entries.length,reviewed:records.length,read_holds:skipped,unprocessed:entries.length-records.length-skipped,pagination_remaining:!!list.nextPageToken,hold_reasons:holds,counts:reviewed.counts,
 reason_counts:reviewed.rows.reduce((out,r)=>{for(const reason of r.reasons)out[reason]=(out[reason]??0)+1;return out;},{}),
 source:'owned_gmail_readonly',full_history_confirmed:false,provider_quota_verified:false,review_only:true,send_authority:false,provider_write_performed:false};
}
