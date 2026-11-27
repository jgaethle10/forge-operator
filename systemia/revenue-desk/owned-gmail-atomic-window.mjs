// One owner-operated bounded sync, not a resident service or scheduler.
// Cursor and exact query membership are committed together in an immutable private generation.
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {desktopClient,readPrivateJson,refreshBinding} from './owned-gmail-binding.mjs';
import {readHistoryCheckpoint,collectHistoryDelta} from './owned-gmail-history-delta.mjs';
import {HEADERS,getJson,parseGmailMetadata} from './owned-gmail-import.mjs';
import {summarizeRecentGmail} from './kaidance-gmail-observation.mjs';
const BASE='https://gmail.googleapis.com/gmail/v1/users/me/messages';
const SCHEMA='evercraft.gmail.atomic-window.v1';
const CAP=1000,MAX_BYTES=8*1024*1024;
const fail=c=>{throw Error('gmail_sync_'+c)};
const sleepDefault=ms=>new Promise(r=>setTimeout(r,ms));
const cursor=x=>typeof x==='string'&&/^[1-9][0-9]{0,39}$/.test(x);
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(x);
const query=at=>'in:anywhere -in:drafts after:'+Math.floor((at-30*3600000)/1000)+' before:'+Math.floor(at/1000);
function validatePrior(s,expectedMailbox){
 const at=Date.parse(s?.observed_at);
 if(s?.gmail_sync?.schema!==SCHEMA||s.gmail_sync.mailbox!==expectedMailbox.toLowerCase()||!cursor(s.gmail_sync.history_id)||s.gmail_sync.include_spam_trash!==true||s.requested_query!==query(at)||s.messages?.length>CAP||summarizeRecentGmail(s,new Date(at)).status!=='recent_metadata_observed_not_authoritative'||s.messages.some(r=>!id(r.message_id)))fail('prior_generation_invalid');
}
export async function synchronizeWindow({accessToken,expectedMailbox,previous=null,fetchImpl=globalThis.fetch,clock=Date.now,sleep=sleepDefault,maxRounds=3}={}){
 if(typeof expectedMailbox!=='string'||!expectedMailbox.includes('@')||!Number.isInteger(maxRounds)||maxRounds<1||maxRounds>3)fail('arguments_invalid');
 if(previous)validatePrior(previous,expectedMailbox);
 let staged=new Map((previous?.messages||[]).map(r=>[r.message_id,r]));
 let stagedCursor=previous?.gmail_sync.history_id||null;
 let fetched=0,reused=0,rounds=0,historyRecords=0;
 const deadline=clock()+240000;
 const budget=()=>{if(clock()>deadline)fail('cycle_budget_hold')};
 const get=async(url,stage)=>{budget();return getJson(url,accessToken,fetchImpl,{stage,maxRetries:3,sleep})};
 for(let round=0;round<maxRounds;round++){
  budget();rounds++;
  let start=await readHistoryCheckpoint({accessToken,expectedMailbox,fetchImpl});
  let dirty=new Set();
  if(stagedCursor){
   const d=await collectHistoryDelta({accessToken,startHistoryId:stagedCursor,fetchImpl,maxPages:10,maxIds:5000});
   if(BigInt(d.endHistoryId)<BigInt(start))fail('provider_cursor_regressed');
   start=d.endHistoryId;dirty=new Set(d.changedIds);historyRecords+=d.records;
  }
  const at=Math.floor(clock()/1000)*1000;
  if(!Number.isFinite(at)||previous&&at<Date.parse(previous.observed_at))fail('clock_invalid');
  const q=query(at),ids=new Set(),tokens=new Set();
  let pageToken=null,pages=0;
  do{
   if(pages>=10)fail('listing_page_cap');
   const params=new URLSearchParams({q,maxResults:'500',includeSpamTrash:'true'});
   if(pageToken)params.set('pageToken',pageToken);
   const list=await get(BASE+'?'+params,'list');
   if(!list||list.messages!==undefined&&!Array.isArray(list.messages))fail('list_invalid');
   for(const r of list.messages||[]){
    if(!id(r?.id)||ids.has(r.id))fail('list_identity_invalid');
    ids.add(r.id);if(ids.size>CAP)fail('window_capacity_hold');
   }
   pages++;
   pageToken=list.nextPageToken??null;
   if(pageToken!==null){
    if(typeof pageToken!=='string'||!pageToken||pageToken.length>4096||tokens.has(pageToken))fail('list_pagination_invalid');
    tokens.add(pageToken);
   }
  }while(pageToken!==null);
  const next=new Map();
  for(const key of ids){
   budget();
   let row=staged.get(key);
   if(!row||dirty.has(key)){
    const params=new URLSearchParams({format:'metadata'});
    for(const h of HEADERS)params.append('metadataHeaders',h);
    const value=await get(BASE+'/'+encodeURIComponent(key)+'?'+params,'metadata');
    if(value?.id!==key||(value.labelIds!==undefined&&!Array.isArray(value.labelIds))||value.labelIds?.includes('DRAFT'))fail('metadata_identity_or_membership_hold');
    row=parseGmailMetadata(value);fetched++;
    await sleep(150);
   }else{reused++}
   const t=Date.parse(row.occurred_at);
   if(!Number.isFinite(t))fail('metadata_window_invalid_timestamp');
   if(t<at-30*3600000||t>=at){
    const side=t<at-30*3600000?'lower':'upper';
    const offset=side==='lower'?at-30*3600000-t:t-at;
    const bucket=offset===0?'exact':offset<1000?'subsecond':offset<=60000?'within_minute':offset<=3600000?'within_hour':offset<=86400000?'within_day':'over_day';
    fail('metadata_window_membership_hold_'+side+'_'+bucket);
   }
   next.set(key,row);
  }
  budget();
  const end=await readHistoryCheckpoint({accessToken,expectedMailbox,fetchImpl});
  if(BigInt(end)<BigInt(start))fail('provider_cursor_regressed');
  // Any concurrent changes invalidate the bracket. Keep only in-memory rows
  // and replay all changes from the pre-list cursor on a bounded next round.
  if(end!==start){staged=next;stagedCursor=start;continue}
  const snapshot={schema:'evercraft.systemia.gmail-owned-metadata-snapshot.v1',observed_at:new Date(at).toISOString(),mailbox_scope:'lookback_hours_30',requested_query:q,listing_pages:pages,listing_exhausted:true,messages:[...next.values()],source:'authenticated_gmail_readonly_api',provider_send_performed:false,full_history_confirmed:false,gmail_sync:{schema:SCHEMA,mailbox:expectedMailbox.toLowerCase(),history_id:end,include_spam_trash:true}};
  validatePrior(snapshot,expectedMailbox);
  return {snapshot,stats:{mode:previous?'incremental':'baseline',rounds,metadata_requests:fetched,reused_rows:reused,history_records:historyRecords,messages:next.size,listing_pages:pages,checkpoint_committable:true}};
 }
 fail('mailbox_changed_during_capture_hold');
}
function rootCheck(root){
 if(typeof root!=='string'||!path.isAbsolute(root)||fs.realpathSync(root)!==root)fail('private_root_required');
 const st=fs.lstatSync(root);
 if(!st.isDirectory()||st.uid!==process.getuid()||(st.mode&0o077))fail('private_root_required');
}
export function readLatestGeneration(root,mailbox){
 rootCheck(root);
 const names=fs.readdirSync(root).filter(n=>/^recent-\d{8}T\d{6}Z\.json$/.test(n)).sort();
 if(!names.length)return null;
 const fd=fs.openSync(path.join(root,names.at(-1)),fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try{
  const st=fs.fstatSync(fd);
  if(!st.isFile()||st.uid!==process.getuid()||(st.mode&0o077)||st.size>MAX_BYTES)fail('private_generation_required');
  const b=Buffer.alloc(st.size+1),n=fs.readSync(fd,b,0,b.length,0);
  if(n!==st.size||fs.fstatSync(fd).size!==st.size)fail('generation_changed');
  const value=JSON.parse(b.subarray(0,n).toString('utf8'));
  validatePrior(value,mailbox);
  return value;
 }finally{fs.closeSync(fd)}
}
export function commitGeneration(root,snapshot,mailbox){
 rootCheck(root);validatePrior(snapshot,mailbox);
 const bytes=Buffer.from(JSON.stringify(snapshot)+'\n');
 if(bytes.length>MAX_BYTES)fail('generation_size_hold');
 const name='recent-'+snapshot.observed_at.replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')+'.json';
 const target=path.join(root,name),tmp=path.join(root,'.stage-'+randomBytes(16).toString('hex'));
 const fd=fs.openSync(tmp,'wx',0o600);
 try{
  try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
  fs.linkSync(tmp,target); // Atomic no-replace promotion on the same filesystem.
  const dir=fs.openSync(root,'r');try{fs.fsyncSync(dir)}finally{fs.closeSync(dir)}
 }finally{fs.unlinkSync(tmp)}
 return true;
}
export async function withSyncLock(root,fn){
 rootCheck(root);
 const lock=path.join(root,'.sync-lock');
 try{fs.mkdirSync(lock,{mode:0o700})}catch{fail('exclusive_writer_hold')}
 try{return await fn()}finally{fs.rmdirSync(lock)}
}
async function main(){
 const args=process.argv.slice(2),flag=k=>{const i=args.indexOf(k);return i<0?null:args[i+1]};
 if(!['--baseline','--refresh'].includes(args[0]))fail('usage');
 const root=flag('--state-dir'),expectedMailbox=flag('--mailbox');
 await withSyncLock(root,async()=>{
  const previous=readLatestGeneration(root,expectedMailbox);
  if(args[0]==='--baseline'&&previous||args[0]==='--refresh'&&!previous)fail('mode_generation_mismatch');
  const client=desktopClient(readPrivateJson(flag('--client-file')));
  const binding=readPrivateJson(flag('--binding-file'));
  const accessToken=await refreshBinding({client,binding,expectedMailbox});
  const {snapshot,stats}=await synchronizeWindow({accessToken,expectedMailbox,previous});
  commitGeneration(root,snapshot,expectedMailbox);
  console.log(JSON.stringify({state:'gmail_atomic_window_committed',...stats,checkpoint_persisted:true,full_history_confirmed:false,contact_clearance:false,send_authority:false,private_records_exported:0}));
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{
 const c=String(e?.message||'');
 console.error('GMAIL_SYNC_HELD '+(/^gmail_[a-z0-9_]+$/.test(c)?c:'private_input_or_operation_failed'));process.exitCode=1;
});
