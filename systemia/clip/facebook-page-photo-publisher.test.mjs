import test from 'node:test';
import assert from 'node:assert/strict';
import {createFacebookPagePhotoPublisherAdapter} from './facebook-page-photo-publisher.mjs';

const response=(status,body)=>({
  status,
  async text(){return JSON.stringify(body);},
  async json(){return body;}
});
function adapter(readback){
  const requests=[];
  return {
    requests,
    publisher:createFacebookPagePhotoPublisherAdapter({
      pageId:'123',pageAccessToken:'fake-test-token',verified:true,allowPublish:true,
      fetchImpl:async(url,init={})=>{
        requests.push({url,method:init.method});
        if(init.method==='POST')return response(200,{id:'789',post_id:'123_456'});
        return readback();
      }
    })
  };
}
const media=new Uint8Array(64).fill(42);
test('photo POST requires authenticated id and permalink readback',async()=>{
  const {publisher,requests}=adapter(()=>response(200,{id:'123_456',permalink_url:'https://www.facebook.com/123/posts/456'}));
  const result=await publisher.publish({imageBytes:media,mimeType:'image/png',caption:'Source-backed image'});
  assert.equal(result.state,'published');
  assert.equal(result.remoteId,'123_456');
  assert.equal(result.url,'https://www.facebook.com/123/posts/456');
  assert.equal(result.readbackVerified,true);
  assert.equal(requests.length,2);
  assert.equal(requests[0].method,'POST');
  assert.equal(requests[1].method,'GET');
});
test('photo POST with unavailable readback is not counted as published',async()=>{
  const {publisher}=adapter(()=>response(403,{error:'permission'}));
  const result=await publisher.publish({imageBytes:media,mimeType:'image/png',caption:'Proof'});
  assert.equal(result.state,'reconciliation_required');
  assert.equal(result.providerMayHavePublished,true);
  assert.equal(result.remoteId,'123_456');
  assert.equal('url' in result,false);
});
test('photo POST with mismatched id or hostile URL is held',async()=>{
  for(const body of [
    {id:'123_999',permalink_url:'https://www.facebook.com/123/posts/456'},
    {id:'123_456',permalink_url:'https://attacker.example/p/456'}
  ]){
    const {publisher}=adapter(()=>response(200,body));
    const result=await publisher.publish({imageBytes:media,caption:'Proof'});
    assert.equal(result.state,'reconciliation_required');
    assert.equal('url' in result,false);
  }
});
