// Jesse creator front door: public, read-only research shelf.
// No social posting, client storage, private credentials, or invented publication.
export const JOURNAL_INDEX_SCHEMA='evercraft.journal.index.v1';
const clean=v=>String(v??'').trim();
const SAFE_SLUG=/^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/;

export function eligibleJournalCandidates(index,{now=new Date(),limit=3}={}){
  if(index?.schema!==JOURNAL_INDEX_SCHEMA || index.live_edition!==true ||
      !Array.isArray(index.stories)) return [];
  const clock=now instanceof Date?now.getTime():new Date(now).getTime();
  if(!Number.isFinite(clock)) throw new Error('creator_journal_invalid_clock');
  const used=new Set();
  return index.stories.filter(item=>{
    const slug=clean(item?.slug);
    const storyId=clean(item?.story_id);
    const published=Date.parse(item?.published_at);
    if(!SAFE_SLUG.test(slug)||!storyId.startsWith('journal:')||
        !Number.isFinite(published)||published>clock+300000||
        !clean(item?.title)||used.has(slug))return false;
    used.add(slug);
    return true;
  }).slice(0,Math.min(3,Math.max(0,limit))).map(item=>({
    slug:clean(item.slug),storyId:clean(item.story_id),
    title:clean(item.title),dek:clean(item.dek),
    desk:clean(item.desk)||'Reporting',
    publishedAt:item.published_at,
    localPath:'../journal/'+clean(item.slug)+'/',
  }));
}

export function articleIdentityMatches(html,expectedStoryId){
  if(!html||!expectedStoryId)return false;
  const metas=String(html).match(/<meta\b[^>]*>/gi)||[];
  for(const meta of metas){
    if(!/\bname\s*=\s*(["'])evercraft:story_id\1/i.test(meta))continue;
    const m=meta.match(/\bcontent\s*=\s*(["'])(.*?)\1/i);
    if(m?.[2]===expectedStoryId)return true;
  }
  return false;
}

export async function verifyJournalCandidate(candidate,{
  baseUrl,fetchImpl=globalThis.fetch,
}={}){
  if(typeof fetchImpl!=='function')return false;
  try{
    const url=new URL(candidate.localPath,baseUrl);
    const root=new URL(baseUrl);
    if(url.origin!==root.origin||url.username||url.password)return false;
    const response=await fetchImpl(url.toString(),{
      method:'GET',credentials:'omit',cache:'no-store',redirect:'error',
      headers:{'accept':'text/html'},
    });
    if(!response?.ok||response.status!==200)return false;
    const returned=response.url?new URL(response.url):url;
    if(returned.origin!==root.origin||returned.pathname!==url.pathname)return false;
    const type=String(response.headers?.get?.('content-type')||'');
    if(!/^text\/html(?:;|$)/i.test(type))return false;
    const html=await response.text();
    if(html.length>3*1024*1024)return false;
    return articleIdentityMatches(html,candidate.storyId);
  }catch{return false;}
}

function make(tag,cls,value){
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(value)node.textContent=value;
  return node;
}
function showStatus(element,message){
  element.replaceChildren(make('p','research-status',message));
}

export async function mountJournalShelf({
  root=document.getElementById('research-feed'),
  baseUrl=document.baseURI,
  fetchImpl=globalThis.fetch,
  now=new Date(),
}={}){
  if(!root)return {state:'not_mounted',count:0};
  showStatus(root,'Checking the current Evercraft Journal edition…');
  try{
    const url=new URL('../journal/index.json',baseUrl);
    if(url.origin!==new URL(baseUrl).origin)throw new Error('creator_journal_cross_origin');
    const response=await fetchImpl(url.toString(),{
      method:'GET',credentials:'omit',cache:'no-store',redirect:'error',
      headers:{'accept':'application/json'},
    });
    if(!response?.ok||response.status!==200)throw new Error('creator_journal_index_unavailable');
    const index=await response.json();
    const candidates=eligibleJournalCandidates(index,{now});
    const verified=[];
    for(const candidate of candidates){
      if(await verifyJournalCandidate(candidate,{baseUrl,fetchImpl}))verified.push(candidate);
    }
    if(!verified.length){
      showStatus(root,'No independently verified current Journal article is available from this site yet. Original creator episodes are still in production.');
      return {state:'no_verified_current_article',count:0};
    }
    const list=make('div','research-feed-grid');
    for(const story of verified){
      const card=make('article','research-card');
      card.append(make('div','research-eyebrow',story.desk+' · Evercraft Journal'));
      card.append(make('h3','',story.title));
      if(story.dek)card.append(make('p','',story.dek));
      const link=make('a','research-link','Read the verified article');
      link.href=story.localPath;
      card.append(link);
      list.append(card);
    }
    root.replaceChildren(list);
    return {state:'article_source_readback_verified',count:verified.length};
  }catch{
    showStatus(root,'The current Journal edition could not be verified here. The creator series remains in development.');
    return {state:'index_or_network_unavailable',count:0};
  }
}
if(typeof document!=='undefined'){
  const root=document.getElementById('research-feed');
  if(root)void mountJournalShelf({root});
}
