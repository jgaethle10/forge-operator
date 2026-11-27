import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

// User-authorized Gmail API on an Evercraft-owned node. Metadata only.
// No OAuth grant creation, body, attachment, send endpoint, or send authority.
const BASE='https://gmail.googleapis.com/gmail/v1/users/me/messages';
const HEADERS=['From','To','Cc','Bcc','Auto-Submitted','X-Autoreply','X-Autorespond','X-Failed-Recipients'];
const ADDRESS=/[a-zA-Z0-9_.!#$%&'*+/=?^_{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const clean=v=>String(v??'').trim();
function readFileStrict(file){
 if(!file||!path.isAbsolute(file))throw Error('gmail_private_absolute_file_required');
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0)throw Error('gmail_private_file_permissions_invalid');
 return fs.readFileSync(file,'utf8');
}
function addresses(value){
 const raw=clean(value);
 if(!raw)return [];
 const found=raw.match(ADDRESS)||[];
 // Unsupported quoted/group recipient layouts must fail closed downstream.
 if((raw.match(/@/g)||[]).length!==found.length)return [];
 return [...new Set(found.map(x=>x.toLowerCase()))];
}
export function parseGmailMetadata(m){
 const h={};
 for(const x of m?.payload?.headers||[]){
  const name=clean(x.name).toLowerCase();
  if(HEADERS.some(y=>y.toLowerCase()===name))h[name]=clean(x.value);
 }
 const outbound=(Array.isArray(m?.labelIds)?m.labelIds:[]).includes('SENT');
 const to=[...new Set([...addresses(h.to),...addresses(h.cc),...addresses(h.bcc)])];
 const from=addresses(h.from)[0]||null;
 const auto=/auto-(replied|generated)|auto/i.test(h['auto-submitted']||'')||
   Boolean(h['x-autoreply']||h['x-autorespond']);
 const bounced=Boolean(h['x-failed-recipients'])||
   /^(mailer-daemon|postmaster)@/i.test(from||'');
 const internalTime=Number(m?.internalDate);
 if(!Number.isFinite(internalTime)||internalTime<=0)throw Error('gmail_message_timestamp_unavailable');
 if(!clean(m.id))throw Error('gmail_message_id_missing');
 return {message_id:clean(m.id),thread_id:clean(m.threadId)||null,
  direction:outbound?'outbound':'inbound',
  occurred_at:new Date(internalTime).toISOString(),
  from_address:from,to_addresses:to,is_auto_reply:auto,is_bounce:bounced};
}
// Never log provider messages, response bodies, request URLs or mailbox IDs.
const REASONS=new Set(['rateLimitExceeded','userRateLimitExceeded','dailyLimitExceeded','quotaExceeded','insufficientPermissions','forbidden','authError','accessNotConfigured','domainPolicy','backendError','notFound','SERVICE_DISABLED','ACCESS_TOKEN_SCOPE_INSUFFICIENT','RESOURCE_EXHAUSTED','RATE_LIMIT_EXCEEDED']);
const RATE=new Set(['rateLimitExceeded','userRateLimitExceeded','RATE_LIMIT_EXCEEDED']);
const sleepDefault=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function getJson(url,token,fetchImpl,{stage,maxRetries,sleep}){
 for(let attempt=0;;attempt++){
  let response;
  try{
   response=await fetchImpl(url,{method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});
  }catch{throw Error('gmail_api_transport_hold_'+stage)}
  if(response?.ok)return response.json();
  const status=Number.isInteger(response?.status)&&response.status>=100&&response.status<=599?response.status:0;
  let reasons=[];
  try{
   const e=(await response.json()).error;
   reasons=[...(Array.isArray(e?.errors)?e.errors:[]),...(Array.isArray(e?.details)?e.details:[])].map(x=>x?.reason).filter(x=>REASONS.has(x));
  }catch{}
  const daily=reasons.some(x=>['dailyLimitExceeded','quotaExceeded'].includes(x));
  const rate=status===429||(status===403&&reasons.some(x=>RATE.has(x)));
  const transient=!daily&&(rate||[500,502,503,504].includes(status));
  let delay=1000*2**attempt;
  const retryAfter=response?.headers?.get?.('retry-after');
  if(retryAfter){
   const seconds=/^\d+$/.test(retryAfter)?Number(retryAfter)*1000:Date.parse(retryAfter)-Date.now();
   if(Number.isFinite(seconds))delay=Math.max(delay,seconds);
  }
  if(transient&&attempt<maxRetries&&delay<=30000){
   await sleep(delay);continue;
  }
  const kind=daily?'quota':rate?'rate_limited':status===401||status===403?'authorization_or_scope':status===404?'message_unavailable':'api_fetch_failed';
  const suffix=[stage,String(status),...[...new Set(reasons)].sort().map(x=>x.toLowerCase())].join('_');
  throw Error('gmail_'+kind+'_hold_'+suffix);
 }
}
// Full pagination for this query, not necessarily complete historical coverage.
// A short rolling query cannot establish historical contact freshness.
export async function fetchOwnedGmailMetadata({
 accessToken,now=new Date().toISOString(),lookbackHours=30,
 maxPages=200,fetchImpl=globalThis.fetch,concurrency=1,
 maxRetries=3,pauseMs=150,sleep=sleepDefault
}={}){
 if(typeof accessToken!=='string'||accessToken.length<16)throw Error('gmail_owned_access_token_required');
 const at=Date.parse(now);
 if(!Number.isFinite(at))throw Error('gmail_window_clock_invalid');
 if(!Number.isInteger(maxPages)||maxPages<1||maxPages>500||
    !Number.isInteger(concurrency)||concurrency<1||concurrency>12||
    !Number.isInteger(maxRetries)||maxRetries<0||maxRetries>3||
    !Number.isInteger(pauseMs)||pauseMs<0||pauseMs>1000||typeof sleep!=='function')
   throw Error('gmail_pagination_limits_invalid');
 if(lookbackHours!==null&&(!Number.isInteger(lookbackHours)||lookbackHours<25||lookbackHours>24*365))
   throw Error('gmail_lookback_window_invalid');
 let q='in:anywhere -in:drafts';
 if(lookbackHours!==null)q+=' after:'+Math.floor((at-lookbackHours*3600000)/1000);
 let nextPage=null,page=0;
 const ids=new Set();
 do{
  if(page>=maxPages)throw Error('gmail_history_page_limit_incomplete');
  const params=new URLSearchParams({q,maxResults:'500'});
  if(nextPage)params.set('pageToken',nextPage);
  const result=await getJson(BASE+'?'+params.toString(),accessToken,fetchImpl,{stage:'list',maxRetries,sleep});
  if(!Array.isArray(result.messages)&&result.messages!==undefined)
    throw Error('gmail_message_list_invalid');
  for(const x of result.messages||[]){
   if(!clean(x.id))throw Error('gmail_list_message_id_missing');
   ids.add(x.id);
  }
  nextPage=result.nextPageToken||null;
  page++;
 }while(nextPage);
 const uniqueIds=[...ids];
 const rows=[];
 for(let i=0;i<uniqueIds.length;i+=concurrency){
  const batch=uniqueIds.slice(i,i+concurrency);
  const found=await Promise.all(batch.map(async id=>{
   const qs=new URLSearchParams({format:'metadata'});
   for(const h of HEADERS)qs.append('metadataHeaders',h);
   const data=await getJson(BASE+'/'+encodeURIComponent(id)+'?'+qs.toString(),accessToken,fetchImpl,{stage:'metadata',maxRetries,sleep});
   if(data?.id!==id)throw Error('gmail_message_identity_mismatch');
   return parseGmailMetadata(data);
  }));
  rows.push(...found);
  if(i+concurrency<uniqueIds.length&&pauseMs)await sleep(pauseMs);
 }
 if(rows.length!==uniqueIds.length)throw Error('gmail_history_metadata_incomplete');
 return {schema:'evercraft.systemia.gmail-owned-metadata-snapshot.v1',
   observed_at:now,mailbox_scope:lookbackHours===null?'accessible_full_history':'lookback_hours_'+lookbackHours,
   requested_query:q,listing_pages:page,listing_exhausted:true,
   messages:rows,source:'authenticated_gmail_readonly_api',
   provider_send_performed:false,full_history_confirmed:lookbackHours===null};
}
export function savePrivateGmailSnapshot({snapshot,outFile}={}){
 if(!outFile||!path.isAbsolute(outFile))throw Error('private_gmail_snapshot_path_required');
 const parent=fs.lstatSync(path.dirname(outFile));
 if(!parent.isDirectory()||parent.isSymbolicLink()||(parent.mode&0o077)!==0)
  throw Error('private_gmail_snapshot_dir_invalid');
 const fd=fs.openSync(outFile,'wx',0o600);
 try{fs.writeFileSync(fd,JSON.stringify(snapshot,null,2)+'\n','utf8');fs.fsyncSync(fd);}
 finally{fs.closeSync(fd);}
 return {saved:true,count:snapshot.messages.length,read_only:true};
}
async function main(){
 const flag=name=>{const at=process.argv.indexOf(name);return at>=0?process.argv[at+1]:null;};
 const secret=readFileStrict(flag('--oauth-token-file')).trim();
 const horizon=flag('--full-history')==='1'?null:Number(flag('--lookback-hours')||30);
 const snapshot=await fetchOwnedGmailMetadata({accessToken:secret,lookbackHours:horizon});
 const saved=savePrivateGmailSnapshot({snapshot,outFile:flag('--out-file')});
 console.log(JSON.stringify({schema:'evercraft.systemia.gmail-readonly-import-summary.v1',
  imported:saved.count,pages:snapshot.listing_pages,full_history:snapshot.full_history_confirmed,
  sent:snapshot.messages.filter(x=>x.direction==='outbound').length,
  no_send:true,private_output:true}));
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)
 main().catch(e=>{console.error('OWNED_GMAIL_IMPORT_HELD '+String(e?.message||e).slice(0,160));process.exitCode=1;});
