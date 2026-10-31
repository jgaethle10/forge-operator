import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { resolveFacebookPageCredential } from './facebook-page-credential-resolver.mjs';
import { preflightPublicLink } from './public-link-preflight.mjs';
import { assertEvercraftFamilySocialSafe } from './family-social-safety.mjs';

const QUEUE_SCHEMA='evercraft.marketing.owner-review-queue.v1';
const CAMPAIGN_ID='humanfilter-desktop-beta-rotation-20261030';
const ROOT_URL='https://jgaethle10.github.io/forge-operator/humanfilter-beta/';
const IMAGE='public/humanfilter-beta/assets/popup.png';
const clean=v=>String(v??'').trim();
const sha256=v=>crypto.createHash('sha256').update(v).digest('hex');
const laDate=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const jsonWrite=(file,value)=>{
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const t=file+'.'+process.pid+'.new';
  fs.writeFileSync(t,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(t,file);
};

function loadCampaign(repoRoot,relativePath){
  const root=path.resolve(repoRoot),file=path.resolve(root,relativePath);
  if(!file.startsWith(root+path.sep))throw new Error('clip_campaign_path_outside_repo');
  const queue=JSON.parse(fs.readFileSync(file,'utf8'));
  if(queue.schema!==QUEUE_SCHEMA||queue.campaign_id!==CAMPAIGN_ID||queue.product!=='humanfilter'||queue.engine!=='evercraft_clip')throw new Error('clip_wrong_campaign');
  if(queue.owner_organic_distribution_approved!==true||queue.publication_authority!==false)throw new Error('clip_campaign_authority_boundary_invalid');
  const rows=queue.entries.filter(e=>e.platform==='facebook'&&e.destination==='facebook-page');
  if(!rows.length)throw new Error('clip_facebook_entries_missing');
  const ids=new Set();
  for(const e of rows){
    if(!/^humanfilter-[a-z0-9-]+-facebook$/.test(e.id)||ids.has(e.id))throw new Error('clip_entry_id_invalid');
    ids.add(e.id);
    if(e.brand_key!=='evercraft'||e.account_scope!=='verified_evercraft_company_channel_only'||e.link_mode!=='first_comment')throw new Error('clip_unapproved_brand_or_link_mode');
    if(e.first_comment_required!==true||!clean(e.first_comment_copy).startsWith(ROOT_URL+'?'))throw new Error('clip_first_comment_required');
    if(!clean(e.caption)||clean(e.caption).length>4000||e.distribution?.paid_spend_usd!==0||e.distribution?.max_identical_reuse!==0)throw new Error('clip_unsafe_caption_or_distribution');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(clean(e.planned_day)))throw new Error('clip_missing_plan_day');
    assertEvercraftFamilySocialSafe({message:e.caption,link:e.first_comment_copy});
  }
  return rows.sort((a,b)=>a.planned_day.localeCompare(b.planned_day)||a.id.localeCompare(b.id));
}
async function providerJson(response,action){
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error('clip_facebook_'+action+'_failed_http_'+response.status+':'+clean(body.error?.message).slice(0,180));
  return body;
}
function graphUrl(base,version,id,fields){
  return base+'/'+version+'/'+encodeURIComponent(id)+(fields?'?fields='+encodeURIComponent(fields):'');
}
async function verifyPage({fetchImpl,pageId,pageAccessToken,graphBase,graphVersion}){
  const r=await fetchImpl(graphUrl(graphBase,graphVersion,pageId,'id,name'),{headers:{Authorization:'Bearer '+pageAccessToken}});
  const d=await providerJson(r,'page_identity');
  if(clean(d.id)!==pageId||!/\bevercraft\b/i.test(clean(d.name)))throw new Error('clip_destination_not_verified_evercraft_page');
  return {page_id:d.id,page_name:d.name};
}
/** Returns provider confirmation only. Public anonymous visibility is a separate check. */
export async function runHumanFilterFacebookCycle({
  repoRoot,campaignPath='distribution/marketing/humanfilter-free-desktop-20261030.review.json',
  stateDir,expectedPageId,authorize=async()=>({decision:'deny',reason:'passport_not_connected'}),
  credentialResolver=()=>resolveFacebookPageCredential(),
  fetchImpl=globalThis.fetch,now=new Date(),fire=false,
  graphBase='https://graph.facebook.com',graphVersion='v26.0',
  maxPerCycle=1,
}={}){
  const timestamp=now instanceof Date?now:new Date(now);
  if(!Number.isFinite(timestamp.getTime()))throw new Error('clip_invalid_clock');
  const rows=loadCampaign(repoRoot,campaignPath),today=laDate(timestamp);
  if(!stateDir)throw new Error('clip_durable_state_dir_missing');
  const root=path.resolve(stateDir);
  const states=rows.map(e=>{
    const file=path.join(root,'entries',e.id+'.json');
    return {entry:e,file,existing:fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null};
  });
  const existingPublished=states.filter(x=>x.existing?.provider_post_id);
  const ready=states.filter(x=>x.entry.planned_day<=today&&!x.existing);
  const sample=ready[0];
  const resultBase={schema:'evercraft.clip.humanfilter-facebook-cycle.v1',campaign_id:CAMPAIGN_ID,
    evaluated_at:timestamp.toISOString(),publisher:'evercraft_clip_native_facebook_page',
    page_id:null,already_attempted:states.filter(x=>x.existing).length,
    provider_receipts:existingPublished.length,eligible_remaining:ready.length};
  if(!sample)return {...resultBase,status:'nothing_due_or_reconciliation_hold',post_submitted:false};
  const prior=existingPublished.map(x=>Date.parse(x.existing.published_at)).filter(Number.isFinite);
  if(prior.some(x=>timestamp.getTime()-x<72*60*60*1000))return {...resultBase,status:'cooldown',post_submitted:false};
  if(!fire)return {...resultBase,status:'preflight_only',next_entry_id:sample.entry.id,post_submitted:false};
  if(maxPerCycle!==1)throw new Error('clip_max_one_per_cycle');
  if(!clean(expectedPageId))return {...resultBase,status:'blocked_expected_evercraft_page_id_missing',post_submitted:false};
  const permit=await authorize({scope:'home.clip.publish',resource_ref:'brand:evercraft',candidate_id:sample.entry.id,campaign_id:CAMPAIGN_ID});
  if(permit?.decision!=='allow'||!clean(permit.grant_id||permit.authorization_ref))return {...resultBase,status:'blocked_passport_authority',reason:clean(permit?.reason)||'issuer_grant_not_found',post_submitted:false};
  const creds=credentialResolver();
  if(creds?.safe_status?.facebook!=='resolved')return {...resultBase,status:'blocked_facebook_credentials',reason:creds?.safe_status?.facebook||'missing',post_submitted:false};
  const {pageId,pageAccessToken}=creds.config||{};
  if(!pageId||pageId!==expectedPageId||!pageAccessToken)return {...resultBase,status:'blocked_page_id_scope_mismatch',post_submitted:false};
  const identity=await verifyPage({fetchImpl,pageId,pageAccessToken,graphBase,graphVersion});
  const localImage=path.resolve(repoRoot,IMAGE),base=path.resolve(repoRoot);
  if(!localImage.startsWith(base+path.sep)||!fs.existsSync(localImage))throw new Error('clip_missing_original_product_screenshot');
  const image=fs.readFileSync(localImage);
  if(image.length<500||!image.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))throw new Error('clip_image_not_png');
  const check=await preflightPublicLink({
    url:ROOT_URL,fetchImpl,expectedText:['Your feed.','Your call.'],
  });
  if(check?.verified!==true)throw new Error('clip_product_url_not_verified');
  const entry=sample.entry,contentDigest=sha256(entry.caption+'\n'+entry.first_comment_copy+'\n'+sha256(image));
  const attempt={schema:'evercraft.clip.humanfilter-facebook-attempt.v1',entry_id:entry.id,
    campaign_id:CAMPAIGN_ID,page_id:pageId,content_sha256:contentDigest,media_sha256:sha256(image),
    authorization_ref:clean(permit.grant_id||permit.authorization_ref),
    status:'attempt_claimed_manual_reconciliation_on_interruption',
    attempted_at:timestamp.toISOString(),provider_post_id:null,provider_post_url:null};
  fs.mkdirSync(path.dirname(sample.file),{recursive:true,mode:0o700});
  let claim;
  try{claim=fs.openSync(sample.file,'wx',0o600);fs.writeFileSync(claim,JSON.stringify(attempt,null,2)+'\n');fs.closeSync(claim);}
  catch(e){if(claim!==undefined)try{fs.closeSync(claim);}catch{}if(e.code==='EEXIST')return {...resultBase,status:'duplicate_or_reconciliation_hold',post_submitted:false};throw e;}
  function finish(patch){const state={...attempt,...patch,updated_at:new Date().toISOString()};jsonWrite(sample.file,state);return {...resultBase,status:state.status,entry_id:entry.id,page_id:pageId,post_submitted:!!state.provider_post_id,provider_post_id:state.provider_post_id,provider_post_url:state.provider_post_url,provider_comment_id:state.provider_comment_id||null};}
  try{
    const form=new FormData();
    form.set('source',new Blob([image],{type:'image/png'}),'humanfilter-real-popup.png');
    form.set('caption',entry.caption);
    form.set('published','true');
    const response=await fetchImpl(graphUrl(graphBase,graphVersion,pageId+'/photos'),{method:'POST',headers:{Authorization:'Bearer '+pageAccessToken},body:form});
    const created=await providerJson(response,'photo_publish');
    // A photo ID is not necessarily the post ID. Do not write comments to an inferred target.
    const postId=clean(created.post_id);
    if(!postId) return finish({status:'post_identity_missing_manual_reconciliation',provider_photo_id:clean(created.id)||null});
    // Persist provider ID before attempting comment: a comment failure MUST NOT republish the image.
    jsonWrite(sample.file,{...attempt,status:'post_confirmed_comment_pending',provider_post_id:postId,provider_photo_id:clean(created.id)||null});
    const commentBody=new URLSearchParams({message:entry.first_comment_copy});
    const commentResponse=await fetchImpl(graphUrl(graphBase,graphVersion,postId+'/comments'),{
      method:'POST',headers:{Authorization:'Bearer '+pageAccessToken,'Content-Type':'application/x-www-form-urlencoded'},body:commentBody.toString()
    });
    const commented=await providerJson(commentResponse,'first_comment');
    const commentId=clean(commented.id);
    if(!commentId)return finish({status:'comment_identity_missing_manual_reconciliation',provider_post_id:postId});
    const readback=await fetchImpl(graphUrl(graphBase,graphVersion,postId,'id,permalink_url'),{headers:{Authorization:'Bearer '+pageAccessToken}});
    const post=await providerJson(readback,'post_readback');
    if(clean(post.id)!==postId||!/^https:\/\/(?:www\.|m\.)?facebook\.com\//i.test(clean(post.permalink_url))){
      return finish({status:'provider_post_readback_failed_manual_reconciliation',provider_post_id:postId,provider_comment_id:commentId});
    }
    return finish({status:'provider_receipt_recorded',provider_post_id:postId,provider_post_url:post.permalink_url,
      provider_comment_id:commentId,published_at:new Date().toISOString(),
      destination_verified:identity,page_identity_verified:true,product_link_preflight:true,
      public_anonymous_visibility_verified:false});
  }catch(e){return finish({status:'manual_reconciliation_required',error:e instanceof Error?e.message:String(e),
    provider_post_id:fs.existsSync(sample.file)?JSON.parse(fs.readFileSync(sample.file,'utf8')).provider_post_id||null:null});}
}
