import assert from 'node:assert/strict';
import test from 'node:test';
import { auditFacebookPageLinks } from './facebook-page-link-audit.mjs';

function response(status,body,headers={}){
  return {
    status,
    headers:new Headers(headers),
    async text(){return JSON.stringify(body);},
  };
}

test('finds stale Base44 links in existing Facebook posts without mutating anything',async()=>{
  const graphFetchImpl=async()=>response(200,{
    data:[
      {
        id:'page_post_1',
        message:'Estimator: https://peak-eps-calc.base44.app/',
        permalink_url:'https://www.facebook.com/example/posts/1',
        created_time:'2026-10-02T14:30:00Z',
      },
      {
        id:'page_post_2',
        message:'Healthy: https://example.com/estimator',
        permalink_url:'https://www.facebook.com/example/posts/2',
        created_time:'2026-10-02T14:31:00Z',
      },
    ],
  });

  let publicCalls=0;
  const receipt=await auditFacebookPageLinks({
    pageId:'page',
    pageAccessToken:'token',
    graphFetchImpl,
    publicFetchImpl:async()=>{
      publicCalls+=1;
      return {
        status:200,
        headers:new Headers({'content-type':'text/html'}),
        async text(){return '<title>Estimator</title>';},
      };
    },
  });

  assert.equal(receipt.state,'unsafe_public_links_found');
  assert.equal(receipt.postsScanned,2);
  assert.equal(receipt.unsafeCount,1);
  assert.equal(receipt.unsafe[0].postId,'page_post_1');
  assert.match(receipt.unsafe[0].error,/legacy_provider_blocked/);
  assert.equal(publicCalls,1);
  assert.equal(receipt.destructiveActionTaken,false);
  assert.equal(receipt.accessTokenPersisted,false);
});
