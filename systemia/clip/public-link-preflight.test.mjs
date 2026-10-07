import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPublicLinkShape, preflightPublicLink } from './public-link-preflight.mjs';

function response(status,body='',headers={}){
  return {status,headers:new Headers(headers),async text(){return body;}};
}

test('blocks legacy provider destinations before any network request',async()=>{
  let calls=0;
  await assert.rejects(()=>preflightPublicLink({
    url:'https://peak-eps-calc.base44.app/',
    fetchImpl:async()=>{calls+=1;return response(200,'ok');},
  }),/clip_public_link_legacy_provider_blocked/);
  assert.equal(calls,0);
});

test('blocks redirects into the legacy provider',async()=>{
  await assert.rejects(()=>preflightPublicLink({
    url:'https://example.com/start',
    fetchImpl:async()=>response(302,'',{location:'https://peak-eps-calc.base44.app/'}),
  }),/clip_public_link_legacy_provider_blocked/);
});

test('fails closed on dead links',async()=>{
  await assert.rejects(()=>preflightPublicLink({
    url:'https://example.com/dead',
    fetchImpl:async()=>response(404,'not found',{'content-type':'text/html'}),
  }),/clip_public_link_http_status_404/);
});

test('rejects holding pages even when they return success',async()=>{
  await assert.rejects(()=>preflightPublicLink({
    url:'https://example.com/placeholder',
    fetchImpl:async()=>response(200,"This app isn't available yet.",{'content-type':'text/html'}),
  }),/clip_public_link_holding_page_detected/);
});

test('revalidates redirects and returns the final verified URL',async()=>{
  const calls=[];
  const result=await preflightPublicLink({
    url:'https://example.com/start',
    expectedText:['EPS Precise Estimator'],
    fetchImpl:async(url)=>{
      calls.push(url);
      if(url==='https://example.com/start') return response(301,'',{location:'/estimator'});
      return response(200,'<title>EPS Precise Estimator</title>',{'content-type':'text/html'});
    },
  });
  assert.equal(result.verified,true);
  assert.equal(result.finalUrl,'https://example.com/estimator');
  assert.equal(result.redirects.length,1);
  assert.equal(calls.length,2);
});

test('requires HTTPS',()=>{
  assert.throws(()=>assertPublicLinkShape('http://example.com'),/https_required/);
});


test('blocks raw source-host links before publication',async()=>{
  let calls=0;
  await assert.rejects(()=>preflightPublicLink({
    url:'https://raw.githubusercontent.com/example/repo/main/product.html',
    fetchImpl:async()=>{calls+=1;return response(200,'<title>raw</title>',{'content-type':'text/plain'});},
  }),/clip_public_link_legacy_provider_blocked/);
  assert.equal(calls,0);
});

test('rejects successful responses that are not browser landing content',async()=>{
  await assert.rejects(()=>preflightPublicLink({
    url:'https://example.com/product.json',
    fetchImpl:async()=>response(200,'{"ok":true}',{'content-type':'application/json'}),
  }),/clip_public_link_non_browsable_content_type/);
});


test('blocks developer repository pages from customer publication links',async()=>{
  let calls=0;
  await assert.rejects(()=>preflightPublicLink({
    url:'https://github.com/example/repo/tree/main/public/product',
    fetchImpl:async()=>{calls+=1;return response(200,'<title>repo</title>',{'content-type':'text/html'});},
  }),/clip_public_link_legacy_provider_blocked/);
  assert.equal(calls,0);
});


test('verifies canonical, OpenGraph and Evercraft story identity when required',async()=>{
  const url='https://journal.evercraft.global/cfb-power-rankings-week-6/';
  const body=`<!doctype html><html><head>
    <title>Evercraft College Football Power Rankings</title>
    <link rel="canonical" href="${url}">
    <meta property="og:url" content="${url}">
    <meta property="og:title" content="Evercraft College Football Power Rankings">
    <meta name="evercraft:story_id" content="journal:2026-10-06:cfb-power-rankings-week-6">
  </head><body>Evercraft College Football Power Rankings</body></html>`;
  const result=await preflightPublicLink({
    url,
    expectedText:['Evercraft College Football Power Rankings'],
    expectedCanonicalUrl:url,
    expectedOgUrl:url,
    expectedStoryId:'journal:2026-10-06:cfb-power-rankings-week-6',
    requireCanonicalSelfMatch:true,
    requireOpenGraphSelfMatch:true,
    fetchImpl:async()=>response(200,body,{'content-type':'text/html'}),
  });
  assert.equal(result.verified,true);
  assert.equal(result.identity.canonicalUrl,url);
  assert.equal(result.identity.ogUrl,url);
  assert.equal(result.identity.storyId,'journal:2026-10-06:cfb-power-rankings-week-6');
  assert.equal(result.boundaries.canonicalIdentityVerified,true);
  assert.equal(result.boundaries.openGraphIdentityVerified,true);
  assert.equal(result.boundaries.storyIdentityVerified,true);
});

test('fails closed when a live page points its canonical tag at the wrong article',async()=>{
  const url='https://journal.evercraft.global/cfb-power-rankings-week-6/';
  const body=`<html><head>
    <link rel="canonical" href="https://journal.evercraft.global/wrong-story/">
    <meta property="og:url" content="${url}">
    <meta name="evercraft:story_id" content="journal:2026-10-06:cfb-power-rankings-week-6">
  </head><body>Evercraft College Football Power Rankings</body></html>`;
  await assert.rejects(()=>preflightPublicLink({
    url,
    expectedCanonicalUrl:url,
    expectedStoryId:'journal:2026-10-06:cfb-power-rankings-week-6',
    fetchImpl:async()=>response(200,body,{'content-type':'text/html'}),
  }),/clip_public_link_canonical_mismatch/);
});

test('fails closed when the article identity meta belongs to a different story',async()=>{
  const url='https://journal.evercraft.global/cfb-power-rankings-week-6/';
  const body=`<html><head>
    <link rel="canonical" href="${url}">
    <meta property="og:url" content="${url}">
    <meta name="evercraft:story_id" content="journal:wrong-story">
  </head><body>Evercraft College Football Power Rankings</body></html>`;
  await assert.rejects(()=>preflightPublicLink({
    url,
    expectedCanonicalUrl:url,
    expectedOgUrl:url,
    expectedStoryId:'journal:2026-10-06:cfb-power-rankings-week-6',
    fetchImpl:async()=>response(200,body,{'content-type':'text/html'}),
  }),/clip_public_link_story_id_mismatch/);
});
