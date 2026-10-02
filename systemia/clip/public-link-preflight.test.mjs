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
