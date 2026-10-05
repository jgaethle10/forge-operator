import assert from 'node:assert/strict';
import test from 'node:test';
import { publishClipSocialPost } from './social-publisher-runtime.mjs';

function request(){
  return {
    schema:'evercraft.clip.social-publish-request.v1',
    id:'social-1',
    destination:'facebook-page',
    brandKey:'havenly-cleaning',
    authorization:{approved:true,authorizationRef:'policy:havenly-autopublish-v1'},
    metadata:{
      title:'Recurring cleaning openings',
      message:'HAVENLY has opened a small number of recurring cleaning spots.',
      link:'https://havenlycleaning.com/Intake',
      campaign:'havenly-growth',
    },
  };
}

function okResponse(body='<title>Havenly Cleaning</title>'){
  return {
    status:200,
    headers:new Headers({'content-type':'text/html'}),
    async text(){return body;},
  };
}

function policy(fetchImpl=async()=>okResponse()){
  return {
    allowPublishing:true,
    allowedDestinations:['facebook-page'],
    blockedBrandKeys:['rnb-chicken-and-soul'],
    publicLinkPreflight:{fetchImpl},
  };
}

test('publishes only after an anonymous public-link preflight and binds its receipt',async()=>{
  let calls=0;
  const receipt=await publishClipSocialPost({
    request:request(),
    adapters:[{
      destination:'facebook-page',
      verified:true,
      async publish(input){
        calls+=1;
        assert.equal(input.brandKey,'havenly-cleaning');
        assert.equal(input.metadata.link,'https://havenlycleaning.com/Intake');
        assert.match(input.contentDigest,/^[a-f0-9]{64}$/);
        return {
          state:'published',
          remoteId:'123_456',
          url:'https://www.facebook.com/123/posts/456',
          sourceRefs:['provider:facebook-graph-api-v26'],
        };
      },
    }],
    policy:policy(),
  });
  assert.equal(receipt.status,'published');
  assert.equal(receipt.remoteId,'123_456');
  assert.equal(receipt.boundaries.contentDigestBound,true);
  assert.equal(receipt.boundaries.anonymousPublicLinkVerified,true);
  assert.equal(receipt.boundaries.legacyProviderPublicLinksBlocked,true);
  assert.equal(receipt.publicLinkPreflight.verified,true);
  assert.equal(calls,1);
});

test('blocked brands stop before the social adapter runs',async()=>{
  let called=false;
  const req=request();
  req.brandKey='rnb-chicken-and-soul';
  await assert.rejects(()=>publishClipSocialPost({
    request:req,
    adapters:[{destination:'facebook-page',verified:true,async publish(){called=true;}}],
    policy:policy(),
  }),/clip_social_publish_policy_brand_blocked/);
  assert.equal(called,false);
});

test('unverified social adapters cannot publish',async()=>{
  await assert.rejects(()=>publishClipSocialPost({
    request:request(),
    adapters:[{destination:'facebook-page',verified:false,async publish(){throw new Error('no');}}],
    policy:policy(),
  }),/clip_social_publish_verified_adapter_missing/);
});

test('provider failures return failed receipts without inventing publication',async()=>{
  const receipt=await publishClipSocialPost({
    request:request(),
    adapters:[{
      destination:'facebook-page',
      verified:true,
      async publish(){throw new Error('meta_down');},
    }],
    policy:policy(),
  });
  assert.equal(receipt.status,'failed');
  assert.match(receipt.error,/meta_down/);
  assert.equal('remoteId' in receipt,false);
  assert.equal(receipt.boundaries.publicationStateAssertedFromProviderResponse,false);
});

test('Base44 links fail before the provider adapter can run',async()=>{
  let called=false;
  const req=request();
  req.metadata.link='https://peak-eps-calc.base44.app/';
  const receipt=await publishClipSocialPost({
    request:req,
    adapters:[{
      destination:'facebook-page',
      verified:true,
      async publish(){called=true;throw new Error('must_not_publish');},
    }],
    policy:policy(async()=>{throw new Error('must_not_fetch');}),
  });
  assert.equal(receipt.status,'failed');
  assert.match(receipt.error,/clip_public_link_legacy_provider_blocked/);
  assert.equal(called,false);
});

test('dead links fail closed before the provider adapter can run',async()=>{
  let called=false;
  const receipt=await publishClipSocialPost({
    request:request(),
    adapters:[{
      destination:'facebook-page',
      verified:true,
      async publish(){called=true;throw new Error('must_not_publish');},
    }],
    policy:policy(async()=>({
      status:404,
      headers:new Headers({'content-type':'text/html'}),
      async text(){return 'not found';},
    })),
  });
  assert.equal(receipt.status,'failed');
  assert.match(receipt.error,/clip_public_link_http_status_404/);
  assert.equal(called,false);
});

test('publishes the verified final URL after a safe redirect',async()=>{
  let publishedLink='';
  const receipt=await publishClipSocialPost({
    request:request(),
    adapters:[{
      destination:'facebook-page',
      verified:true,
      async publish(input){
        publishedLink=input.metadata.link;
        return {
          state:'published',
          remoteId:'123_789',
          url:'https://www.facebook.com/123/posts/789',
          sourceRefs:['provider:facebook-graph-api-v26'],
        };
      },
    }],
    policy:policy(async(url)=>{
      if(url==='https://havenlycleaning.com/Intake'){
        return {
          status:302,
          headers:new Headers({location:'https://havenlycleaning.com/intake'}),
          async text(){return '';},
        };
      }
      return okResponse();
    }),
  });
  assert.equal(receipt.status,'published');
  assert.equal(publishedLink,'https://havenlycleaning.com/intake');
  assert.equal(receipt.publicLinkPreflight.redirects.length,1);
});
