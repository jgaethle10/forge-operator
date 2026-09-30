import { createHash, randomUUID } from 'node:crypto';
import { publishFacebookFeedPost } from './facebook-provider.mjs';

const THREE_HOURS=3*60*60*1000;
const MAX_DAILY_POSTS=3;

function clean(value,max=8000){ return String(value??'').trim().slice(0,max); }
function normalize(value){ return clean(value,16000).replace(/\s+/g,' ').trim().toLowerCase(); }
function laDate(value){
  const date=value instanceof Date?value:new Date(value);
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
function composeMessage(pkg){
  const hook=clean(pkg?.hook,4000);
  const body=clean(pkg?.body,12000);
  return hook&&body&&normalize(body).startsWith(normalize(hook)) ? body : [hook,body].filter(Boolean).join('\n\n');
}
function contentPreflight(pkg,pageId){
  const violations=[];
  if(!pkg) violations.push('content_package_missing');
  if(pkg&&pkg.status!=='approved') violations.push('content_package_not_approved');
  if(pkg&&!clean(pkg.body)) violations.push('content_body_empty');
  if(pkg&&clean(pkg.target_page_id)!==clean(pageId)) violations.push('target_page_mismatch');
  const combined=[pkg?.hook,pkg?.body,pkg?.link_url].filter(Boolean).join(' ');
  if(/https?:\/\/[^\s]*base44\.app/i.test(combined)) violations.push('legacy_base44_url_not_publishable');
  return {ok:violations.length===0,violations};
}

export async function runEpsFacebookContinuity({
  store,
  now=new Date(),
  pageId=process.env.META_EPS_PAGE_ID||'',
  userAccessToken=process.env.META_USER_ACCESS_TOKEN||'',
  publishEnabled=String(process.env.EVERCRAFT_FACEBOOK_PUBLISH_ENABLED||'').toLowerCase()==='true',
  fetchImpl=fetch
}={}){
  if(!store) throw new Error('social_store_required');
  const page=clean(pageId,180);
  if(!page) return {ok:false,held:true,reason:'eps_page_id_not_configured'};
  await store.heartbeat('eps_facebook_primary',{last_started_at:now.toISOString(),last_status:'running'});

  const published=store.listPublishedForPage(page)
    .filter((row)=>row.published_at)
    .sort((a,b)=>Date.parse(b.published_at)-Date.parse(a.published_at));
  const today=laDate(now);
  const publishedToday=published.filter((row)=>laDate(row.published_at)===today).length;
  if(publishedToday>=MAX_DAILY_POSTS){
    const result={ok:true,no_op:true,reason:'eps_local_day_target_reached',published_today:publishedToday,target_posts_per_day:MAX_DAILY_POSTS};
    await store.heartbeat('eps_facebook_primary',{last_completed_at:new Date().toISOString(),last_status:'no_op',published_count:0,failed_count:0,notes:result.reason});
    return result;
  }

  const lastAt=published[0]?.published_at?Date.parse(published[0].published_at):0;
  if(lastAt&&Number.isFinite(lastAt)&&now.getTime()-lastAt<THREE_HOURS){
    const result={ok:true,no_op:true,reason:'eps_180_minute_cooldown',next_eligible_at:new Date(lastAt+THREE_HOURS).toISOString()};
    await store.heartbeat('eps_facebook_primary',{last_completed_at:new Date().toISOString(),last_status:'no_op',published_count:0,failed_count:0,notes:result.reason});
    return result;
  }

  const due=store.listDue({platform:'facebook',pageId:page,now});
  if(!due.length){
    const result={ok:true,no_op:true,reason:'no_eligible_scheduled_eps_content'};
    await store.heartbeat('eps_facebook_primary',{last_completed_at:new Date().toISOString(),last_status:'no_op',published_count:0,failed_count:0,notes:result.reason});
    return result;
  }

  const selected=due[0];
  const preflight=contentPreflight(selected.package,page);
  const preflightId='eps-preflight-'+randomUUID();
  if(!preflight.ok){
    await store.markFailed({packageId:selected.package.id,queueId:selected.queue.id,error:'preflight:'+preflight.violations.join(',')});
    await store.heartbeat('eps_facebook_primary',{last_completed_at:new Date().toISOString(),last_status:'failed',published_count:0,failed_count:1,notes:preflight.violations.join(',')});
    return {ok:false,reason:'eps_owned_preflight_blocked',violations:preflight.violations,preflight_receipt_id:preflightId};
  }

  if(!publishEnabled){
    return {
      ok:false,
      held:true,
      reason:'facebook_publish_not_explicitly_enabled',
      package_id:selected.package.id,
      preflight_receipt_id:preflightId,
      external_action_taken:false
    };
  }
  if(!clean(userAccessToken,12000)){
    return {ok:false,held:true,reason:'facebook_provider_credentials_not_configured',package_id:selected.package.id,external_action_taken:false};
  }

  await store.markPublishing(selected.package.id,selected.queue.id);
  const message=composeMessage(selected.package);
  try{
    const provider=await publishFacebookFeedPost({
      userAccessToken,pageId:page,message,link:selected.package.link_url||'',fetchImpl
    });
    const publishedAt=new Date().toISOString();
    await store.markPublished({
      packageId:selected.package.id,
      queueId:selected.queue.id,
      postId:provider.post_id,
      permalink:provider.permalink,
      publishedAt
    });
    const verification=await store.addVerification({
      verification_id:'facebook-'+randomUUID(),
      package_id:selected.package.id,
      platform:'facebook',
      post_id:provider.post_id,
      target_page_id:page,
      checked_at:publishedAt,
      status:provider.verified?'verified':'mismatch',
      permalink:provider.permalink,
      message_match:provider.readback?.exact_message_match===true,
      observed_message_hash:provider.readback?.observed_message_hash,
      expected_message_hash:provider.readback?.expected_message_hash,
      failure_reason:provider.verified?'':'provider_readback_mismatch'
    });
    await store.upsertPageHealth(page,{
      page_name:provider.page?.name||selected.package.target_page_name||'Evercraft Property Services',
      status:provider.verified?'healthy':'degraded',
      last_success_at:publishedAt,
      last_error_at:provider.verified?null:publishedAt,
      last_error:provider.verified?'':'provider_readback_mismatch',
      blocked_reason:provider.verified?'':'post_publish_verification_failed'
    });
    await store.heartbeat('eps_facebook_primary',{
      last_completed_at:publishedAt,last_status:provider.verified?'completed':'degraded',
      published_count:1,failed_count:provider.verified?0:1,last_verifier_status:verification.status
    });
    return {
      ok:provider.verified,
      published:true,
      verified:provider.verified,
      package_id:selected.package.id,
      post_id:provider.post_id,
      permalink:provider.permalink,
      verification_id:verification.verification_id,
      verification_status:verification.status,
      preflight_receipt_id:preflightId,
      page_id:page,
      provider:'facebook',
      base44_runtime_used:false
    };
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    await store.markFailed({packageId:selected.package.id,queueId:selected.queue.id,error:message});
    await store.upsertPageHealth(page,{status:'degraded',last_error_at:new Date().toISOString(),last_error:message,blocked_reason:'provider_publish_failed'});
    await store.heartbeat('eps_facebook_primary',{last_completed_at:new Date().toISOString(),last_status:'failed',published_count:0,failed_count:1,notes:message});
    return {ok:false,published:false,verified:false,package_id:selected.package.id,reason:message,base44_runtime_used:false};
  }
}
