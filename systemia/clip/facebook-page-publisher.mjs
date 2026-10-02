import { assertPublicLinkShape } from './public-link-preflight.mjs';

const DOCS=[
  'https://developers.facebook.com/docs/graph-api/reference/post',
  'https://developers.facebook.com/docs/pages-api/posts',
];

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

export function createFacebookPagePublisherAdapter(config){
  const fetchImpl=config.fetchImpl??globalThis.fetch;
  if(!fetchImpl) throw new Error('facebook_fetch_unavailable');

  const graphVersion=String(config.graphVersion??'v26.0').replace(/^\/+|\/+$/g,'');
  const graphBase=(config.graphBase??'https://graph.facebook.com').replace(/\/+$/,'');
  const pageId=String(config.pageId??'').trim();
  const pageAccessToken=String(config.pageAccessToken??'').trim();

  return {
    id:'facebook-pages-graph-api-'+graphVersion,
    destination:'facebook-page',
    verified:config.verified===true,
    requiredPermissions:['pages_show_list','pages_read_engagement','pages_manage_posts'],
    async publish(input){
      if(config.allowPublish!==true) throw new Error('facebook_publish_not_authorized');
      if(!pageId) throw new Error('facebook_page_id_missing');
      if(!pageAccessToken) throw new Error('facebook_page_access_token_missing');

      const message=String(input.metadata?.message??'').trim();
      const link=String(input.metadata?.link??'').trim();
      if(!message&&!link) throw new Error('facebook_post_content_missing');
      if(link) assertPublicLinkShape(link);

      const body=new URLSearchParams();
      if(message) body.set('message',message);
      if(link) body.set('link',link);
      body.set('published','true');

      const response=await fetchImpl(
        graphBase+'/'+graphVersion+'/'+encodeURIComponent(pageId)+'/feed',
        {
          method:'POST',
          headers:{
            Authorization:'Bearer '+pageAccessToken,
            'Content-Type':'application/x-www-form-urlencoded',
          },
          body:body.toString(),
        },
      );

      const result=await payload(response);
      if(response.status<200||response.status>=300){
        throw new Error('facebook_publish_failed:'+response.status+':'+JSON.stringify(result).slice(0,500));
      }

      const remoteId=String(result?.id??'').trim();
      if(!remoteId) throw new Error('facebook_post_id_missing');

      let url=pagePostUrl(pageId,remoteId);
      try{
        const verify=await fetchImpl(
          graphBase+'/'+graphVersion+'/'+encodeURIComponent(remoteId)+'?fields=permalink_url',
          {
            method:'GET',
            headers:{Authorization:'Bearer '+pageAccessToken},
          },
        );
        if(verify.status>=200&&verify.status<300){
          const verifiedPayload=await payload(verify);
          if(verifiedPayload?.permalink_url) url=String(verifiedPayload.permalink_url);
        }
      }catch{
        // The provider already confirmed creation with an ID.
        // Keep the deterministic Page post URL rather than downgrading a successful publish.
      }

      return {
        state:'published',
        remoteId,
        providerRequestId:remoteId,
        url,
        sourceRefs:[
          ...DOCS.map(doc=>'provider-doc:'+doc),
          'provider:facebook-graph-api-'+graphVersion,
          'permission:pages_show_list',
          'permission:pages_read_engagement',
          'permission:pages_manage_posts',
          'guard:public-link-shape-v1',
        ],
      };
    },
  };
}
