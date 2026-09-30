import { createHash } from 'node:crypto';

const DEFAULT_GRAPH_ORIGIN='https://graph.facebook.com';
const DEFAULT_GRAPH_VERSION='v23.0';
const CREATE_TASKS=new Set(['PROFILE_PLUS_CREATE_CONTENT','PROFILE_PLUS_FULL_CONTROL','CREATE_CONTENT']);

function clean(value,max=4000){
  return String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
}
function normalizeMessage(value){
  return String(value??'').replace(/\r\n/g,'\n').replace(/[ \t]+/g,' ').trim();
}
function sha256(value){
  return createHash('sha256').update(String(value??'')).digest('hex');
}
function graphUrl(path,{origin=DEFAULT_GRAPH_ORIGIN,version=DEFAULT_GRAPH_VERSION}={}){
  const base=new URL(origin);
  if(base.protocol!=='https:') throw new Error('facebook_graph_origin_must_use_https');
  if(!/(^|\.)facebook\.com$/i.test(base.hostname)) throw new Error('facebook_graph_origin_not_allowed');
  return new URL('/'+version.replace(/^\/+|\/+$/g,'')+'/'+String(path||'').replace(/^\/+/,''),base).toString();
}
async function jsonFetch(fetchImpl,url,init={}){
  const response=await fetchImpl(url,init);
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const detail=clean(data?.error?.message || data?.message || ('facebook_http_'+response.status),1200);
    const error=new Error(detail);
    error.status=response.status;
    throw error;
  }
  return data;
}

export async function resolveFacebookPage({
  userAccessToken,
  pageId,
  fetchImpl=fetch,
  graphOrigin=DEFAULT_GRAPH_ORIGIN,
  graphVersion=DEFAULT_GRAPH_VERSION
}={}){
  const token=clean(userAccessToken,12000);
  const requestedPage=clean(pageId,120);
  if(!token) throw new Error('facebook_user_access_token_required');
  if(!requestedPage) throw new Error('facebook_page_id_required');

  const url=graphUrl('me/accounts?fields=id,name,access_token,tasks&limit=100',{
    origin:graphOrigin,version:graphVersion
  });
  const data=await jsonFetch(fetchImpl,url,{
    headers:{Authorization:'Bearer '+token,Accept:'application/json'}
  });
  const page=(Array.isArray(data?.data)?data.data:[]).find((row)=>clean(row?.id,120)===requestedPage);
  if(!page?.access_token) throw new Error('facebook_page_access_token_missing');
  const tasks=Array.isArray(page.tasks)?page.tasks.map((x)=>clean(x,100)):[];
  const canCreate=tasks.length===0 || tasks.some((task)=>CREATE_TASKS.has(task));
  if(!canCreate) throw new Error('facebook_create_content_permission_missing');

  return {
    page_id:requestedPage,
    page_name:clean(page.name,300),
    page_access_token:clean(page.access_token,12000),
    tasks,
    create_content_authorized:true,
    identity_verified:true
  };
}

export async function verifyFacebookPost({
  postId,
  pageAccessToken,
  expectedMessage='',
  fetchImpl=fetch,
  graphOrigin=DEFAULT_GRAPH_ORIGIN,
  graphVersion=DEFAULT_GRAPH_VERSION
}={}){
  const id=clean(postId,300);
  const token=clean(pageAccessToken,12000);
  if(!id||!token) throw new Error('facebook_post_readback_identity_required');
  const url=graphUrl(encodeURIComponent(id)+'?fields=id,message,permalink_url,created_time&access_token='+encodeURIComponent(token),{
    origin:graphOrigin,version:graphVersion
  });
  const data=await jsonFetch(fetchImpl,url,{headers:{Accept:'application/json'}});
  const observed=normalizeMessage(data?.message);
  const expected=normalizeMessage(expectedMessage);
  const exact=expected ? observed===expected : true;
  return {
    verified:Boolean(data?.id) && exact,
    post_id:clean(data?.id,300),
    permalink:clean(data?.permalink_url,1800)||null,
    created_time:clean(data?.created_time,120)||null,
    expected_message_hash:expected?sha256(expected):null,
    observed_message_hash:observed?sha256(observed):null,
    exact_message_match:exact
  };
}

export async function publishFacebookFeedPost({
  userAccessToken,
  pageId,
  message,
  link='',
  fetchImpl=fetch,
  graphOrigin=DEFAULT_GRAPH_ORIGIN,
  graphVersion=DEFAULT_GRAPH_VERSION
}={}){
  const text=normalizeMessage(message);
  if(!text) throw new Error('facebook_message_required');
  const page=await resolveFacebookPage({
    userAccessToken,pageId,fetchImpl,graphOrigin,graphVersion
  });

  const body=new URLSearchParams({
    message:text,
    access_token:page.page_access_token
  });
  const cleanLink=clean(link,1800);
  if(cleanLink){
    const url=new URL(cleanLink);
    if(!['http:','https:'].includes(url.protocol)) throw new Error('facebook_link_protocol_invalid');
    body.set('link',url.toString());
  }

  const publishUrl=graphUrl(encodeURIComponent(page.page_id)+'/feed',{
    origin:graphOrigin,version:graphVersion
  });
  const published=await jsonFetch(fetchImpl,publishUrl,{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},
    body
  });
  const postId=clean(published?.id,300);
  if(!postId) throw new Error('facebook_publish_missing_post_id');

  const verification=await verifyFacebookPost({
    postId,
    pageAccessToken:page.page_access_token,
    expectedMessage:text,
    fetchImpl,
    graphOrigin,
    graphVersion
  });

  return {
    ok:verification.verified,
    published:true,
    verified:verification.verified,
    provider:'facebook',
    provider_api_version:graphVersion,
    page:{id:page.page_id,name:page.page_name},
    post_id:postId,
    permalink:verification.permalink,
    published_message_hash:sha256(text),
    readback:verification,
    authority:{
      page_identity_verified:true,
      create_content_authorized:true,
      base44_connector_used:false
    }
  };
}

export function facebookProviderReadiness(env=process.env){
  return {
    provider:'facebook',
    graph_version:clean(env.META_GRAPH_VERSION||DEFAULT_GRAPH_VERSION,40),
    user_access_token_configured:Boolean(clean(env.META_USER_ACCESS_TOKEN,12000)),
    eps_page_id_configured:Boolean(clean(env.META_EPS_PAGE_ID,120)),
    publish_enabled:String(env.EVERCRAFT_FACEBOOK_PUBLISH_ENABLED||'').toLowerCase()==='true',
    base44_connector_required:false,
    ready_for_identity_canary:Boolean(
      clean(env.META_USER_ACCESS_TOKEN,12000) &&
      clean(env.META_EPS_PAGE_ID,120)
    ),
    ready_for_publish_canary:Boolean(
      clean(env.META_USER_ACCESS_TOKEN,12000) &&
      clean(env.META_EPS_PAGE_ID,120) &&
      String(env.EVERCRAFT_FACEBOOK_PUBLISH_ENABLED||'').toLowerCase()==='true'
    )
  };
}
