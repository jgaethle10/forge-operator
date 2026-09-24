import fs from 'node:fs';
import { DISCOVERY_LANES, resolveDiscoveryLane } from './discovery-lane-policy.mjs';

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const registry = readJson('conformance/products.json');
const timeoutMs = 15000;
const strict = process.argv.includes('--strict');

const crawlerProfiles = [
  { provider:'chatgpt_search', robots_token:'OAI-SearchBot', user_agent:'Mozilla/5.0 (compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot)', lane:'search' },
  { provider:'chatgpt_user_fetch', robots_token:'ChatGPT-User', user_agent:'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot', lane:'user_fetch' },
  { provider:'openai_model_crawl', robots_token:'GPTBot', user_agent:'Mozilla/5.0 (compatible; GPTBot/1.4; +https://openai.com/gptbot)', lane:'model_crawl' },
  { provider:'claude_search', robots_token:'Claude-SearchBot', user_agent:'Claude-SearchBot', lane:'search' },
  { provider:'claude_user_fetch', robots_token:'Claude-User', user_agent:'Claude-User', lane:'user_fetch' },
  { provider:'claude_model_crawl', robots_token:'ClaudeBot', user_agent:'ClaudeBot', lane:'model_crawl' },
  { provider:'google_search', robots_token:'Googlebot', user_agent:'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', lane:'search' },
  { provider:'gemini_grounding', robots_token:'Google-Extended', user_agent:null, lane:'robots_policy_only' },
  { provider:'copilot_search', robots_token:'bingbot', user_agent:'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)', lane:'search' },
  { provider:'perplexity_search', robots_token:'PerplexityBot', user_agent:'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)', lane:'search' },
  { provider:'apple_search_and_ai_context', robots_token:'Applebot', user_agent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)', lane:'search' },
  { provider:'apple_foundation_model_policy', robots_token:'Applebot-Extended', user_agent:null, lane:'robots_policy_only' },
  { provider:'google_vertex_agent_crawl', robots_token:'Google-CloudVertexBot', user_agent:'Google-CloudVertexBot', lane:'agent_crawl' },
  { provider:'google_agent_user_fetch', robots_token:'Google-Agent', user_agent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko; compatible; Google-Agent; +https://developers.google.com/crawling/docs/crawlers-fetchers/google-agent) Chrome/140.0.0.0 Safari/537.36', lane:'user_fetch' },
  { provider:'gemini_notebook_user_fetch', robots_token:'Google-GeminiNotebook', user_agent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 (compatible; Google-GeminiNotebook; +https://developers.google.com/crawling/docs/crawlers-fetchers/google-gemininotebook)', lane:'user_fetch' }
];

async function fetchText(url, userAgent='Evercraft-CHUM-CrawlerAudit/0.5') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url,{method:'GET',redirect:'follow',headers:{'user-agent':userAgent,accept:'text/plain, text/html, application/json;q=0.9, */*;q=0.5'},signal:controller.signal});
    const body = await response.text();
    return {ok:response.ok,status:response.status,final_url:response.url,content_type:response.headers.get('content-type')||'',bytes:Buffer.byteLength(body),body};
  } catch(error) {
    return {ok:false,status:0,final_url:url,content_type:'',bytes:0,body:'',error:error instanceof Error?error.message:String(error)};
  } finally { clearTimeout(timer); }
}

function parseRobots(text) {
  const groups=[]; let current=null; let seenDirective=false;
  for(const raw of String(text||'').split(/\r?\n/)) {
    const line=raw.replace(/#.*$/,'').trim(); if(!line) continue;
    const idx=line.indexOf(':'); if(idx<0) continue;
    const field=line.slice(0,idx).trim().toLowerCase(); const value=line.slice(idx+1).trim();
    if(field==='user-agent') {
      if(!current||seenDirective){current={agents:[],rules:[]};groups.push(current);seenDirective=false;}
      current.agents.push(value.toLowerCase()); continue;
    }
    if(!current) continue;
    if(field==='allow'||field==='disallow'){current.rules.push({type:field,path:value});seenDirective=true;}
  }
  return groups;
}

function robotsDecision(groups, token, pathName='/') {
  const needle=String(token||'').toLowerCase();
  const matches=groups.map(group=>({group,match:Math.max(0,...group.agents.map(agent=>agent==='*'?1:(needle.includes(agent)||agent.includes(needle)?agent.length:0)))})).filter(entry=>entry.match>0);
  if(!matches.length) return {allowed:true,reason:'no_matching_group'};
  const best=Math.max(...matches.map(entry=>entry.match));
  const rules=matches.filter(entry=>entry.match===best).flatMap(entry=>entry.group.rules);
  const matchingRules=rules.filter(rule=>!(rule.type==='disallow'&&rule.path==='')&&pathName.startsWith(rule.path||'/')).sort((a,b)=>((b.path||'').length-(a.path||'').length)||(a.type===b.type?0:(a.type==='allow'?-1:1)));
  if(!matchingRules.length) return {allowed:true,reason:'no_matching_rule'};
  const winning=matchingRules[0]; return {allowed:winning.type==='allow',reason:`${winning.type}:${winning.path||'/'}`};
}

async function buildSurface(url) {
  if(!url) return null;
  const parsed=new URL(url);
  const robotsUrl=`${parsed.origin}/robots.txt`;
  const robots=await fetchText(robotsUrl);
  const robotsMissing=robots.status===404;
  return {url,parsed,robotsUrl,robots,robotsMissing,groups:robots.ok?parseRobots(robots.body):[]};
}

async function probeSurface(surface, profile) {
  if(!surface) return null;
  const policy=surface.robotsMissing
    ? {allowed:true,reason:'robots_404_assumed_allow'}
    : surface.robots.ok
      ? robotsDecision(surface.groups,profile.robots_token,surface.parsed.pathname||'/')
      : {allowed:null,reason:`robots_unreadable_http_${surface.robots.status||'error'}`};
  let live={checked:false,ok:null,status:null,reason:'robots_policy_only'};
  if(profile.user_agent) {
    const result=await fetchText(surface.url,profile.user_agent);
    live={checked:true,ok:result.ok,status:result.status,final_url:result.final_url,content_type:result.content_type,bytes:result.bytes,reason:result.ok?'reachable':(result.error||`http_${result.status}`)};
  }
  return {url:surface.url,robots_allowed:policy.allowed,robots_reason:policy.reason,live};
}

async function inspectProduct(product) {
  const originUrl=product.origin_canonical_url||product.canonical_url;
  const fallbackUrl=product.discovery_url||product.llms_url||null;
  const originSurface=await buildSurface(originUrl);
  const fallbackSurface=fallbackUrl&&fallbackUrl!==originUrl?await buildSurface(fallbackUrl):null;

  const crawlers=await Promise.all(crawlerProfiles.map(async profile=>{
    const origin=await probeSurface(originSurface,profile);
    let fallback=null;
    const preliminary=resolveDiscoveryLane({origin,fallback:null,lane:profile.lane});
    if(preliminary.blocked&&fallbackSurface&&DISCOVERY_LANES.has(profile.lane)) fallback=await probeSurface(fallbackSurface,profile);
    const resolution=resolveDiscoveryLane({origin,fallback,lane:profile.lane});
    const effective=resolution.effective||origin||fallback;
    return {
      ...profile,
      origin,
      fallback,
      effective_surface:resolution.route,
      recovered_by_fallback:resolution.recovered_by_fallback,
      blocked:resolution.blocked,
      robots_allowed:effective?.robots_allowed??null,
      robots_reason:effective?.robots_reason||'no_surface',
      live:effective?.live||{checked:false,ok:null,status:null,reason:'no_surface'}
    };
  }));

  const discoverable=crawlers.filter(c=>DISCOVERY_LANES.has(c.lane));
  const blocked=discoverable.filter(c=>c.blocked);
  const recovered=discoverable.filter(c=>c.recovered_by_fallback);

  return {
    product_key:product.product_key,
    name:product.name,
    canonical_url:product.canonical_url,
    origin_url:originUrl,
    chum_fallback_url:fallbackUrl,
    origin_robots:originSurface?{url:originSurface.robotsUrl,status:originSurface.robots.status,readable:originSurface.robots.ok,missing_assumed_allow:originSurface.robotsMissing,bytes:originSurface.robots.bytes,error:originSurface.robots.error||null}:null,
    search_discovery_state:blocked.length?'repair_needed':recovered.length?'open_via_chum_fallback':'open_or_reachable',
    blocked_search_lanes:blocked.map(c=>c.provider),
    fallback_recovered_lanes:recovered.map(c=>c.provider),
    crawlers
  };
}

const products=[];
const PRODUCT_CONCURRENCY=3;
const sourceProducts=registry.products||[];
for(let i=0;i<sourceProducts.length;i+=PRODUCT_CONCURRENCY) products.push(...await Promise.all(sourceProducts.slice(i,i+PRODUCT_CONCURRENCY).map(inspectProduct)));

const blockedRows=products.flatMap(product=>product.crawlers.filter(c=>DISCOVERY_LANES.has(c.lane)&&c.blocked).map(c=>({
  product_key:product.product_key,
  provider:c.provider,
  origin_url:product.origin_url,
  fallback_url:product.chum_fallback_url,
  origin_status:c.origin?.live?.status??null,
  fallback_status:c.fallback?.live?.status??null,
  reason:c.origin?.robots_allowed===false?c.origin.robots_reason:(c.origin?.live?.reason||c.fallback?.live?.reason||'no_reachable_surface')
})));

const recoveredRows=products.flatMap(product=>product.crawlers.filter(c=>DISCOVERY_LANES.has(c.lane)&&c.recovered_by_fallback).map(c=>({
  product_key:product.product_key,provider:c.provider,origin_url:product.origin_url,fallback_url:product.chum_fallback_url,origin_status:c.origin?.live?.status??null,fallback_status:c.fallback?.live?.status??null
})));

const receipt={
  schema:'evercraft.chum.crawler-audit.v3',
  generated_at:new Date().toISOString(),
  doctrine:{
    public_commercial_surfaces_should_be_discoverable:true,
    private_admin_surfaces_should_not_be_advertised:true,
    chum_mirror_is_valid_discovery_fallback:true,
    fallback_does_not_prove_origin_runtime_health:true,
    provider_pickup_not_inferred_from_access:true
  },
  profiles:crawlerProfiles.map(({user_agent,...rest})=>({...rest,http_probe:Boolean(user_agent)})),
  summary:{
    products:products.length,
    crawler_profiles:crawlerProfiles.length,
    blocked_search_lanes:blockedRows.length,
    products_needing_repair:new Set(blockedRows.map(row=>row.product_key)).size,
    fallback_recovered_lanes:recoveredRows.length,
    products_using_chum_fallback:new Set(recoveredRows.map(row=>row.product_key)).size
  },
  blocked_search_lanes:blockedRows,
  fallback_recoveries:recoveredRows,
  products
};

fs.mkdirSync('artifacts/chum',{recursive:true});
fs.writeFileSync('artifacts/chum/crawler-audit-latest.json',JSON.stringify(receipt,null,2)+'\n');

const md=[
  '# CHUM Crawler / AI Discovery Audit','',
  `Generated: ${receipt.generated_at}`,
  `Products: ${receipt.summary.products}`,
  `Crawler profiles: ${receipt.summary.crawler_profiles}`,
  `Blocked search lanes: ${receipt.summary.blocked_search_lanes}`,
  `Products needing repair: ${receipt.summary.products_needing_repair}`,
  `Lanes recovered by CHUM mirrors: ${receipt.summary.fallback_recovered_lanes}`,
  `Products using CHUM fallback: ${receipt.summary.products_using_chum_fallback}`,'',
  '> A CHUM mirror can keep a public capability discoverable when its product origin is unavailable. That does not make the product runtime live, and it does not prove provider indexing, recommendation, citation or conversion.','',
  '| Product | Effective discovery | Fallback recovered lanes | Blocked lanes |','|---|---|---|---|',
  ...products.map(product=>`| ${product.name} | ${product.search_discovery_state} | ${product.fallback_recovered_lanes.join(', ')||'none'} | ${product.blocked_search_lanes.join(', ')||'none'} |`),
  '','## Remaining repair queue','',
  ...(blockedRows.length?blockedRows.map(row=>`- ${row.product_key} / ${row.provider}: origin HTTP ${row.origin_status??'n/a'}, fallback HTTP ${row.fallback_status??'n/a'}`):['- No blocked discovery lanes remain after truthful CHUM fallback resolution.']),
  ''
];
fs.writeFileSync('artifacts/chum/crawler-audit-latest.md',md.join('\n'));
console.log(JSON.stringify(receipt.summary));

if(strict&&blockedRows.length) throw new Error(`CHUM crawler audit found ${blockedRows.length} blocked search lane(s) after fallback resolution`);
