#!/usr/bin/env node
// External, GET-only first-visit proof for the free Evercraft door.
// No account access, browser execution, analytics, sales, uploads, payment or promotion.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ORIGIN='https://jgaethle10.github.io';
const ROOT=ORIGIN+'/forge-operator';
export const SURFACES=Object.freeze([
  {key:'free_hub',path:'/try/',source:'public/try/index.html',identity:'Try Evercraft for free'},
  {key:'boardroom_comparison',path:'/mesh/ai-boardroom/compare/',source:'public/mesh/ai-boardroom/compare/index.html',identity:'Compare AI Answers'},
  {key:'research_scope',path:'/research/',source:'public/research/index.html',identity:'Evercraft Research'},
  {key:'work_saban_sample',path:'/work-saban/demo/',source:'public/work-saban/demo/index.html',identity:'Try an example'}
]);
const HUB_LINKS=Object.freeze([
  '../mesh/ai-boardroom/compare/',
  '../research/',
  '../work-saban/demo/'
]);
const digest=x=>createHash('sha256').update(x).digest('hex');

// Founder-approved identity for the free tools hub only (not underlying product brands).
// Validate both repository source and independently observed deployed HTML.
export function freeHubBrandContract(html){
  const value=String(html||'');
  return /<meta\s+name=["']theme-color["']\s+content=["']#050b12["']\s*\/?>/i.test(value)
    && /color-scheme\s*:\s*dark\b/i.test(value)
    && /--bg\s*:\s*#050b12\b/i.test(value)
    && /--ice\s*:\s*#8adfff\b/i.test(value)
    && !/--red\s*:/i.test(value);
}

const robotsNoindex=text=>/<meta\s+name=["']robots["'][^>]+content=["'][^"']*\bnoindex\b/i.test(text||'');
function expectedURL(spec){
  const url=new URL(ROOT+spec.path);
  if(url.origin!==ORIGIN || !url.pathname.startsWith('/forge-operator/') || url.search || url.hash){
    throw Error('public_probe_route_not_owned');
  }
  return url.href;
}
export function classifySurface(spec,observation,source){
  const url=expectedURL(spec);
  const out={
    key:spec.key,url,source:spec.source,
    source_present:typeof source==='string',
    public_observed:!!observation?.observed,
    http_status:observation?.status??null,
    exact_source_readback:false,identity_verified:false,source_links_verified:null,
    browser_interaction_verified:false,human_visitor_verified:false,
    ai_referral_verified:false,checkout_verified:false,revenue_verified:false,
    safe_for_public_promotion:false
  };
  if(typeof source!=='string')return {...out,state:'SOURCE_NOT_IN_MAIN'};
  if(!source.includes(spec.identity))throw Error('source_identity_missing:'+spec.key);
  const brandSourcePass=spec.key==='free_hub'?freeHubBrandContract(source):null;
  if(spec.key==='free_hub'&&!brandSourcePass) return {...out,state:'BRAND_SOURCE_DRIFT',brand_source_verified:false,brand_public_verified:false};
  if(!observation?.observed)return {...out,state:'PUBLIC_UNOBSERVED',error:observation?.error||'unobserved'};
  if(observation.status!==200 || observation.final_url!==url || !/^text\/html\b/i.test(observation.content_type||'')){
    return {...out,state:'PUBLIC_RESPONSE_NOT_VERIFIED',final_url:observation.final_url||null};
  }
  const html=String(observation.body||'');
  const exact=digest(html)===digest(source);
  const identity=html.includes(spec.identity);
  const noindex=robotsNoindex(html) || /\bnoindex\b/i.test(observation.x_robots_tag||'');
  const foundLinks=spec.key==='free_hub' ? HUB_LINKS.every(href=>html.includes('href="'+href)) : null;
  const brandPublicPass=spec.key==='free_hub'?freeHubBrandContract(html):null;
  const result={...out,exact_source_readback:exact,identity_verified:identity,
    source_links_verified:foundLinks,public_noindex:noindex,
    brand_source_verified:brandSourcePass,brand_public_verified:brandPublicPass};
  if(!identity)return {...result,state:'PUBLIC_IDENTITY_MISMATCH'};
  if(spec.key==='free_hub'&&!foundLinks)return {...result,state:'PUBLIC_FREE_LINKS_MISSING'};
  if(spec.key==='free_hub'&&!brandPublicPass)return {...result,state:'PUBLIC_BRAND_DRIFT'};
  if(noindex)return {...result,state:'PUBLIC_INDEX_HOLD'};
  if(!exact)return {...result,state:'PUBLIC_SOURCE_DRIFT'};
  return {...result,state:'PUBLIC_HTML_GET_VERIFIED'};
}
export async function inspectSurface(spec,{
  fetchFn=fetch,load=path=>existsSync(path)?readFileSync(path,'utf8'):null
}={}){
  const source=load(spec.source);
  const url=expectedURL(spec);
  let observation;
  try{
    const res=await fetchFn(url,{method:'GET',redirect:'error',credentials:'omit',
      signal:AbortSignal.timeout(10000),
      headers:{accept:'text/html','user-agent':'Evercraft-FreeFirst-PublicGET/1.0'}});
    const body=String(await res.text()).slice(0,350000);
    observation={observed:true,status:res.status,final_url:res.url||url,
      content_type:res.headers?.get('content-type')||'',
      x_robots_tag:res.headers?.get('x-robots-tag')||'',body};
  }catch(error){observation={observed:false,error:error?.name||'get_failed'};}
  return classifySurface(spec,observation,source);
}
export async function run({fetchFn=fetch,
  output='/tmp/evercraft-free-first-public-get.json'}={}){
  const surfaces=await Promise.all(SURFACES.map(spec=>inspectSurface(spec,{fetchFn})));
  const getVerified=surfaces.every(x=>x.state==='PUBLIC_HTML_GET_VERIFIED');
  const report={
    schema:'evercraft.distribution.free-first-public-get.v1',
    observed_at:new Date().toISOString(),read_only:true,
    method:'HTTPS_GET',
    state:getVerified?'ALL_STATIC_ENTRIES_GET_VERIFIED':'RELEASE_OR_REACHABILITY_INCOMPLETE',
    summary:{total:surfaces.length,
      get_verified:surfaces.filter(x=>x.state==='PUBLIC_HTML_GET_VERIFIED').length,
      source_not_in_main:surfaces.filter(x=>x.state==='SOURCE_NOT_IN_MAIN').length,
      all_static_get_verified:getVerified,
      browser_run_verified:false,real_visitor_sessions_observed:0,
      zero_is_observation:false,
      qualified_referrals_verified:false,orders_verified:false},
    limitations:'Static GET proves neither a working in-browser tool nor real user visits, AI recommendations, checkout or revenue. A missing PR source cannot be presented as a released page.',
    surfaces
  };
  writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({state:report.state,summary:report.summary,
    surfaces:surfaces.map(x=>({key:x.key,state:x.state,http_status:x.http_status})),receipt_path:output},null,2));
  return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  await run({output:process.env.EVERCRAFT_FREE_FIRST_GET_RECEIPT||'/tmp/evercraft-free-first-public-get.json'});
}
