#!/usr/bin/env node
// Evercraft-owned Work Saban Facebook Page rotation. Never reads personal-account credentials.
// Fail-closed: a local claim precedes provider POST, and ambiguous outcomes are not retried.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateWorkSabanText,WORK_SABAN_CAMPAIGN} from './work-saban-publish-authorize.mjs';
import {preflightPublicLink} from './public-link-preflight.mjs';

const clean=x=>String(x??'').trim();
const sha256=x=>crypto.createHash('sha256').update(x).digest('hex');
const CAP='distribution/marketing/work-saban-clip-evergreen-20261030.review.json';
const ROOT='https://jgaethle10.github.io/forge-operator/work-saban/report/';
function pacificDate(at){
  const d=Object.fromEntries(new Intl.DateTimeFormat('en-US',
    {timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'})
    .formatToParts(at).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return d.year+'-'+d.month+'-'+d.day;
}
function writeAtomic(file,record){
  const temp=file+'.'+process.pid+'.new';
  fs.writeFileSync(temp,JSON.stringify(record,null,2)+'\n',{mode:0o600});
  fs.renameSync(temp,file);
}
function providerPath(version,id,suffix=''){
  return 'https://graph.facebook.com/'+version+'/'+encodeURIComponent(id)+suffix;
}
async function providerJson(response,kind){
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw Error('work_saban_facebook_'+kind+'_http_'+response.status);
  return body;
}
function loadRows(repoRoot,campaignPath=CAP){
  const root=path.resolve(repoRoot),file=path.resolve(root,campaignPath);
  if(!file.startsWith(root+path.sep))throw Error('work_saban_campaign_outside_repo');
  const q=JSON.parse(fs.readFileSync(file,'utf8'));
  if(q.schema!=='evercraft.marketing.owner-review-queue.v1'||q.campaign_id!==WORK_SABAN_CAMPAIGN||
     q.owner_organic_distribution_approved!==true||q.publication_authority!==false||
     q.platform_connections_verified!==false)
    throw Error('work_saban_campaign_boundary_invalid');
  const rows=q.entries.filter(e=>e.platform==='facebook'&&e.destination==='facebook-page');
  if(rows.length!==4)throw Error('work_saban_four_facebook_slots_required');
  const seen=new Set();
  for(const e of rows){
    validateWorkSabanText(e);
    if(seen.has(e.id)||!/^work-saban-rotation-w[1-4]-facebook$/.test(e.id))throw Error('work_saban_duplicate_or_unexpected_id');
    seen.add(e.id);
    if(!/^20\d\d-\d\d-\d\d$/.test(e.planned_day))throw Error('work_saban_invalid_date');
  }
  return rows.sort((a,b)=>a.planned_day.localeCompare(b.planned_day));
}
export async function runWorkSabanFacebookCycle({
  repoRoot,stateDir,expectedPageId,fire=false,now=new Date(),campaignPath=CAP,
  authorize=async()=>({decision:'deny'}),
  credentialResolver=()=>({safe_status:{facebook:'unavailable'}}),
  fetchImpl=globalThis.fetch,
  linkVerifier=preflightPublicLink
}={}){
  const at=now instanceof Date?now:new Date(now);
  if(!Number.isFinite(at.getTime())||!repoRoot||!stateDir)throw Error('work_saban_clock_repo_or_state_missing');
  const entries=loadRows(repoRoot,campaignPath),day=pacificDate(at),root=path.resolve(stateDir);
  const states=entries.map(e=>{
    const file=path.join(root,'entries',e.id+'.json');
    return {entry:e,file,existing:fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null};
  });
  const started=states.filter(x=>x.existing),done=started.filter(x=>x.existing.status==='provider_receipt_recorded');
  const result={schema:'evercraft.clip.work-saban-facebook-cycle.v1',campaign_id:WORK_SABAN_CAMPAIGN,
    checked_at:at.toISOString(),publisher:'evercraft_clip_native_facebook_page',
    submitted:0,provider_receipts:done.length,prior_attempts:started.length,secret_material_returned:false};
  // A crashed/unknown publisher is never retried, including if its provider post ID is missing.
  if(started.some(x=>x.existing.status!=='provider_receipt_recorded'))
    return {...result,status:'manual_reconciliation_required',post_submitted:false};
  const due=states.filter(x=>x.entry.planned_day<=day&&!x.existing),slot=due[0];
  if(!slot)return {...result,status:'nothing_due',post_submitted:false};
  const last=done.map(x=>Date.parse(x.existing.published_at)).filter(Number.isFinite);
  if(last.some(ms=>at.getTime()-ms<72*3600*1000))
    return {...result,status:'cooldown',post_submitted:false};
  if(!fire)return {...result,status:'preflight_only',next_entry_id:slot.entry.id,post_submitted:false};
  if(!clean(expectedPageId))
    return {...result,status:'blocked_expected_page_id',post_submitted:false};
  const permit=await authorize({scope:'home.clip.publish',resource_ref:'brand:evercraft-work-saban',
    candidate_id:slot.entry.id,campaign_id:WORK_SABAN_CAMPAIGN});
  if(permit?.decision!=='allow'||!clean(permit.grant_id||permit.authorization_ref))
    return {...result,status:'blocked_issuer_grant',post_submitted:false};
  const creds=await credentialResolver();
  if(creds?.safe_status?.facebook!=='resolved'||!clean(creds?.config?.pageId)||!clean(creds?.config?.pageAccessToken))
    return {...result,status:'blocked_facebook_vault',post_submitted:false};
  const {pageId,pageAccessToken}=creds.config;
  if(pageId!==expectedPageId)return {...result,status:'blocked_page_scope_mismatch',post_submitted:false};
  const h={Authorization:'Bearer '+pageAccessToken};
  const identity=await providerJson(await fetchImpl(providerPath('v26.0',pageId,'?fields=id%2Cname'),{headers:h}),'page_identity');
  if(clean(identity.id)!==pageId||!/\bevercraft\b/i.test(clean(identity.name)))
    return {...result,status:'blocked_wrong_company_page',post_submitted:false};
  const preflight=await linkVerifier({url:ROOT,fetchImpl,
    expectedText:['Your numbers.','Finished report.'],expectedCanonicalUrl:ROOT,
    requireCanonicalSelfMatch:true});
  if(preflight?.verified!==true)return {...result,status:'blocked_report_link_preflight',post_submitted:false};
  const caption=slot.entry.caption,firstComment=slot.entry.first_comment_copy;
  const attempt={schema:'evercraft.clip.work-saban-facebook-claim.v1',
    campaign_id:WORK_SABAN_CAMPAIGN,entry_id:slot.entry.id,page_id:pageId,
    content_digest:sha256(caption+'\n'+firstComment),authorization_ref:clean(permit.grant_id||permit.authorization_ref),
    attempted_at:at.toISOString(),status:'claimed_no_safe_retry',provider_post_id:null,provider_post_url:null};
  fs.mkdirSync(path.dirname(slot.file),{recursive:true,mode:0o700});
  try{fs.writeFileSync(slot.file,JSON.stringify(attempt,null,2)+'\n',{flag:'wx',mode:0o600});}
  catch(e){if(e.code==='EEXIST')return {...result,status:'duplicate_claim_hold',post_submitted:false};throw e;}
  const finish=patch=>{const state={...attempt,...patch,updated_at:new Date().toISOString()};
    writeAtomic(slot.file,state);
    return {...result,status:state.status,entry_id:slot.entry.id,
      post_submitted:Boolean(state.provider_post_id),provider_post_id:state.provider_post_id,
      provider_post_url:state.provider_post_url,provider_comment_id:state.provider_comment_id||null};
  };
  try{
    const body=new URLSearchParams({message:caption,published:'true'});
    const created=await providerJson(await fetchImpl(providerPath('v26.0',pageId,'/feed'),{
      method:'POST',headers:{...h,'Content-Type':'application/x-www-form-urlencoded'},body:body.toString()
    }),'post');
    const postId=clean(created.id);
    if(!postId)return finish({status:'post_identity_missing_manual_reconciliation'});
    writeAtomic(slot.file,{...attempt,status:'post_confirmed_comment_pending',provider_post_id:postId});
    const commentBody=new URLSearchParams({message:firstComment});
    const commented=await providerJson(await fetchImpl(providerPath('v26.0',postId,'/comments'),{
      method:'POST',headers:{...h,'Content-Type':'application/x-www-form-urlencoded'},body:commentBody.toString()
    }),'first_comment');
    const commentId=clean(commented.id);
    if(!commentId)return finish({status:'comment_identity_missing_manual_reconciliation',provider_post_id:postId});
    const observed=await providerJson(await fetchImpl(providerPath('v26.0',postId,'?fields=id%2Cpermalink_url'),{headers:h}),'readback');
    const permalink=clean(observed.permalink_url);
    if(clean(observed.id)!==postId||!/^https:\/\/(?:www\.|m\.)?facebook\.com\//i.test(permalink))
      return finish({status:'provider_permalink_missing_manual_reconciliation',provider_post_id:postId,provider_comment_id:commentId});
    return finish({status:'provider_receipt_recorded',provider_post_id:postId,provider_post_url:permalink,
      provider_comment_id:commentId,published_at:new Date().toISOString(),
      verified_company_page_name:identity.name,product_preflight_verified:true,
      public_anonymous_visibility_verified:false});
  }catch(e){
    // Provider may have accepted the request despite timeout. Never replay the same slot.
    const current=JSON.parse(fs.readFileSync(slot.file,'utf8'));
    return finish({status:'manual_reconciliation_required',
      provider_post_id:current.provider_post_id||null,
      error_code:clean(e?.message).slice(0,150)});
  }
}
