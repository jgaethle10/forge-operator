// Provider cursor and bounded change discovery only. No cache promotion or send.
// IDs and checkpoints stay inside the owned process; callers export counts only.
import {readPrivateJson,desktopClient,refreshBinding} from './owned-gmail-binding.mjs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const BASE='https://gmail.googleapis.com/gmail/v1/users/me';
const cursor=x=>typeof x==='string'&&/^[1-9][0-9]{0,39}$/.test(x);
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(x);
const validToken=x=>typeof x==='string'&&x.length>=16;
const fail=x=>{throw Error('gmail_history_'+x)};
async function request(url,token,fetchImpl,stage){
 if(!validToken(token))fail('token_required');
 let r;
 try{r=await fetchImpl(url,{method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)})}catch{fail('transport_hold_'+stage)}
 if(!r?.ok){
  if(stage==='delta'&&r?.status===404)fail('checkpoint_expired_rebaseline_required');
  const status=Number.isInteger(r?.status)&&r.status>=100&&r.status<=599?r.status:0;
  fail('provider_hold_'+stage+'_'+status);
 }
 try{return await r.json()}catch{fail('response_invalid_'+stage)}
}
export async function readHistoryCheckpoint({accessToken,expectedMailbox,fetchImpl=globalThis.fetch}={}){
 if(typeof expectedMailbox!=='string'||!expectedMailbox.includes('@'))fail('mailbox_required');
 const p=await request(BASE+'/profile',accessToken,fetchImpl,'profile');
 if(typeof p?.emailAddress!=='string'||p.emailAddress.toLowerCase()!==expectedMailbox.toLowerCase()||!cursor(p.historyId))fail('profile_identity_or_cursor_invalid');
 return p.historyId;
}
export async function collectHistoryDelta({accessToken,startHistoryId,fetchImpl=globalThis.fetch,maxPages=20,maxIds=5000}={}){
 if(!cursor(startHistoryId)||!Number.isInteger(maxPages)||maxPages<1||maxPages>50||!Number.isInteger(maxIds)||maxIds<1||maxIds>10000)fail('bounds_invalid');
 let pageToken=null,pages=0,last=BigInt(startHistoryId),end=null,records=0;
 const changed=new Set(),seenTokens=new Set();
 do{
  if(pages>=maxPages)fail('page_cap_incomplete');
  const q=new URLSearchParams({startHistoryId,maxResults:'500'});
  if(pageToken)q.set('pageToken',pageToken);
  const r=await request(BASE+'/history?'+q,accessToken,fetchImpl,'delta');
  if(!cursor(r?.historyId)||BigInt(r.historyId)<last||r.history!==undefined&&!Array.isArray(r.history))fail('delta_shape_invalid');
  for(const h of r.history||[]){
   if(!cursor(h?.id)||BigInt(h.id)<=last||BigInt(h.id)>BigInt(r.historyId))fail('record_order_invalid');
   last=BigInt(h.id);records++;
   let found=0;
   for(const k of ['messages','messagesAdded','messagesDeleted','labelsAdded','labelsRemoved']){
    if(h[k]===undefined)continue;
    if(!Array.isArray(h[k]))fail('record_shape_invalid');
    for(const entry of h[k]){
     const key=k==='messages'?entry?.id:entry?.message?.id;
     if(!id(key))fail('message_id_invalid');
     changed.add(key);found++;
     if(changed.size>maxIds)fail('change_cap_incomplete');
    }
   }
   if(!found)fail('empty_change_record');
  }
  end=r.historyId;pages++;
  pageToken=r.nextPageToken??null;
  if(pageToken!==null){
   if(typeof pageToken!=='string'||!pageToken||pageToken.length>4096||seenTokens.has(pageToken))fail('pagination_invalid');
   seenTokens.add(pageToken);
  }
 }while(pageToken!==null);
 return {startHistoryId,endHistoryId:end,changedIds:[...changed],pages,records};
}
async function main(){
 const args=process.argv.slice(2),flag=k=>{const i=args.indexOf(k);return i<0?null:args[i+1]};
 if(args[0]!=='--probe')fail('probe_only');
 const expectedMailbox=flag('--mailbox');
 const client=desktopClient(readPrivateJson(flag('--client-file')));
 const binding=readPrivateJson(flag('--binding-file'));
 const accessToken=await refreshBinding({client,binding,expectedMailbox});
 const startHistoryId=await readHistoryCheckpoint({accessToken,expectedMailbox});
 const delta=await collectHistoryDelta({accessToken,startHistoryId});
 console.log(JSON.stringify({state:'gmail_history_delta_probe_pass',mailbox_identity_verified:true,pages:delta.pages,history_records:delta.records,changed_message_count:delta.changedIds.length,checkpoint_advanced:delta.endHistoryId!==startHistoryId,checkpoint_persisted:false,baseline_established:false,send_authority:false,private_records_exported:0}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{
 const c=String(e?.message||'');
 console.error('GMAIL_HISTORY_HELD '+(/^gmail_[a-z0-9_]+$/.test(c)?c:'private_input_or_operation_failed'));
 process.exitCode=1;
});
