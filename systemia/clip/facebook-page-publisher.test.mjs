import assert from 'node:assert/strict';
import test from 'node:test';
import { createFacebookPagePublisherAdapter } from './facebook-page-publisher.mjs';

function response(status,body={}){
  return {
    status,
    async text(){return JSON.stringify(body);},
    async json(){return body;},
  };
}

test('publishes a Facebook Page feed post and verifies its permalink',async()=>{
  const calls=[];
  const fetchImpl=async(url,init={})=>{
    calls.push({url,init});
    if(init.method==='POST'){
      return response(200,{id:'123_456'});
    }
    if(init.method==='GET'){
      return response(200,{id:'123_456',permalink_url:'https://www.facebook.com/123/posts/456'});
    }
    throw new Error('unexpected request');
  };

  const adapter=createFacebookPagePublisherAdapter({
    pageId:'123',
    pageAccessToken:'token',
    verified:true,
    allowPublish:true,
    fetchImpl,
  });

  const result=await adapter.publish({
    requestId:'fb-1',
    brandKey:'havenly-cleaning',
    authorizationRef:'policy:havenly-autopublish-v1',
    contentDigest:'a'.repeat(64),
    metadata:{
      message:'Recurring cleaning openings are live.',
      link:'https://havenlycleaning.com/Intake',
    },
  });

  assert.equal(result.state,'published');
  assert.equal(result.remoteId,'123_456');
  assert.equal(result.url,'https://www.facebook.com/123/posts/456');
  assert.equal(calls.length,2);
  assert.match(calls[0].url,/\/v26\.0\/123\/feed$/);
  assert.equal(calls[0].init.headers.Authorization,'Bearer token');
  const body=new URLSearchParams(calls[0].init.body);
  assert.equal(body.get('message'),'Recurring cleaning openings are live.');
  assert.equal(body.get('link'),'https://havenlycleaning.com/Intake');
  assert.equal(body.get('published'),'true');
});

test('publishing requires explicit adapter authorization before network calls',async()=>{
  let called=false;
  const adapter=createFacebookPagePublisherAdapter({
    pageId:'123',
    pageAccessToken:'token',
    verified:true,
    allowPublish:false,
    fetchImpl:async()=>{called=true;throw new Error('should not call');},
  });
  await assert.rejects(()=>adapter.publish({
    metadata:{message:'No'},
    brandKey:'havenly-cleaning',
  }),/facebook_publish_not_authorized/);
  assert.equal(called,false);
});

test('missing Page access token fails closed before network calls',async()=>{
  let called=false;
  const adapter=createFacebookPagePublisherAdapter({
    pageId:'123',
    verified:true,
    allowPublish:true,
    fetchImpl:async()=>{called=true;throw new Error('should not call');},
  });
  await assert.rejects(()=>adapter.publish({
    metadata:{message:'No'},
    brandKey:'havenly-cleaning',
  }),/facebook_page_access_token_missing/);
  assert.equal(called,false);
});

test('provider response without a post id is not treated as published',async()=>{
  const adapter=createFacebookPagePublisherAdapter({
    pageId:'123',
    pageAccessToken:'token',
    verified:true,
    allowPublish:true,
    fetchImpl:async()=>response(200,{}),
  });
  await assert.rejects(()=>adapter.publish({
    metadata:{message:'No receipt, no publish claim'},
    brandKey:'havenly-cleaning',
  }),/facebook_post_id_missing/);
});

test('Facebook adapter refuses a Base44 link even if the runtime is bypassed',async()=>{
  let called=false;
  const adapter=createFacebookPagePublisherAdapter({
    pageId:'123',
    pageAccessToken:'token',
    verified:true,
    allowPublish:true,
    fetchImpl:async()=>{called=true;return response(200,{id:'123_456'});},
  });
  await assert.rejects(()=>adapter.publish({
    metadata:{
      message:'This must never publish.',
      link:'https://peak-eps-calc.base44.app/',
    },
    brandKey:'eps',
  }),/clip_public_link_legacy_provider_blocked/);
  assert.equal(called,false);
});

test('POST without confirmed GET is held with a remote id, never a fabricated URL',async()=>{
  const adapter=createFacebookPagePublisherAdapter({
    pageId:'123',pageAccessToken:'token',verified:true,allowPublish:true,
    fetchImpl:async(url,init)=>{
      if(init.method==='POST')return response(200,{id:'123_456'});
      return response(403,{error:'reauthorization required'});
    }
  });
  const result=await adapter.publish({metadata:{message:'A verified post is required.'}});
  assert.equal(result.state,'reconciliation_required');
  assert.equal(result.remoteId,'123_456');
  assert.equal(result.providerMayHavePublished,true);
  assert.equal('url' in result,false);
  assert.equal(result.reason,'post_readback_http_not_ok');
});
test('a malicious or mismatched permalink cannot count as published',async()=>{
  for(const readback of [
    {id:'123_789',permalink_url:'https://www.facebook.com/123/posts/456'},
    {id:'123_456',permalink_url:'https://other.example/spoof'},
    {id:'123_456',permalink_url:'http://www.facebook.com/123/posts/456'},
    {id:'123_456',permalink_url:'https://www.facebook.com/'}
  ]){
    const adapter=createFacebookPagePublisherAdapter({
      pageId:'123',pageAccessToken:'token',verified:true,allowPublish:true,
      fetchImpl:async(url,init)=>init.method==='POST'?response(200,{id:'123_456'}):response(200,readback)
    });
    const result=await adapter.publish({metadata:{message:'Do not fake the post.'}});
    assert.equal(result.state,'reconciliation_required');
    assert.equal('url' in result,false);
  }
});
