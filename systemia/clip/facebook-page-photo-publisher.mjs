import { assertEvercraftFamilySocialSafe } from './family-social-safety.mjs';
function clean(value){ return String(value??'').trim(); }

async function payload(response){
  const text=await response.text();
  if(!text) return {};
  try{return JSON.parse(text);}catch{return {raw:text};}
}

function pagePostUrl(pageId,remoteId){
  const parts=String(remoteId).split('_');
  const postId=parts.length>1?parts.slice(1).join('_'):remoteId;
  return 'https://www.facebook.com/'+encodeURIComponent(pageId)+'/posts/'+encodeURIComponent(postId);
}

export function createFacebookPagePhotoPublisherAdapter(config={}){
  const fetchImpl=config.fetchImpl??globalThis.fetch;
  if(typeof fetchImpl!=='function') throw new Error('facebook_photo_fetch_unavailable');
  const graphVersion=clean(config.graphVersion||'v26.0').replace(/^\/+|\/+$/g,'');
  const graphBase=clean(config.graphBase||'https://graph.facebook.com').replace(/\/+$/,'');
  const pageId=clean(config.pageId);
  const pageAccessToken=clean(config.pageAccessToken);

  return {
    id:'facebook-pages-photo-graph-api-'+graphVersion,
    destination:'facebook-page-photo',
    verified:config.verified===true,
    requiredPermissions:['pages_show_list','pages_read_engagement','pages_manage_posts'],
    async publish({imageBytes,mimeType='image/jpeg',caption='',contentDigest=''}) {
      if(config.allowPublish!==true) throw new Error('facebook_photo_publish_not_authorized');
      if(!pageId) throw new Error('facebook_photo_page_id_missing');
      if(!pageAccessToken) throw new Error('facebook_photo_page_access_token_missing');
      assertEvercraftFamilySocialSafe({message:caption});
      if(!(imageBytes instanceof Uint8Array)||imageBytes.byteLength<32) throw new Error('facebook_photo_bytes_invalid');
      if(!/^image\/(?:jpeg|png|webp)$/i.test(clean(mimeType))) throw new Error('facebook_photo_mime_invalid');

      const form=new FormData();
      form.set('source',new Blob([imageBytes],{type:mimeType}),'space-dudz-social.'+(mimeType.includes('png')?'png':'jpg'));
      if(clean(caption)) form.set('caption',clean(caption));
      form.set('published','true');

      const response=await fetchImpl(
        graphBase+'/'+graphVersion+'/'+encodeURIComponent(pageId)+'/photos',
        {method:'POST',headers:{Authorization:'Bearer '+pageAccessToken},body:form},
      );
      const body=await payload(response);
      if(response.status<200||response.status>=300){
        throw new Error('facebook_photo_publish_failed:'+response.status+':'+JSON.stringify(body).slice(0,500));
      }

      const remoteId=clean(body.post_id||body.id);
      if(!remoteId) throw new Error('facebook_photo_remote_id_missing');
      let url=pagePostUrl(pageId,remoteId);
      try{
        const verify=await fetchImpl(
          graphBase+'/'+graphVersion+'/'+encodeURIComponent(remoteId)+'?fields=permalink_url',
          {method:'GET',headers:{Authorization:'Bearer '+pageAccessToken}},
        );
        if(verify.status>=200&&verify.status<300){
          const verifiedBody=await payload(verify);
          if(clean(verifiedBody.permalink_url)) url=clean(verifiedBody.permalink_url);
        }
      }catch{}

      return {
        state:'published',
        remoteId,
        providerRequestId:remoteId,
        url,
        contentDigest:clean(contentDigest)||null,
        sourceRefs:[
          'provider-doc:https://developers.facebook.com/docs/graph-api/reference/page/photos',
          'provider:facebook-graph-api-'+graphVersion,
          'permission:pages_show_list',
          'permission:pages_read_engagement',
          'permission:pages_manage_posts',
        ],
      };
    },
  };
}
