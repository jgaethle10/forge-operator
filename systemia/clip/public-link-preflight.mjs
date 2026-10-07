import crypto from 'node:crypto';

const DEFAULT_BLOCKED_HOST_SUFFIXES=['base44.app','raw.githubusercontent.com','github.com'];

function hostMatchesSuffix(host,suffix){
  return host===suffix||host.endsWith('.'+suffix);
}

function privateIpv4(host){
  const parts=host.split('.').map(Number);
  if(parts.length!==4||parts.some(part=>!Number.isInteger(part)||part<0||part>255)) return false;
  if(parts[0]===10||parts[0]===127) return true;
  if(parts[0]===192&&parts[1]===168) return true;
  if(parts[0]===172&&parts[1]>=16&&parts[1]<=31) return true;
  if(parts[0]===169&&parts[1]===254) return true;
  return false;
}

export function assertPublicLinkShape(value,{blockedHostSuffixes=DEFAULT_BLOCKED_HOST_SUFFIXES}={}){
  let parsed;
  try{ parsed=new URL(String(value||'').trim()); }
  catch{ throw new Error('clip_public_link_invalid_url'); }

  if(parsed.protocol!=='https:') throw new Error('clip_public_link_https_required');
  if(parsed.username||parsed.password) throw new Error('clip_public_link_embedded_credentials_blocked');

  const host=parsed.hostname.toLowerCase().replace(/\.$/,'');
  if(!host) throw new Error('clip_public_link_host_missing');
  if(host==='localhost'||host==='::1'||host.endsWith('.local')||privateIpv4(host)){
    throw new Error('clip_public_link_non_public_host_blocked');
  }

  for(const suffix of blockedHostSuffixes.map(value=>String(value).toLowerCase().replace(/^\.+/,''))){
    if(suffix&&hostMatchesSuffix(host,suffix)) throw new Error('clip_public_link_legacy_provider_blocked');
  }

  return parsed;
}

function bodyLooksLikeHoldingPage(body){
  const text=String(body||'').toLowerCase();
  return [
    "this app isn't available yet",
    'this app is not available yet',
    "isn't available yet",
    'publish the app in builder',
  ].some(marker=>text.includes(marker));
}

function digest(value){
  return crypto.createHash('sha256').update(String(value||'')).digest('hex');
}

function decodeAttribute(value){
  return String(value||'')
    .replaceAll('&amp;','&')
    .replaceAll('&quot;','"')
    .replaceAll('&#39;',"'")
    .replaceAll('&lt;','<')
    .replaceAll('&gt;','>');
}

function tagAttributes(tag){
  const attrs={};
  for(const match of String(tag||'').matchAll(/([^\s=/>]+)\s*=\s*(["'])(.*?)\2/g)){
    attrs[String(match[1]||'').toLowerCase()]=decodeAttribute(match[3]);
  }
  return attrs;
}

function normalizeIdentityUrl(value,baseUrl,{blockedHostSuffixes=DEFAULT_BLOCKED_HOST_SUFFIXES}={}){
  if(!String(value||'').trim()) return null;
  let absolute;
  try{ absolute=new URL(String(value).trim(),baseUrl).toString(); }
  catch{ throw new Error('clip_public_link_identity_url_invalid'); }
  return assertPublicLinkShape(absolute,{blockedHostSuffixes}).toString();
}

export function readPublicPageIdentity(body,baseUrl,{blockedHostSuffixes=DEFAULT_BLOCKED_HOST_SUFFIXES}={}){
  const html=String(body||'');
  let canonicalUrl=null;
  let ogUrl=null;
  let ogTitle=null;
  let storyId=null;

  for(const match of html.matchAll(/<(link|meta)\b[^>]*>/gi)){
    const tagName=String(match[1]||'').toLowerCase();
    const attrs=tagAttributes(match[0]);
    if(tagName==='link'){
      const rel=String(attrs.rel||'').toLowerCase().split(/\s+/).filter(Boolean);
      if(rel.includes('canonical')&&attrs.href&&!canonicalUrl){
        canonicalUrl=normalizeIdentityUrl(attrs.href,baseUrl,{blockedHostSuffixes});
      }
      continue;
    }

    const key=String(attrs.property||attrs.name||'').toLowerCase();
    if(key==='og:url'&&attrs.content&&!ogUrl){
      ogUrl=normalizeIdentityUrl(attrs.content,baseUrl,{blockedHostSuffixes});
    }else if(key==='og:title'&&attrs.content&&!ogTitle){
      ogTitle=String(attrs.content).trim();
    }else if(key==='evercraft:story_id'&&attrs.content&&!storyId){
      storyId=String(attrs.content).trim();
    }
  }

  const titleMatch=html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const documentTitle=titleMatch?decodeAttribute(String(titleMatch[1]).replace(/<[^>]+>/g,'').trim()):null;

  return {canonicalUrl,ogUrl,ogTitle,storyId,documentTitle};
}

export async function preflightPublicLink({
  url,
  fetchImpl=globalThis.fetch,
  blockedHostSuffixes=DEFAULT_BLOCKED_HOST_SUFFIXES,
  expectedText=[],
  expectedCanonicalUrl='',
  expectedOgUrl='',
  expectedStoryId='',
  requireCanonicalSelfMatch=false,
  requireOpenGraphSelfMatch=false,
  maxRedirects=5,
  timeoutMs=12000,
}={}){
  if(typeof fetchImpl!=='function') throw new Error('clip_public_link_fetch_unavailable');
  const requested=assertPublicLinkShape(url,{blockedHostSuffixes}).toString();
  let current=requested;
  const redirects=[];

  for(let hop=0;hop<=maxRedirects;hop+=1){
    const parsed=assertPublicLinkShape(current,{blockedHostSuffixes});
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    let response;
    try{
      response=await fetchImpl(parsed.toString(),{
        method:'GET',
        redirect:'manual',
        headers:{
          Accept:'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          'User-Agent':'EvercraftClipPublicLinkPreflight/1.0',
          'Cache-Control':'no-cache',
        },
        signal:controller.signal,
      });
    }catch(error){
      if(error?.name==='AbortError') throw new Error('clip_public_link_timeout');
      throw new Error('clip_public_link_fetch_failed:'+String(error?.message||error).slice(0,300));
    }finally{
      clearTimeout(timer);
    }

    const status=Number(response?.status||0);
    if(status>=300&&status<400){
      const location=response.headers?.get?.('location');
      if(!location) throw new Error('clip_public_link_redirect_location_missing');
      if(hop>=maxRedirects) throw new Error('clip_public_link_redirect_limit_exceeded');
      const next=new URL(location,parsed).toString();
      assertPublicLinkShape(next,{blockedHostSuffixes});
      redirects.push({status,from:parsed.toString(),to:next});
      current=next;
      continue;
    }

    if(status<200||status>=300) throw new Error('clip_public_link_http_status_'+status);

    const contentType=String(response.headers?.get?.('content-type')||'').toLowerCase();
    if(contentType&&!(contentType.includes('text/html')||contentType.includes('application/xhtml+xml')||contentType.includes('application/pdf'))){
      throw new Error('clip_public_link_non_browsable_content_type');
    }

    const body=typeof response.text==='function'?await response.text():'';
    if(bodyLooksLikeHoldingPage(body)) throw new Error('clip_public_link_holding_page_detected');

    const lowered=body.toLowerCase();
    const missing=(expectedText||[])
      .map(value=>String(value||'').trim().toLowerCase())
      .filter(Boolean)
      .filter(marker=>!lowered.includes(marker));
    if(missing.length) throw new Error('clip_public_link_expected_identity_missing');

    const finalUrl=parsed.toString();
    const isHtml=!contentType||contentType.includes('text/html')||contentType.includes('application/xhtml+xml');
    const identity=isHtml?readPublicPageIdentity(body,finalUrl,{blockedHostSuffixes}):{
      canonicalUrl:null,ogUrl:null,ogTitle:null,storyId:null,documentTitle:null
    };

    const expectedCanonical=expectedCanonicalUrl
      ?normalizeIdentityUrl(expectedCanonicalUrl,finalUrl,{blockedHostSuffixes})
      :null;
    const expectedOg=expectedOgUrl
      ?normalizeIdentityUrl(expectedOgUrl,finalUrl,{blockedHostSuffixes})
      :null;

    if(expectedCanonical){
      if(!identity.canonicalUrl) throw new Error('clip_public_link_canonical_missing');
      if(identity.canonicalUrl!==expectedCanonical) throw new Error('clip_public_link_canonical_mismatch');
    }
    if(requireCanonicalSelfMatch){
      if(!identity.canonicalUrl) throw new Error('clip_public_link_canonical_missing');
      if(identity.canonicalUrl!==finalUrl) throw new Error('clip_public_link_canonical_not_final_url');
    }
    if(expectedOg){
      if(!identity.ogUrl) throw new Error('clip_public_link_og_url_missing');
      if(identity.ogUrl!==expectedOg) throw new Error('clip_public_link_og_url_mismatch');
    }
    if(requireOpenGraphSelfMatch){
      if(!identity.ogUrl) throw new Error('clip_public_link_og_url_missing');
      if(identity.ogUrl!==finalUrl) throw new Error('clip_public_link_og_url_not_final_url');
    }
    if(String(expectedStoryId||'').trim()){
      if(!identity.storyId) throw new Error('clip_public_link_story_id_missing');
      if(identity.storyId!==String(expectedStoryId).trim()) throw new Error('clip_public_link_story_id_mismatch');
    }

    return {
      schema:'evercraft.clip.public-link-preflight.v2',
      verified:true,
      requestedUrl:requested,
      finalUrl,
      status,
      redirects,
      contentType,
      identity,
      bodyFingerprint:'sha256:'+digest(body.slice(0,131072)),
      checkedAt:new Date().toISOString(),
      boundaries:{
        anonymousFetch:true,
        httpsRequired:true,
        nonPublicHostsBlocked:true,
        legacyProviderBlocked:true,
        rawSourceHostsBlocked:true,
        browserRenderableContentRequired:true,
        redirectsRevalidated:true,
        holdingPageRejected:true,
        canonicalIdentityVerified:expectedCanonical?identity.canonicalUrl===expectedCanonical:null,
        canonicalSelfMatchVerified:requireCanonicalSelfMatch?identity.canonicalUrl===finalUrl:null,
        openGraphIdentityVerified:expectedOg?identity.ogUrl===expectedOg:null,
        openGraphSelfMatchVerified:requireOpenGraphSelfMatch?identity.ogUrl===finalUrl:null,
        storyIdentityVerified:String(expectedStoryId||'').trim()?identity.storyId===String(expectedStoryId).trim():null,
      },
    };
  }

  throw new Error('clip_public_link_redirect_limit_exceeded');
}
