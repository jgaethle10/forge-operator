#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVisualStory } from '../systemia/visual-desk/factory.mjs';

const clean=(value)=>String(value??'').trim();
const sha256=(value)=>crypto.createHash('sha256').update(value).digest('hex');
const arg=(name,fallback='')=>{
  const index=process.argv.indexOf(name);
  return index>=0&&process.argv[index+1]?process.argv[index+1]:fallback;
};
const timeoutMs=Number(arg('--timeout-ms','12000'));
const origin=clean(arg('--origin','https://fabric.systemiacommandcenters.com')).replace(/\/$/,'');
if(!/^https:\/\//i.test(origin)) throw new Error('visual_freshness_origin_requires_https');

async function timedFetch(url,options={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    return await fetch(url,{
      ...options,
      signal:controller.signal,
      headers:{
        accept:'*/*',
        'user-agent':'Evercraft-Visual-Edge-Freshness/1.0',
        ...(options.headers||{}),
      },
    });
  }finally{
    clearTimeout(timer);
  }
}

async function getText(pathname){
  const response=await timedFetch(origin+pathname);
  const text=await response.text();
  if(!response.ok) throw new Error('http_'+response.status+':'+pathname);
  return {
    text,
    status:response.status,
    contentType:response.headers.get('content-type')||'',
    cacheControl:response.headers.get('cache-control')||'',
    etag:response.headers.get('etag')||'',
    lastModified:response.headers.get('last-modified')||'',
  };
}

async function getJson(pathname){
  const response=await timedFetch(origin+pathname,{headers:{accept:'application/json'}});
  const text=await response.text();
  if(!response.ok) throw new Error('json_http_'+response.status+':'+pathname);
  try{return JSON.parse(text);}
  catch{throw new Error('json_invalid:'+pathname);}
}

async function getOptionalJson(pathname){
  const response=await timedFetch(origin+pathname,{headers:{accept:'application/json'}});
  const text=await response.text();
  if(response.status===404){
    return {exists:false,status:404,body:null};
  }
  if(!response.ok) throw new Error('json_http_'+response.status+':'+pathname);
  try{
    return {exists:true,status:response.status,body:JSON.parse(text)};
  }catch{
    throw new Error('json_invalid:'+pathname);
  }
}

function marker(text,pattern){
  const match=String(text||'').match(pattern);
  return match?.[1]||null;
}

const moduleDir=path.dirname(fileURLToPath(import.meta.url));
const repoRoot=path.resolve(moduleDir,'..');
const storyPath=path.join(repoRoot,'systemia/visual-desk/stories/washington-active-volcanoes.json');
const storyInput=JSON.parse(fs.readFileSync(storyPath,'utf8'));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-visual-freshness-'));

try{
  const built=buildVisualStory(storyInput,{
    outputRoot:tmp,
    origin:origin+'/visuals',
  });
  const expectedPosterPath=path.join(built.outputDir,'poster-feed.svg');
  const expectedPoster=fs.readFileSync(expectedPosterPath);
  const expectedPosterText=expectedPoster.toString('utf8');

  const [health,catalog,livePoster,livePlanResult,liveQualityResult]=await Promise.all([
    getJson('/health'),
    getJson('/visuals/index.json'),
    getText('/visuals/washington-active-volcanoes/poster-feed.svg'),
    getOptionalJson('/visuals/washington-active-volcanoes/graphics-plan.json'),
    getOptionalJson('/visuals/washington-active-volcanoes/poster-quality-report.json'),
  ]);
  const livePlan=livePlanResult.body;
  const liveQuality=liveQualityResult.body;

  const livePosterBytes=Buffer.from(livePoster.text,'utf8');
  const catalogStory=(catalog.stories||[]).find(row=>row.slug==='washington-active-volcanoes')||null;
  const expectedModel=marker(expectedPosterText,/data-visual-model="([^"]+)"/);
  const liveModel=marker(livePoster.text,/data-visual-model="([^"]+)"/);
  const expectedStrategy=marker(expectedPosterText,/data-shot-strategy="([^"]+)"/);
  const liveStrategy=marker(livePoster.text,/data-shot-strategy="([^"]+)"/);

  const result={
    schema:'evercraft.visual-edge.freshness-probe.v1',
    observed_at:new Date().toISOString(),
    origin,
    mutation_performed:false,
    expected:{
      checkout_ref:clean(process.env.GITHUB_SHA)||null,
      story_digest:built.story.digest,
      graphics_plan_digest:built.graphicsPlan.digest,
      poster_sha256:sha256(expectedPoster),
      poster_bytes:expectedPoster.length,
      visual_model:expectedModel,
      shot_strategy:expectedStrategy,
      geo_boundary_present:/class="geo-boundary"/.test(expectedPosterText),
      terrain_relief_present:/class="terrain-relief"/.test(expectedPosterText),
    },
    live:{
      instance_id:health.instance_id||null,
      service:health.service||null,
      version:health.version||null,
      source_release_ref:health.source_release_ref||null,
      source_release_observed_at_startup:health.source_release_observed_at_startup===true,
      capability_count:Number(health.capability_count||0),
      visual_desk_story_count:Number(health.visual_desk_story_count||0),
      catalog_story_digest:catalogStory?.storyDigest||null,
      catalog_published_at:catalogStory?.publishedAt||null,
      graphics_plan_http_status:livePlanResult.status,
      graphics_plan_present:livePlanResult.exists,
      graphics_plan_digest:livePlan?.digest||null,
      poster_quality_http_status:liveQualityResult.status,
      poster_quality_present:liveQualityResult.exists,
      poster_quality_status:liveQuality?.status||null,
      poster_sha256:sha256(livePosterBytes),
      poster_bytes:livePosterBytes.length,
      visual_model:liveModel,
      shot_strategy:liveStrategy,
      geo_boundary_present:/class="geo-boundary"/.test(livePoster.text),
      terrain_relief_present:/class="terrain-relief"/.test(livePoster.text),
      cache_control:livePoster.cacheControl||null,
      etag:livePoster.etag||null,
      last_modified:livePoster.lastModified||null,
    },
  };

  result.freshness={
    source_release_attested:result.live.source_release_observed_at_startup===true&&/^[a-f0-9]{40}$/i.test(String(result.live.source_release_ref||'')),
    story_digest_match:result.live.catalog_story_digest===result.expected.story_digest,
    graphics_plan_present:result.live.graphics_plan_present===true,
    poster_quality_present:result.live.poster_quality_present===true,
    graphics_plan_digest_match:result.live.graphics_plan_digest===result.expected.graphics_plan_digest,
    poster_sha256_match:result.live.poster_sha256===result.expected.poster_sha256,
    visual_model_match:result.live.visual_model===result.expected.visual_model,
    geo_boundary_match:result.live.geo_boundary_present===result.expected.geo_boundary_present,
    terrain_relief_match:result.live.terrain_relief_present===result.expected.terrain_relief_present,
  };
  const checks=Object.values(result.freshness);
  result.state=checks.every(Boolean)?'fresh':'stale';
  result.receipt_hash='sha256:'+sha256(JSON.stringify({...result,receipt_hash:undefined}));
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}finally{
  fs.rmSync(tmp,{recursive:true,force:true});
}
