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

test('publishes through a verified social adapter and binds a content digest',async()=>{
  let calls=0;
  const receipt=await publishClipSocialPost({
    request:request(),
    adapters:[{
      destination:'facebook-page',
      verified:true,
      async publish(input){
        calls+=1;
        assert.equal(input.brandKey,'havenly-cleaning');
        assert.match(input.contentDigest,/^[a-f0-9]{64}$/);
        return {
          state:'published',
          remoteId:'123_456',
          url:'https://www.facebook.com/123/posts/456',
          sourceRefs:['provider:facebook-graph-api-v26'],
        };
      },
    }],
    policy:{
      allowPublishing:true,
      allowedDestinations:['facebook-page'],
      blockedBrandKeys:['rnb-chicken-and-soul'],
    },
  });
  assert.equal(receipt.status,'published');
  assert.equal(receipt.remoteId,'123_456');
  assert.equal(receipt.boundaries.contentDigestBound,true);
  assert.equal(calls,1);
});

test('blocked brands stop before the social adapter runs',async()=>{
  let called=false;
  const req=request();
  req.brandKey='rnb-chicken-and-soul';
  await assert.rejects(()=>publishClipSocialPost({
    request:req,
    adapters:[{destination:'facebook-page',verified:true,async publish(){called=true;}}],
    policy:{
      allowPublishing:true,
      allowedDestinations:['facebook-page'],
      blockedBrandKeys:['rnb-chicken-and-soul'],
    },
  }),/clip_social_publish_policy_brand_blocked/);
  assert.equal(called,false);
});

test('unverified social adapters cannot publish',async()=>{
  await assert.rejects(()=>publishClipSocialPost({
    request:request(),
    adapters:[{destination:'facebook-page',verified:false,async publish(){throw new Error('no');}}],
    policy:{
      allowPublishing:true,
      allowedDestinations:['facebook-page'],
      blockedBrandKeys:[],
    },
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
    policy:{
      allowPublishing:true,
      allowedDestinations:['facebook-page'],
      blockedBrandKeys:[],
    },
  });
  assert.equal(receipt.status,'failed');
  assert.match(receipt.error,/meta_down/);
  assert.equal('remoteId' in receipt,false);
  assert.equal(receipt.boundaries.publicationStateAssertedFromProviderResponse,false);
});
