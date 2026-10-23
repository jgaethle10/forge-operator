import {assertEvercraftFamilySocialSafe} from './family-social-safety.mjs';

const BLOCKED_PAGE_IDS=new Set(['924929507380565','990957940766644','116675248108887']);
const SHA256=/^[a-f0-9]{64}$/i;
const clean=value=>String(value??'').trim();

function fail(message){ throw new Error('clip_native_video_'+message); }
function graphPath(base,version,id,edge=''){
  return clean(base).replace(/\/+$/,'')+'/'+clean(version).replace(/^\/+|\/+$/g,'')+'/'+encodeURIComponent(id)+(edge?'/'+edge:'');
}
async function readResponse(response){
  const raw=await response.text();
  let body={};try{body=raw?JSON.parse(raw):{};}catch{body={};}
  if(!response.ok) fail('provider_http_'+response.status+(body?.error?.code?'_code_'+body.error.code:''));
  return body;
}
async function requestGraph(fetchImpl,url,token,params){
  const body=params?new URLSearchParams(params):undefined;
  return readResponse(await fetchImpl(url,{method:body?'POST':'GET',
    headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})},
    ...(body?{body:body.toString()}:{})}));
}
function basePreflight(config,input,id){
  if(config.verified!==true||config.allowPublish!==true) fail('adapter_not_authorized');
  if(input?.approved!==true||!clean(input.authorizationRef)) fail('owner_approval_missing');
  if(input?.rightsApproved!==true||!clean(input.rightsReceiptRef)) fail('rights_receipt_missing');
  if(!clean(id)||!clean(config.accessToken)) fail('account_or_token_missing');
  if(BLOCKED_PAGE_IDS.has(clean(id))) fail('brand_excluded');
  if(!Array.isArray(config.allowedAccountIds)||!config.allowedAccountIds.map(clean).includes(clean(id))) fail('account_not_allowlisted');
  if(!SHA256.test(clean(input.mediaSha256))) fail('source_digest_missing');
  if(typeof config.assertNotDuplicate!=='function') fail('duplicate_guard_missing');
  const url=new URL(clean(input.mediaUrl));
  if(url.protocol!=='https:') fail('media_url_not_https');
  const hosts=config.allowedMediaHosts??['media.base44.com'];
  if(!hosts.includes(url.hostname)) fail('media_host_not_allowlisted');
  if(!/\.mp4(?:$|[?#])/i.test(url.pathname+url.search)) fail('media_not_mp4');
  const caption=clean(input.caption);
  if(!caption) fail('caption_missing');
  assertEvercraftFamilySocialSafe({message:caption});
  return {url:url.toString(),caption};
}
async function checkDuplicate(config,accountId,input){
  const decision=await config.assertNotDuplicate({accountId,mediaSha256:input.mediaSha256,campaignKey:clean(input.campaignKey)});
  if(decision!==true) fail('duplicate_or_check_unresolved');
}
function responseBase(accountId,input,extra={}){
  return {accountId,sourceMediaSha256:input.mediaSha256,authorizationRef:input.authorizationRef,
    rightsReceiptRef:input.rightsReceiptRef,sourceRefs:['owned:evercraft-clip','source-sha256:'+input.mediaSha256],...extra};
}

/** First-party Facebook Page video publishing. Provider permalink must be read back before state=published. */
export function createFacebookPageVideoPublisherAdapter(config={}){
  const fetchImpl=config.fetchImpl??globalThis.fetch;
  const pageId=clean(config.pageId),token=clean(config.accessToken);
  const version=config.graphVersion??'v26.0';
  return {destination:'facebook-page-video',verified:config.verified===true,
    async publish(input){
      const data=basePreflight(config,input,pageId);
      if(/https?:\/\//i.test(data.caption)) fail('facebook_caption_links_prohibited');
      await checkDuplicate(config,pageId,input);
      const fileUrl=graphPath(config.videoGraphBase??'https://graph-video.facebook.com',version,pageId,'videos');
      const body=await requestGraph(fetchImpl,fileUrl,token,{
        file_url:data.url,title:clean(input.title)||'Evercraft Relay | First Commercial',
        description:data.caption,published:'true',
      });
      const videoId=clean(body.id);
      if(!videoId) fail('facebook_video_id_missing');
      // A video ID alone can mean still processing, not a publicly viewable post.
      const detail=await requestGraph(fetchImpl,graphPath(config.graphBase??'https://graph.facebook.com',version,videoId)+'?fields=permalink_url,status',token);
      const permalink=clean(detail.permalink_url);
      return responseBase(pageId,input,{
        state:permalink?'published':'pending_verification',remoteId:videoId,
        url:permalink||null,providerStatus:detail.status??null,
        sourceRefs:['provider:facebook-graph-video',...(permalink?['provider:permalink-readback']:[])],
      });
    },
  };
}

/** First-party Instagram Business Reel publishing. A pending container is resumable; do not recreate it. */
export function createInstagramReelPublisherAdapter(config={}){
  const fetchImpl=config.fetchImpl??globalThis.fetch;
  const igId=clean(config.igUserId),token=clean(config.accessToken);
  const version=config.graphVersion??'v26.0';
  const base=config.graphBase??'https://graph.instagram.com';
  return {destination:'instagram-reel',verified:config.verified===true,
    async publish(input){
      const data=basePreflight(config,input,igId);
      await checkDuplicate(config,igId,input);
      let containerId=clean(input.resumeContainerId);
      if(!containerId){
        const created=await requestGraph(fetchImpl,graphPath(base,version,igId,'media'),token,{
          media_type:'REELS',video_url:data.url,caption:data.caption,share_to_feed:'true',
        });
        containerId=clean(created.id);
      }
      if(!containerId) fail('instagram_container_id_missing');
      const status=await requestGraph(fetchImpl,graphPath(base,version,containerId)+'?fields=status_code',token);
      if(clean(status.status_code)!=='FINISHED'){
        return responseBase(igId,input,{
          state:'pending_processing',containerId,providerStatus:status.status_code??'UNKNOWN',remoteId:null,url:null,
          sourceRefs:['provider:instagram-container'],
        });
      }
      const posted=await requestGraph(fetchImpl,graphPath(base,version,igId,'media_publish'),token,{creation_id:containerId});
      const mediaId=clean(posted.id);
      if(!mediaId) fail('instagram_media_id_missing');
      const verification=await requestGraph(fetchImpl,graphPath(base,version,mediaId)+'?fields=permalink',token);
      const permalink=clean(verification.permalink);
      return responseBase(igId,input,{
        state:permalink?'published':'pending_verification',containerId,remoteId:mediaId,url:permalink||null,
        sourceRefs:['provider:instagram-reels',...(permalink?['provider:permalink-readback']:[])],
      });
    },
  };
}
