// Positive-only targeted history review through the existing owned read-only grant.
// Never infer complete history, customer identity, intent, quota or send authority.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {desktopClient,readPrivateJson,refreshBinding} from './owned-gmail-binding.mjs';
import {HEADERS,getJson,parseGmailMetadata} from './owned-gmail-import.mjs';
const BASE='https://gmail.googleapis.com/gmail/v1/users/me/messages';
const HOST=/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const KEY=/^findmypart:shop:[a-z0-9-]{1,80}$/;
const NAME=/^[A-Za-z0-9][A-Za-z0-9 .&'()-]{2,119}$/;
// Public business contacts, individually sourced; never match an entire shared mail domain.
const CONTACTS=Object.freeze({
 'findmypart:shop:small-engine-specialties':Object.freeze({host:'sespecialties.com',address:'kyle@sesspecialties.com',source:'https://www.sespecialties.com/parts-and-service'}),
 'findmypart:shop:outdoor-power-repair':Object.freeze({host:'outdoorpowerandrepair.com',address:'opr98837@gmail.com',source:'https://www.outdoorpowerandrepair.com/'})
});
function officialContact(t){const c=CONTACTS[t.work_key];return c?.host===t.host?c:null}
const sleepDefault=ms=>new Promise(r=>setTimeout(r,ms));
const fail=c=>{throw Error('gmail_targeted_'+c)};
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(x);
const domain=x=>typeof x==='string'&&x.includes('@')?x.split('@').at(-1).toLowerCase():null;
export function selectShopTargets(queue,now=Date.now()){
 const age=now-Date.parse(queue?.observed_at);
 if(queue?.schema!=='evercraft.kaidance.company-heartbeat.queue.v1'||queue.execution_authorized!==false||!Number.isFinite(age)||age<0||age>30*60000||!Array.isArray(queue.candidates))fail('queue_binding_hold');
 const rows=queue.candidates.filter(r=>KEY.test(r?.work_key||''));
 if(rows.length>6||new Set(rows.map(r=>r.work_key)).size!==rows.length)fail('queue_capacity_or_duplicate_hold');
 return rows.map(r=>{
  if(r.execution_authorized!==false||r.outreach_authorized!==false||r.buyer_need_confirmed!==false)fail('queue_authority_hold');
  let u;try{u=new URL(r.source_url)}catch{fail('source_hold')}
  const host=u.hostname.toLowerCase().replace(/^www\./,'');
  if(u.protocol!=='https:'||u.username||u.password||!HOST.test(host))fail('source_hold');
  if(!NAME.test(r.business_name||''))fail('business_name_hold');
  return {work_key:r.work_key,host,name:r.business_name};
 });
}
export async function reviewTargetedHistory({targets,accessToken,fetchImpl=globalThis.fetch,sleep=sleepDefault,clock=Date.now}={}){
 if(!Array.isArray(targets)||targets.length>6||new Set(targets.map(x=>x?.work_key)).size!==targets.length||targets.some(x=>!KEY.test(x?.work_key||'')||!HOST.test(x?.host||'')||!NAME.test(x?.name||'')))fail('targets_hold');
 if(typeof accessToken!=='string'||accessToken.length<16)fail('token_hold');
 const deadline=clock()+90000,cache=new Map(),results=[];
 const get=async(url,stage)=>{
  if(clock()>deadline)fail('budget_hold');
  return getJson(url,accessToken,fetchImpl,{stage,maxRetries:1,sleep});
 };
 for(const target of targets){
  const h=target.host;
  // Provider search is a candidate generator, not an exact-address guarantee.
  const contact=officialContact(target);
  const address=contact?.address;
  const exactQuery=address?' from:'+address+' to:'+address+' cc:'+address+' bcc:'+address:'';
  const q='in:anywhere -in:drafts {from:'+h+' to:'+h+' cc:'+h+' bcc:'+h+' "'+target.name+'"'+exactQuery+'}';
  const ids=new Set(),tokens=new Set();
  let pageToken=null,pages=0,truncated=false;
  do{
   const params=new URLSearchParams({q,maxResults:'50',includeSpamTrash:'true'});
   if(pageToken)params.set('pageToken',pageToken);
   const r=await get(BASE+'?'+params,'list');
   if(!r||r.messages!==undefined&&!Array.isArray(r.messages))fail('list_shape_hold');
   for(const m of r.messages||[]){
    if(!id(m?.id))fail('id_hold');
    if(ids.size>=50&&!ids.has(m.id)){truncated=true;break}
    ids.add(m.id);
   }
   pages++;
   pageToken=r.nextPageToken??null;
   if(pageToken!==null){
    if(typeof pageToken!=='string'||!pageToken||pageToken.length>4096||tokens.has(pageToken))fail('pagination_hold');
    tokens.add(pageToken);
   }
   if(ids.size>=50&&pageToken||pages>=3&&pageToken)truncated=true;
  }while(pageToken&&!truncated);
  const mail=[];
  for(const key of ids){
   if(!cache.has(key)){
    if(cache.size>=120)fail('metadata_capacity_hold');
    const qs=new URLSearchParams({format:'metadata'});
    for(const header of HEADERS)qs.append('metadataHeaders',header);
    const r=await get(BASE+'/'+encodeURIComponent(key)+'?'+qs,'metadata');
    if(r?.id!==key)fail('identity_hold');
    if(r.labelIds?.includes('DRAFT'))fail('draft_membership_hold');
    cache.set(key,parseGmailMetadata(r));await sleep(150);
   }
   mail.push(cache.get(key));
  }
  const sent=mail.filter(m=>m.direction==='outbound'&&m.to_addresses.some(a=>domain(a)===h));
  const inbound=mail.filter(m=>m.direction==='inbound'&&domain(m.from_address)===h);
  const reply=inbound.filter(m=>!m.is_auto_reply&&!m.is_bounce&&m.thread_id&&sent.some(s=>s.thread_id===m.thread_id&&Date.parse(s.occurred_at)<Date.parse(m.occurred_at)));
  const exactSent=address?mail.filter(m=>m.direction==='outbound'&&m.to_addresses.includes(address)):[];
  const exactInbound=address?mail.filter(m=>m.direction==='inbound'&&m.from_address===address):[];
  const exactReply=exactInbound.filter(m=>!m.is_auto_reply&&!m.is_bounce&&m.thread_id&&exactSent.some(s=>s.thread_id===m.thread_id&&Date.parse(s.occurred_at)<Date.parse(m.occurred_at)));
  const otherSent=mail.filter(m=>m.direction==='outbound'&&!sent.includes(m)&&!exactSent.includes(m)&&m.to_addresses.length>0);
  const otherInbound=mail.filter(m=>m.direction==='inbound'&&!inbound.includes(m)&&!exactInbound.includes(m));
  const otherReply=otherInbound.filter(m=>!m.is_auto_reply&&!m.is_bounce&&m.thread_id&&m.from_address&&otherSent.some(s=>s.thread_id===m.thread_id&&s.to_addresses.includes(m.from_address)&&Date.parse(s.occurred_at)<Date.parse(m.occurred_at)));
  results.push({work_key:target.work_key,provider_candidates:ids.size,search_truncated:truncated,exact_domain_outbound:sent.length,exact_domain_inbound:inbound.length,same_thread_reply_candidates:reply.length,official_contact_source:contact?.source||null,exact_public_contact_outbound:exactSent.length,exact_public_contact_inbound:exactInbound.length,exact_public_contact_same_thread_reply_candidates:exactReply.length,unattributed_outbound_candidates:otherSent.length,unattributed_inbound_candidates:otherInbound.length,unattributed_same_thread_reply_candidates:otherReply.length,state:reply.length||exactReply.length?'review_existing_thread_for_actual_buyer_need':sent.length||inbound.length||exactSent.length||exactInbound.length?'review_existing_contact_history':ids.size?'review_unattributed_search_hits':'no_search_match_not_clearance',contact_clearance:false,outreach_authorized:false});
 }
 return {schema:'evercraft.findmypart.gmail-targeted-history.v3',search_basis:'official_domain_or_business_name_or_exact_public_contact',candidates_reviewed:results.length,metadata_requests:cache.size,results,full_history_confirmed:false,buyer_replies_verified:0,buyers_qualified:0,send_authority:false,private_records_exported:0};
}
async function main(){
 const args=process.argv.slice(2),i=args.indexOf('--mailbox');
 if(args[0]!=='--review-live-queue'||i<0)fail('usage');
 const expectedMailbox=args[i+1],home=os.homedir();
 const queuePath=path.join(home,'.local/state/evercraft/systemia/kaidance-company-heartbeat/queue.json');
 const fd=fs.openSync(queuePath,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 let queue;
 try{
  const s=fs.fstatSync(fd);
  if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>1048576)fail('queue_private_hold');
  const b=Buffer.alloc(s.size+1),n=fs.readSync(fd,b,0,b.length,0);
  if(n!==s.size||fs.fstatSync(fd).size!==s.size)fail('queue_changed_hold');
  queue=JSON.parse(b.subarray(0,n).toString('utf8'));
 }finally{fs.closeSync(fd)}
 const targets=selectShopTargets(queue);
 const root=path.join(home,'.local/state/evercraft-revenue-desk/.secrets');
 const client=desktopClient(readPrivateJson(path.join(root,'gmail-desktop-client.json')));
 const binding=readPrivateJson(path.join(root,'gmail-readonly-binding.json'));
 const accessToken=await refreshBinding({client,binding,expectedMailbox});
 const receipt=await reviewTargetedHistory({targets,accessToken});
 console.log(JSON.stringify(receipt,null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{
 const c=String(e?.message||'');
 console.error('GMAIL_TARGETED_HISTORY_HELD '+(/^gmail_[a-z0-9_]+$/.test(c)?c:'private_input_or_operation_failed'));process.exitCode=1;
});
