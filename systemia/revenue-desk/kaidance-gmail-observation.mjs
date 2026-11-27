// Existing company heartbeat observer. No credential access, API requests or writes.
import fs from 'node:fs';
import path from 'node:path';
const SCHEMA='evercraft.systemia.gmail-owned-metadata-snapshot.v1';
const MAX_BYTES=8*1024*1024, MAX_ROWS=20000, MAX_AGE=30*60*1000;
const hold=(status)=>({schema:'evercraft.kaidance.gmail-observation.v1',status,full_history_confirmed:false,contact_clearance:false,outreach_authorized:false,quota_authority:false,private_records_exported:0});
const validTime=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
export function summarizeRecentGmail(snapshot,now=new Date()){
 const at=Date.parse(snapshot?.observed_at), age=+now-at;
 if(!snapshot||snapshot.schema!==SCHEMA||snapshot.source!=='authenticated_gmail_readonly_api'||snapshot.mailbox_scope!=='lookback_hours_30'||snapshot.listing_exhausted!==true||snapshot.provider_send_performed!==false||snapshot.full_history_confirmed!==false||!Number.isInteger(snapshot.listing_pages)||snapshot.listing_pages<1||snapshot.listing_pages>500||!validTime(snapshot.observed_at)||!Number.isFinite(age)||age<0||!Array.isArray(snapshot.messages)||snapshot.messages.length>MAX_ROWS)return hold('hold_invalid_snapshot');
 if(age>MAX_AGE)return hold('hold_stale_snapshot');
 const seen=new Set();
 let outbound=0,recipientUnits=0,missingRecipients=0,inbound=0,bounce=0,auto=0;
 for(const r of snapshot.messages){
  if(!r||typeof r.message_id!=='string'||!r.message_id||r.message_id.length>256||seen.has(r.message_id)||!['outbound','inbound'].includes(r.direction)||!validTime(r.occurred_at)||!Array.isArray(r.to_addresses)||r.to_addresses.length>1000||r.to_addresses.some(x=>typeof x!=='string'||!x||x.length>254)||new Set(r.to_addresses).size!==r.to_addresses.length||typeof r.is_bounce!=='boolean'||typeof r.is_auto_reply!=='boolean')return hold('hold_invalid_snapshot');
  seen.add(r.message_id);
  const t=Date.parse(r.occurred_at);
  if(t>at+60000||t<at-30*3600000-1000)return hold('hold_invalid_snapshot');
  // Anchor to capture start, not heartbeat time: no unseen post-capture period.
  if(t<at-24*3600000||t>at)continue;
  if(r.direction==='outbound'){outbound++;recipientUnits+=r.to_addresses.length;if(!r.to_addresses.length)missingRecipients++}
  else{inbound++;if(r.is_bounce)bounce++;if(r.is_auto_reply)auto++}
 }
 return {...hold('recent_metadata_observed_not_authoritative'),observed_at:snapshot.observed_at,age_seconds:Math.floor(age/1000),snapshot_records:seen.size,rolling_24h_at_capture:{outbound_messages:outbound,parsed_recipient_units:recipientUnits,outbound_missing_recipients:missingRecipients,inbound_messages:inbound,detected_bounces:bounce,detected_auto_replies:auto},buyer_replies_verified:0,buyers_qualified:0};
}
export function observeOwnedGmail({root=null,now=new Date()}={}){
 if(!root)return {summary:hold('not_admitted'),mailFile:null};
 try{
  if(!path.isAbsolute(root)||fs.realpathSync(root)!==root)throw Error('private_root');
  const st=fs.lstatSync(root);
  if(!st.isDirectory()||st.uid!==process.getuid()||(st.mode&0o077))throw Error('private_root');
  const names=fs.readdirSync(root).filter(n=>/^recent-\d{8}T\d{6}Z\.json$/.test(n)).sort();
  if(!names.length)return {summary:hold('hold_snapshot_missing'),mailFile:null};
  // Do not fall back to an older file when the latest candidate fails.
  const file=path.join(root,names.at(-1));
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  let data;
  try{
   const s=fs.fstatSync(fd);
   if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>MAX_BYTES)throw Error('private_file');
   const b=Buffer.alloc(s.size+1),n=fs.readSync(fd,b,0,b.length,0);
   if(n!==s.size||fs.fstatSync(fd).size!==s.size)throw Error('snapshot_changed');
   data=JSON.parse(b.subarray(0,n).toString('utf8'));
  }finally{fs.closeSync(fd)}
  const summary=summarizeRecentGmail(data,now);
  return {summary,mailFile:summary.status==='recent_metadata_observed_not_authoritative'?file:null};
 }catch{return {summary:hold('hold_private_snapshot_binding'),mailFile:null}}
}
