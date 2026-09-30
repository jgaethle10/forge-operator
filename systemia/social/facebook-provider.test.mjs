import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveFacebookPage,
  publishFacebookFeedPost,
  facebookProviderReadiness
} from './facebook-provider.mjs';

function mockFetch(routes){
  return async(url,init={})=>{
    const key=(init.method||'GET')+' '+String(url);
    const row=routes.find((item)=>item.match(key,init));
    if(!row) throw new Error('unexpected_fetch '+key);
    return {
      ok:row.status>=200&&row.status<300,
      status:row.status,
      json:async()=>row.body
    };
  };
}

test('provider readiness does not depend on Base44',()=>{
  const ready=facebookProviderReadiness({
    META_USER_ACCESS_TOKEN:'token',
    META_EPS_PAGE_ID:'123',
    EVERCRAFT_FACEBOOK_PUBLISH_ENABLED:'true'
  });
  assert.equal(ready.base44_connector_required,false);
  assert.equal(ready.ready_for_identity_canary,true);
  assert.equal(ready.ready_for_publish_canary,true);
  assert.doesNotMatch(JSON.stringify(ready),/base44\.app/i);
});

test('page identity requires create-content permission',async()=>{
  const fetchImpl=mockFetch([{
    match:(key)=>key.includes('/v23.0/me/accounts?'),
    status:200,
    body:{data:[{id:'123',name:'EPS',access_token:'page-token',tasks:['CREATE_CONTENT']}]}
  }]);
  const page=await resolveFacebookPage({userAccessToken:'user-token',pageId:'123',fetchImpl});
  assert.equal(page.identity_verified,true);
  assert.equal(page.create_content_authorized,true);
  assert.equal(page.page_name,'EPS');
});

test('publish requires exact provider readback',async()=>{
  const routes=[
    {
      match:(key)=>key.includes('/v23.0/me/accounts?'),
      status:200,
      body:{data:[{id:'123',name:'EPS',access_token:'page-token',tasks:['CREATE_CONTENT']}]}
    },
    {
      match:(key,init)=>key.includes('/v23.0/123/feed')&&(init.method||'GET')==='POST',
      status:200,
      body:{id:'123_456'}
    },
    {
      match:(key)=>key.includes('/v23.0/123_456?fields='),
      status:200,
      body:{id:'123_456',message:'Hello Yakima',permalink_url:'https://facebook.com/123/posts/456',created_time:'2026-09-30T20:00:00+0000'}
    }
  ];
  const result=await publishFacebookFeedPost({
    userAccessToken:'user-token',
    pageId:'123',
    message:'Hello Yakima',
    fetchImpl:mockFetch(routes)
  });
  assert.equal(result.published,true);
  assert.equal(result.verified,true);
  assert.equal(result.readback.exact_message_match,true);
  assert.equal(result.authority.base44_connector_used,false);
});

test('publish is unverified when provider message differs',async()=>{
  const routes=[
    {
      match:(key)=>key.includes('/v23.0/me/accounts?'),
      status:200,
      body:{data:[{id:'123',name:'EPS',access_token:'page-token',tasks:['CREATE_CONTENT']}]}
    },
    {
      match:(key,init)=>key.includes('/v23.0/123/feed')&&(init.method||'GET')==='POST',
      status:200,
      body:{id:'123_456'}
    },
    {
      match:(key)=>key.includes('/v23.0/123_456?fields='),
      status:200,
      body:{id:'123_456',message:'Different copy'}
    }
  ];
  const result=await publishFacebookFeedPost({
    userAccessToken:'user-token',
    pageId:'123',
    message:'Expected copy',
    fetchImpl:mockFetch(routes)
  });
  assert.equal(result.published,true);
  assert.equal(result.verified,false);
});
