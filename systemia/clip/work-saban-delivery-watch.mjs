#!/usr/bin/env node
// First-party, read-only reconciliation of Work Saban's private Clip Facebook claims.
// A local provider receipt is NOT independent proof of public anonymous visibility.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const CAMPAIGN='work-saban-clip-evergreen-20261030';
export const WATCH_SCHEMA='evercraft.clip.work-saban-delivery-watch.v1';
const BASE='https://www.facebook.com/';
const clean=x=>String(x??'').trim();
function pacificDate(at){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',
   {timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'})
   .formatToParts(at).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return parts.year+'-'+parts.month+'-'+parts.day;
}
function validFacebookUrl(raw){
 try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&
  ['facebook.com','www.facebook.com','m.facebook.com'].includes(u.hostname)&&
  u.pathname.length>1;}catch{return false;}
}
function loadClaim(dir,id){
 const file=path.join(dir,'entries',id+'.json');
 try{
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32768) return {state:'invalid_claim'};
  const r=JSON.parse(fs.readFileSync(file,'utf8'));
  if(r?.schema!=='evercraft.clip.work-saban-facebook-claim.v1'||r.entry_id!==id||r.campaign_id!==CAMPAIGN)
   return {state:'invalid_claim'};
  return {state:'claim_found',value:r};
 }catch(error){
  if(error?.code==='ENOENT')return {state:'missing'};
  return {state:'invalid_claim'};
 }
}
function receiptState(r,expectedPageId,at){
 if(r.status!=='provider_receipt_recorded')return {state:'manual_reconciliation_required'};
 const date=Date.parse(r.published_at);
 if(!clean(r.provider_post_id)||!clean(r.provider_comment_id)||!validFacebookUrl(r.provider_post_url)||
    !Number.isFinite(date)||date>at.getTime()+300000||!clean(r.authorization_ref)||!clean(r.page_id)||
    (expectedPageId&&r.page_id!==expectedPageId))
  return {state:'invalid_claim'};
 return {state:'local_provider_receipt_recorded',url:r.provider_post_url,published_at:r.published_at};
}
export function auditWorkSabanDelivery({queue,privateStateDir,expectedPageId='',now=new Date()}={}){
 if(queue?.schema!=='evercraft.marketing.owner-review-queue.v1'||queue.campaign_id!==CAMPAIGN||
    !Array.isArray(queue.entries))throw Error('work_saban_delivery_queue_invalid');
 if(!privateStateDir)throw Error('work_saban_delivery_state_dir_required');
 const at=now instanceof Date?now:new Date(now);
 if(!Number.isFinite(at.getTime()))throw Error('work_saban_delivery_clock_invalid');
 const fb=queue.entries.filter(e=>e.platform==='facebook'&&e.destination==='facebook-page');
 if(fb.length!==4||new Set(fb.map(x=>x.id)).size!==4||
   fb.some(e=>!/^work-saban-rotation-w[1-4]-facebook$/.test(e.id)||!/^(?:20\d{2})-\d{2}-\d{2}$/.test(e.planned_day)))
  throw Error('work_saban_delivery_facebook_slots_invalid');
 const day=pacificDate(at),accountBindingPresent=Boolean(clean(expectedPageId));
 const rows=fb.map(e=>{
  const c=loadClaim(privateStateDir,e.id);
  const result=c.state==='claim_found'?receiptState(c.value,clean(expectedPageId),at):{state:c.state==='invalid_claim'?'invalid_claim':'not_submitted'};
  return {id:e.id,planned_day:e.planned_day,delivery_state:result.state,
   provider_post_url:result.url||null,provider_published_at:result.published_at||null,
   public_anonymous_visibility_verified:false};
 }).sort((a,b)=>a.planned_day.localeCompare(b.planned_day));
 const count=(state)=>rows.filter(x=>x.delivery_state===state).length;
 const claimed=count('local_provider_receipt_recorded'),manual=count('manual_reconciliation_required'),
  invalid=count('invalid_claim'),due=rows.filter(x=>x.planned_day<=day&&x.delivery_state==='not_submitted').length;
 let status='awaiting_due_date';
 if(invalid)status='claim_integrity_attention';
 else if(manual)status='manual_reconciliation_required';
 else if(!accountBindingPresent)status='company_page_binding_missing';
 else if(due)status='due_without_provider_receipt';
 else if(claimed)status='provider_receipts_recorded_visibility_unverified';
 return {schema:WATCH_SCHEMA,campaign_id:CAMPAIGN,source_key:'work-saban-clip-delivery-watch',
  observed_at:at.toISOString(),status,account_binding_present:accountBindingPresent,
  counts:{facebook_slots:fb.length,local_provider_receipt_recorded:claimed,
    manual_reconciliation_required:manual,invalid_claims:invalid,due_without_receipt:due,
    other_channels_verified:0},slots:rows,
  provider_receipts_not_public_visibility:true,credentials_checked:false,provider_network_checked:false,
  warnings:['Private claim records reflect provider responses, not an independent public visibility check.',
   'This watcher never posts, reads credentials, mints grants, or calls Facebook.']};
}
function writeAtomic(file,document){
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o750});
 const tmp=file+'.'+process.pid+'.tmp';
 try{fs.writeFileSync(tmp,JSON.stringify(document,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
 }finally{try{fs.rmSync(tmp,{force:true});}catch{}}
}
export function runWorkSabanDeliveryWatch({queueFile,privateStateDir,outputFile,expectedPageId='',now=new Date()}={}){
 if(!queueFile||!privateStateDir||!outputFile)throw Error('work_saban_delivery_paths_required');
 const queue=JSON.parse(fs.readFileSync(queueFile,'utf8'));
 const r=auditWorkSabanDelivery({queue,privateStateDir,expectedPageId,now});
 writeAtomic(outputFile,r);
 const unresolved=r.counts.facebook_slots-r.counts.local_provider_receipt_recorded;
 const mission={
  schema:'evercraft.kaidance.mission-snapshot.v1',
  source_key:'work-saban-clip-delivery-watch',
  mission_key:'evercraft-social-distribution-engine-2026-09',
  snapshot_ref:'work-saban-clip:'+r.status,
  observed_at:r.observed_at,status:r.status,
  founder_action_required:r.status==='company_page_binding_missing',
  human_gate_required:r.status==='company_page_binding_missing'||r.status==='manual_reconciliation_required'||r.status==='claim_integrity_attention',
  counts:{scanned:r.counts.facebook_slots,changed:unresolved,admitted:r.counts.local_provider_receipt_recorded,held:unresolved},
  delivery_counts:r.counts,account_binding_present:r.account_binding_present,
  evidence_refs:['clip:work-saban:private-claims-reviewed','clip:work-saban:provider-visibility-unverified'],
  actions:r.slots.filter(e=>e.delivery_state!=='local_provider_receipt_recorded')
    .map(e=>({id:e.id,state:e.delivery_state})),
  boundaries:{read_only:true,credentials_checked:false,publication_authority:false,
   provider_network_checked:false,platform_visibility_independently_verified:false}
 };
 writeAtomic(path.join(path.dirname(outputFile),'mission-snapshot.json'),mission);
 return r;
}
function arg(argv,key,fallback=''){const i=argv.indexOf(key);return i>=0&&argv[i+1]?argv[i+1]:fallback;}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 try{
  const argv=process.argv.slice(2);
  const result=runWorkSabanDeliveryWatch({
   queueFile:arg(argv,'--queue','distribution/marketing/work-saban-clip-evergreen-20261030.review.json'),
   privateStateDir:arg(argv,'--state-dir',process.env.SYSTEMIA_WORK_SABAN_CLIP_STATE_DIR||''),
   outputFile:arg(argv,'--out',process.env.SYSTEMIA_WORK_SABAN_DELIVERY_WATCH_OUT||''),
   expectedPageId:arg(argv,'--expected-facebook-page-id',process.env.EVERCRAFT_CLIP_WORK_SABAN_FACEBOOK_PAGE_ID||'')
  });
  process.stdout.write(JSON.stringify({status:result.status,counts:result.counts,
   provider_visibility_verified:false,secret_material_returned:false})+'\n');
 }catch(e){process.stderr.write('work_saban_delivery_watch_failed:'+clean(e?.message||e)+'\n');process.exitCode=1;}
}
