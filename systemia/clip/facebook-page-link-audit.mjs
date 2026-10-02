import { preflightPublicLink } from './public-link-preflight.mjs';

const URL_RE=/https:\/\/[^\s<>"')\]]+/gi;

function unique(values){
  return [...new Set(values.filter(Boolean))];
}

function urlsFromText(value){
  return String(value||'').match(URL_RE)||[];
}

function attachmentUrls(attachments){
  const rows=Array.isArray(attachments?.data)?attachments.data:[];
  const out=[];
  for(const row of rows){
    if(row?.unshimmed_url) out.push(String(row.unshimmed_url));
    if(row?.url) out.push(String(row.url));
    const sub=Array.isArray(row?.subattachments?.data)?row.subattachments.data:[];
    for(const item of sub){
      if(item?.unshimmed_url) out.push(String(item.unshimmed_url));
      if(item?.url) out.push(String(item.url));
    }
  }
  return out;
}

async function json(response){
  const text=await response.text();
  if(!text) return {};
  try{return JSON.parse(text);}catch{return {raw:text};}
}

export async function auditFacebookPageLinks({
  pageId,
  pageAccessToken,
  graphVersion='v26.0',
  graphBase='https://graph.facebook.com',
  graphFetchImpl=globalThis.fetch,
  publicFetchImpl=globalThis.fetch,
  maxPosts=100,
}={}){
  if(!String(pageId||'').trim()) throw new Error('facebook_link_audit_page_id_missing');
  if(!String(pageAccessToken||'').trim()) throw new Error('facebook_link_audit_access_token_missing');
  if(typeof graphFetchImpl!=='function'||typeof publicFetchImpl!=='function') throw new Error('facebook_link_audit_fetch_unavailable');

  const version=String(graphVersion).replace(/^\/+|\/+$/g,'');
  const base=String(graphBase).replace(/\/+$/,'');
  const fields='id,message,permalink_url,created_time,attachments{url,unshimmed_url,subattachments{url,unshimmed_url}}';
  let next=base+'/'+version+'/'+encodeURIComponent(pageId)+'/feed?fields='+encodeURIComponent(fields)+'&limit=100';
  const posts=[];
  const unsafe=[];

  while(next&&posts.length<maxPosts){
    const response=await graphFetchImpl(next,{
      method:'GET',
      headers:{Authorization:'Bearer '+pageAccessToken},
    });
    const body=await json(response);
    if(response.status<200||response.status>=300){
      throw new Error('facebook_link_audit_provider_failed:'+response.status+':'+JSON.stringify(body).slice(0,300));
    }

    for(const post of Array.isArray(body?.data)?body.data:[]){
      if(posts.length>=maxPosts) break;
      const links=unique([
        ...urlsFromText(post?.message),
        ...attachmentUrls(post?.attachments),
      ]);
      const result={
        postId:String(post?.id||''),
        permalink:String(post?.permalink_url||''),
        createdAt:String(post?.created_time||''),
        links:[],
      };
      for(const url of links){
        try{
          const receipt=await preflightPublicLink({url,fetchImpl:publicFetchImpl});
          result.links.push({url,status:'verified',finalUrl:receipt.finalUrl,httpStatus:receipt.status});
        }catch(error){
          const issue={url,status:'unsafe',error:error instanceof Error?error.message:String(error)};
          result.links.push(issue);
          unsafe.push({
            postId:result.postId,
            permalink:result.permalink,
            createdAt:result.createdAt,
            ...issue,
          });
        }
      }
      posts.push(result);
    }
    next=posts.length<maxPosts?String(body?.paging?.next||''):'';
  }

  return {
    schema:'evercraft.clip.facebook-page-link-audit.v1',
    state:unsafe.length?'unsafe_public_links_found':'clean',
    scannedAt:new Date().toISOString(),
    pageId:String(pageId),
    postsScanned:posts.length,
    linksChecked:posts.reduce((sum,post)=>sum+post.links.length,0),
    unsafeCount:unsafe.length,
    unsafe,
    posts,
    destructiveActionTaken:false,
    accessTokenPersisted:false,
  };
}

async function cli(){
  const receipt=await auditFacebookPageLinks({
    pageId:process.env.EVERCRAFT_FACEBOOK_PAGE_ID,
    pageAccessToken:process.env.EVERCRAFT_FACEBOOK_PAGE_ACCESS_TOKEN,
    maxPosts:Number(process.env.EVERCRAFT_FACEBOOK_LINK_AUDIT_MAX_POSTS||100),
  });
  console.log(JSON.stringify(receipt,null,2));
  if(receipt.unsafeCount>0) process.exitCode=2;
}

if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  cli().catch(error=>{
    console.error(JSON.stringify({ok:false,error:error instanceof Error?error.message:String(error)}));
    process.exitCode=1;
  });
}
