// Meta confirmation is separate from POST acceptance. A missing readback is not proof of publication.
const clean=value=>String(value??'').trim();
const FB_HOSTS=new Set(['facebook.com','www.facebook.com','m.facebook.com','web.facebook.com']);
export function validatedFacebookPermalink(raw){
  try{
    const url=new URL(clean(raw));
    if(url.protocol!=='https:' || url.username || url.password || url.port ||
       !FB_HOSTS.has(url.hostname.toLowerCase()) || url.pathname==='/' || !url.pathname) return null;
    return url.href;
  }catch{return null;}
}
export async function readbackFacebookPagePost({
  fetchImpl=globalThis.fetch, graphBase='https://graph.facebook.com',
  graphVersion='v26.0', pageAccessToken, remoteId
}={}){
  const postId=clean(remoteId);
  if(!/^(?:[0-9]{1,30}_)?[0-9]{1,30}$/.test(postId) || !clean(pageAccessToken)){
    return {state:'reconciliation_required',reason:'post_identity_or_token_invalid'};
  }
  const endpoint=clean(graphBase).replace(/\/+$/,'')+'/'+
    encodeURIComponent(clean(graphVersion).replace(/^\/+|\/+$/g,''))+'/'+
    encodeURIComponent(postId)+'?fields=id%2Cpermalink_url';
  try{
    const response=await fetchImpl(endpoint,{
      method:'GET',headers:{Authorization:'Bearer '+pageAccessToken,Accept:'application/json'},
      redirect:'error',signal:AbortSignal.timeout(12000)
    });
    if(!response || response.status<200 || response.status>=300){
      return {state:'reconciliation_required',reason:'post_readback_http_not_ok'};
    }
    const data=await response.json();
    if(clean(data?.id)!==postId) return {state:'reconciliation_required',reason:'post_readback_id_mismatch'};
    const url=validatedFacebookPermalink(data?.permalink_url);
    if(!url)return {state:'reconciliation_required',reason:'post_readback_permalink_invalid'};
    return {state:'confirmed',remoteId:postId,url};
  }catch{
    // No raw response, token or debug payload in public receipts.
    return {state:'reconciliation_required',reason:'post_readback_unavailable'};
  }
}
