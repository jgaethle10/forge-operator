import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectClipFacebookConnection} from './facebook-page-connection-diagnostic.mjs';

const secret='highly-private-token-never-return-ABC123';
const pageId='1253915241138545';
const resolver=()=>({safe_status:{facebook:'resolved'},config:{pageId,pageAccessToken:secret}});
const response=(status,body)=>({status,async json(){return body;}});
const fakeFetch=(requests,{pageBody={id:pageId,name:'Evercraft'},postBody={data:[]},readStatus=200}={})=>
  async (url,options)=>{
    requests.push({url,options});
    assert.equal(options.method,'GET');
    assert.equal(options.headers.Authorization,'Bearer '+secret);
    assert.equal(options.redirect,'error');
    if(url.includes('published_posts'))return response(readStatus,postBody);
    return response(200,pageBody);
  };

test('two Meta GETs verify Page identity and Page reads but never claim write access',async()=>{
  const requests=[];
  const result=await inspectClipFacebookConnection({
    credentialStateDir:'/fake/private',resolver,fetchImpl:fakeFetch(requests)
  });
  assert.equal(result.state,'read_only_verified_write_unverified');
  assert.equal(result.page_identity_verified,true);
  assert.equal(result.page_content_read_verified,true);
  assert.equal(result.publish_permission_verified,false);
  assert.equal(result.provider_mutation_attempted,false);
  assert.equal(result.publish_performed,false);
  assert.equal(result.page_id,pageId);
  assert.equal(result.page_name,'Evercraft');
  assert.equal(requests.length,2);
  assert.deepEqual(requests.map(x=>x.options.method),['GET','GET']);
  assert.equal(JSON.stringify(result).includes(secret),false);
});
test('incorrect Page identity stops without probing posts',async()=>{
  const requests=[];
  const result=await inspectClipFacebookConnection({
    credentialStateDir:'/fake/private',resolver,fetchImpl:fakeFetch(requests,{
      pageBody:{id:'999999999999999',name:'Evercraft'}
    })
  });
  assert.equal(result.state,'page_identity_mismatch');
  assert.equal(result.page_identity_verified,false);
  assert.equal(requests.length,1);
});
test('unrelated Page brand is a hold, even with a syntactically valid Page ID',async()=>{
  const requests=[];
  const result=await inspectClipFacebookConnection({
    credentialStateDir:'/fake/private',resolver,fetchImpl:fakeFetch(requests,{
      pageBody:{id:pageId,name:'ChristmasLightsUSA'}
    })
  });
  assert.equal(result.state,'page_brand_requires_review');
  assert.equal(result.page_identity_verified,true);
  assert.equal(result.company_brand_name_match,false);
  assert.equal(requests.length,1);
});
test('Meta read denial classifies missing read access without returning raw provider body',async()=>{
  const requests=[];
  const result=await inspectClipFacebookConnection({
    credentialStateDir:'/fake/private',resolver,fetchImpl:fakeFetch(requests,{
      readStatus:403,postBody:{error:{message:'secret '+secret,code:200}}
    })
  });
  assert.equal(result.state,'page_content_read_denied');
  assert.equal(result.meta_error_code,200);
  assert.equal(result.page_content_read_verified,false);
  assert.equal(JSON.stringify(result).includes(secret),false);
});
test('expired credential is diagnosed with safe code only',async()=>{
  const result=await inspectClipFacebookConnection({
    credentialStateDir:'/fake/private',resolver,
    fetchImpl:async()=>response(401,{error:{code:190,message:'token '+secret}})
  });
  assert.equal(result.state,'page_identity_read_denied');
  assert.equal(result.meta_error_code,190);
  assert.equal(result.next_action,'renew_page_access_token');
  assert.equal(JSON.stringify(result).includes(secret),false);
});
test('missing or ambiguous vault credentials make no provider calls',async()=>{
  let calls=0;
  const fetchImpl=async()=>{calls++;throw Error('provider must not be called');};
  const missing=await inspectClipFacebookConnection({credentialStateDir:'',fetchImpl});
  assert.equal(missing.state,'credential_vault_not_configured');
  const ambiguous=await inspectClipFacebookConnection({
    credentialStateDir:'/fake/private',fetchImpl,
    resolver:()=>({safe_status:{facebook:'credential_selection_ambiguous',candidate_count:3},config:{}})
  });
  assert.equal(ambiguous.state,'credential_selection_ambiguous');
  assert.equal(ambiguous.credential_candidate_count,3);
  assert.equal(calls,0);
});
test('network exceptions are safe and never interpreted as posting scope',async()=>{
  const result=await inspectClipFacebookConnection({
    credentialStateDir:'/fake/private',resolver,
    fetchImpl:async()=>{throw Error('Bearer '+secret);}
  });
  assert.equal(result.state,'provider_network_unavailable');
  assert.equal(result.publish_permission_verified,false);
  assert.equal(JSON.stringify(result).includes(secret),false);
});
