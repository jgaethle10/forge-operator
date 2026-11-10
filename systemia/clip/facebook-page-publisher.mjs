import { assertEvercraftFamilySocialSafe } from './family-social-safety.mjs';
import { assertPublicLinkShape } from './public-link-preflight.mjs';
import { readbackFacebookPagePost } from './facebook-post-readback.mjs';

const DOCS=[
  'https://developers.facebook.com/docs/graph-api/reference/post',
  'https://developers.facebook.com/docs/pages-api/posts',
];

async function payload(response){
  const text=await response.text();
  if(!text) return {};
  try{return JSON.parse(text);}catch{return {raw:text};}
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
      assertEvercraftFamilySocialSafe({message,link});
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

      const readback=await readbackFacebookPagePost({
        fetchImpl,graphBase,graphVersion,pageAccessToken,remoteId
      });
      // The POST may have created a Page post. Never claim publication or blindly retry
      // until an authenticated GET confirms the remote identity and permalink.
      if(readback.state!=='confirmed') return {
        state:'reconciliation_required', remoteId, providerRequestId:remoteId,
        providerMayHavePublished:true, reason:readback.reason,
        sourceRefs:['provider:facebook-graph-api-'+graphVersion]
      };

      return {
        state:'published',
        remoteId,
        providerRequestId:remoteId,
        url:readback.url,
        readbackVerified:true,
        sourceRefs:[
          'provider:facebook-verified-permalink-readback',
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
