#!/usr/bin/env node
// Read-only Evercraft Clip continuity: no credentials, approvals or publishing authority.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const QUEUE_SCHEMA='evercraft.marketing.owner-review-queue.v1';
const RECEIPT_SCHEMA='evercraft.clip.social-publish-receipt.v1';
const WATCH_SCHEMA='evercraft.clip.social-continuity-watch.v1';
const PROVIDERS=new Set(['facebook.com','www.facebook.com','m.facebook.com','linkedin.com','www.linkedin.com','instagram.com','www.instagram.com','youtube.com','www.youtube.com','youtu.be','tiktok.com','www.tiktok.com','threads.net','www.threads.net','x.com','www.x.com','bsky.app']);
const clean=v=>String(v??'').trim();
function todayInZone(now,zone){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const p=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return p.year+'-'+p.month+'-'+p.day;
}
function isProviderUrl(raw){
  try{
    const u=new URL(raw);
    return u.protocol==='https:'&&!u.username&&!u.password&&PROVIDERS.has(u.hostname.toLowerCase());
  }catch{return false;}
}
function validReceipt(r,e,now){
  if(r?.schema!==RECEIPT_SCHEMA||r.status!=='published'||clean(r.requestId)!==clean(e.id)) return false;
  if(e.authorization?.approved!==true||!clean(e.authorization.authorizationRef)) return false;
  if(clean(r.authorizationRef)!==clean(e.authorization.authorizationRef)) return false;
  if(!clean(r.remoteId)||!isProviderUrl(r.url)) return false;
  if(!Array.isArray(r.sourceRefs)||!r.sourceRefs.some(x=>clean(x).startsWith('provider:'))) return false;
  const when=Date.parse(r.publishedAt);
  return Number.isFinite(when)&&when<=now.getTime()+300000;
}
export function auditSocialContinuity({queue,receipts=[],now=new Date(),timezone='America/Los_Angeles',receiptSourceAvailable=true}={}){
  if(queue?.schema!==QUEUE_SCHEMA||!Array.isArray(queue.entries)) throw new Error('clip_social_watch_queue_schema_invalid');
  const at=now instanceof Date?now:new Date(now);
  if(!Number.isFinite(at.getTime())) throw new Error('clip_social_watch_now_invalid');
  const today=todayInZone(at,timezone),ids=new Set();
  const entries=queue.entries.map(e=>{
    const id=clean(e.id);
    if(!id||ids.has(id)) throw new Error('clip_social_watch_duplicate_or_missing_id');
    ids.add(id);
    const approved=e.authorization?.approved===true&&Boolean(clean(e.authorization.authorizationRef));
    const matched=receipts.filter(r=>clean(r?.requestId)===id);
    const proven=matched.find(r=>validReceipt(r,e,at));
    const planned=clean(e.planned_day);
    const overdue=/^\d{4}-\d{2}-\d{2}$/.test(planned)&&planned<today;
    let state,reason;
    if(proven){state='provider_receipt_recorded';reason='requires_external_platform_visibility_recheck';}
    else if(!approved){state='approval_hold';reason='owner_systemia_publication_authority_missing';}
    else if(!receiptSourceAvailable){state='receipt_source_unavailable';reason='cannot_reconcile_provider_receipts';}
    else if(matched.length){state='publish_exception';reason='receipts_present_but_publication_proof_invalid';}
    else if(overdue){state='overdue_approved';reason='approved_day_passed_without_matching_receipt';}
    else{state='approved_awaiting_delivery';reason='approved_but_no_matching_receipt';}
    return {id,planned_day:planned||null,proposed_channels:Array.isArray(e.proposed_channels)?e.proposed_channels:[],state,reason,provider_post_url:proven?.url||null,provider_post_id:proven?.remoteId||null,provider_published_at:proven?.publishedAt||null,authorization_present:approved,receipt_count:matched.length};
  });
  const counts={total:entries.length,approval_hold:0,approved_awaiting_delivery:0,overdue_approved:0,publish_exception:0,receipt_source_unavailable:0,provider_receipt_recorded:0};
  entries.forEach(e=>counts[e.state]++);
  const attention=counts.overdue_approved+counts.publish_exception+counts.receipt_source_unavailable;
  const status=attention?'attention_required':counts.approval_hold?'owner_review_required':counts.approved_awaiting_delivery?'delivery_unverified':'receipts_recorded';
  return {schema:WATCH_SCHEMA,campaign_id:clean(queue.campaign_id),engine:'evercraft_clip',orchestrator:'systemia',evaluated_at:at.toISOString(),calendar_timezone:timezone,status,receipt_source_available:receiptSourceAvailable,platform_connections_verified:queue.platform_connections_verified===true,counts,entries,warnings:[
    'Local producer receipts do not prove live social-platform visibility.',
    'No provider submission, credential lookup, approval or purchase was performed.',
    ...(queue.platform_connections_verified===true?[]:['Account permissions and tokens have not been independently verified.']),
    ...(!receiptSourceAvailable?['Receipt source missing: no publication-absence claim can be made.']:[])
  ]};
}
function arg(argv,key,fallback=''){const i=argv.indexOf(key);return i>=0&&argv[i+1]?argv[i+1]:fallback;}
function readReceipts(dir){
  if(!fs.existsSync(dir)) return {available:false,rows:[]};
  if(!fs.statSync(dir).isDirectory()) throw new Error('clip_social_watch_receipts_not_directory');
  const rows=[];
  const files=fs.readdirSync(dir,{withFileTypes:true}).filter(f=>f.isFile()&&!f.isSymbolicLink()&&/\.jsonl?$/.test(f.name)).sort().slice(0,500);
  for(const f of files){
    const file=path.join(dir,f.name);
    if(fs.statSync(file).size>1024*1024) continue;
    try{
      const content=fs.readFileSync(file,'utf8');
      if(f.name.endsWith('.jsonl')){
        for(const line of content.split('\n').filter(Boolean)){try{rows.push(JSON.parse(line));}catch{}}
      }else{
        const x=JSON.parse(content);
        if(Array.isArray(x)) rows.push(...x);else rows.push(x);
      }
    }catch{}
  }
  return {available:true,rows};
}
export function runSocialContinuityWatch({queueFile,receiptDir,outputFile,now=new Date()}={}){
  if(!queueFile||!receiptDir||!outputFile) throw new Error('clip_social_watch_paths_required');
  const queue=JSON.parse(fs.readFileSync(queueFile,'utf8'));
  const {available,rows}=readReceipts(receiptDir);
  const result=auditSocialContinuity({queue,receipts:rows,receiptSourceAvailable:available,now});
  fs.mkdirSync(path.dirname(outputFile),{recursive:true,mode:0o750});
  const tmp=outputFile+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(result,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,outputFile);
  // KAIDANCE mission-fabric consumption: preserve a bounded, privacy-safe digest.
  const unresolved=result.counts.total-result.counts.provider_receipt_recorded;
  const missionSnapshot={
    schema:'evercraft.kaidance.mission-snapshot.v1',
    snapshot_ref:'clip-social-continuity:'+result.campaign_id+':'+result.status,
    observed_at:result.evaluated_at,
    source_key:'evercraft-social-continuity-watch',
    mission_key:'evercraft-social-distribution-engine-2026-09',
    status:result.status,
    founder_action_required:result.counts.approval_hold>0,
    human_gate_required:result.counts.approval_hold>0,
    counts:{scanned:result.counts.total,changed:unresolved,admitted:0,held:unresolved},
    delivery_counts:result.counts,
    evidence_refs:['clip-social-watch:review-queue:'+result.campaign_id,'clip-social-watch:receipt-source-available:'+result.receipt_source_available],
    actions:result.entries.filter(e=>e.state!=='provider_receipt_recorded').map(e=>({id:e.id,state:e.state,reason:e.reason})).slice(0,100),
    boundaries:{read_only:true,publication_authority:false,platform_visibility_independently_verified:false},
  };
  const missionFile=path.join(path.dirname(outputFile),'mission-snapshot.json');
  const missionTmp=missionFile+'.'+process.pid+'.tmp';
  fs.writeFileSync(missionTmp,JSON.stringify(missionSnapshot,null,2)+'\n',{mode:0o600});
  fs.renameSync(missionTmp,missionFile);
  return result;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  try{
    const a=process.argv.slice(2);
    const result=runSocialContinuityWatch({
      queueFile:arg(a,'--queue','distribution/marketing/evercraft-problem-first-20261022.review.json'),
      receiptDir:arg(a,'--receipts-dir','artifacts/clip/social-publish-receipts'),
      outputFile:arg(a,'--out',process.env.SYSTEMIA_WORKSPACE_ROOT?path.join(process.env.SYSTEMIA_WORKSPACE_ROOT,'clip-social-continuity','latest.json'):'artifacts/clip/social-continuity-watch/latest.json'),
      now:arg(a,'--now')||new Date()
    });
    console.log(JSON.stringify({ok:true,status:result.status,counts:result.counts,receipt_source_available:result.receipt_source_available},null,2));
  }catch(e){console.error('clip_social_watch_failed:'+clean(e?.message||e));process.exitCode=1;}
}
