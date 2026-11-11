import test from 'node:test';
import assert from 'node:assert/strict';
import { createLinkedInOrganizationPublisherAdapter } from './linkedin-organization-publisher.mjs';
import { publishClipSocialPost } from './social-publisher-runtime.mjs';

const ID='urn:li:share:6844785523593134080';
const ORG='urn:li:organization:5515715';
const MESSAGE='Evercraft Work Saban runs bounded calculations in software.';
const LINK='https://fabric.systemiacommandcenters.com/journal/example/';
function input(){
  return {
    requestId:'journal-example-linkedin',
    brandKey:'evercraft-journal',
    authorizationRef:'passport:authorized-journal-example-linkedin',
    contentDigest:'a'.repeat(64),
    metadata:{message:MESSAGE,link:LINK},
  };
}
function config(overrides={}){
  return {
    organizationId:'5515715',
    accessToken:'private-test-token',
    linkedinVersion:'202609',
    verified:true,allowPublish:true,
    allowedOrganizationIds:['5515715'],
    allowedBrandKeys:['evercraft-journal'],
    organizationAccessVerified:true,
    writePermissionVerified:true,
    readPermissionVerified:true,
    verifyAuthority:async()=>({approved:true,grantRef:'issuer-backed-grant'}),
    claimPublish:async()=>({status:'claimed',receiptRef:'durable-private-claim'}),
    ...overrides,
  };
}
function created(id=ID){
  return new Response(null,{status:201,headers:{'x-restli-id':id}});
}
function readback(body={}){
  return new Response(JSON.stringify({
    id:ID,author:ORG,commentary:MESSAGE+'\n\n'+LINK,
    lifecycleState:'PUBLISHED',visibility:'PUBLIC',
    distribution:{feedDistribution:'MAIN_FEED'},...body,
  }),{status:200,headers:{'content-type':'application/json'}});
}

test('publishes to correct organization only after durable claim and READER readback',async()=>{
  const calls=[],steps=[];
  const adapter=createLinkedInOrganizationPublisherAdapter(config({
    async verifyAuthority(a){steps.push('authority');assert.equal(a.organizationId,'5515715');assert.equal(a.contentDigest,'a'.repeat(64));return {approved:true,grantRef:'signed'};},
    async claimPublish(a){steps.push('claim');assert.equal(a.requestId,'journal-example-linkedin');return {status:'claimed',receiptRef:'durable'};},
    async fetchImpl(url,opts){
      calls.push({url,opts}); steps.push(opts.method);
      if(opts.method==='POST')return created();
      return readback();
    }
  }));
  const receipt=await adapter.publish(input());
  assert.deepEqual(steps,['authority','claim','POST','GET']);
  assert.equal(receipt.state,'published');
  assert.equal(receipt.remoteId,ID);
  assert.equal(receipt.url,'https://www.linkedin.com/feed/update/'+ID+'/');
  assert.equal(receipt.externalAnonymousVisibilityVerified,false);
  assert.equal(calls[0].url,'https://api.linkedin.com/rest/posts');
  assert.equal(calls[0].opts.redirect,'error');
  assert.equal(calls[0].opts.headers.Authorization,'Bearer private-test-token');
  assert.equal(calls[0].opts.headers['Linkedin-Version'],'202609');
  const p=JSON.parse(calls[0].opts.body);
  assert.equal(p.author,ORG);assert.equal(p.commentary,MESSAGE+'\n\n'+LINK);
  assert.equal(p.lifecycleState,'PUBLISHED');
  assert.equal(calls[1].url,'https://api.linkedin.com/rest/posts/'+encodeURIComponent(ID)+'?viewContext=READER');
});

test('fails closed before provider on missing rights or brand, including a spoofed author',async()=>{
  const configurations=[
    {organizationAccessVerified:false},
    {writePermissionVerified:false},
    {readPermissionVerified:false},
    {allowedOrganizationIds:['99999']},
    {allowedBrandKeys:['other-brand']},
    {allowPublish:false},
    {verified:false},
    {linkedinVersion:''},
    {accessToken:''},
    {verifyAuthority:undefined},
    {claimPublish:undefined},
  ];
  for(const change of configurations){
    let calls=0;
    const a=createLinkedInOrganizationPublisherAdapter(config({...change,fetchImpl:async()=>{calls++;throw Error('no');}}));
    await assert.rejects(()=>a.publish(input()),/clip_linkedin_/);
    assert.equal(calls,0,JSON.stringify(change));
  }
});

test('issuer denial or duplicate claim blocks publication, even with caller "approved"',async()=>{
  for(const change of [
    {verifyAuthority:async()=>({approved:false})},
    {claimPublish:async()=>({status:'duplicate_or_reconciliation_hold'})},
  ]){
    let calls=0;
    const adapter=createLinkedInOrganizationPublisherAdapter(config({...change,fetchImpl:async()=>{calls++;return created();}}));
    await assert.rejects(()=>adapter.publish(input()),/clip_linkedin_/);
    assert.equal(calls,0);
  }
});

test('a POST timeout becomes a permanent reconciliation hold, not a blind retry',async()=>{
  let calls=0;
  const adapter=createLinkedInOrganizationPublisherAdapter(config({
    fetchImpl:async()=>{calls++;throw Error('timeout with secret private-test-token');}
  }));
  const a=await adapter.publish(input());
  assert.equal(a.state,'reconciliation_required');
  assert.equal(a.automaticRetryAllowed,false);
  assert.equal(a.providerMayHavePublished,true);
  assert.equal(a.remoteId,null);
  assert.equal(calls,1);
  assert.doesNotMatch(JSON.stringify(a),/private-test-token/);
});

test('successful POST with unavailable readback preserves remote URN but not published state',async()=>{
  const adapter=createLinkedInOrganizationPublisherAdapter(config({
    fetchImpl:async(url,opts)=>opts.method==='POST'?created():new Response('{}',{status:403}),
  }));
  const a=await adapter.publish(input());
  assert.equal(a.state,'reconciliation_required');
  assert.equal(a.remoteId,ID);
  assert.equal(a.url,null);
  assert.equal(a.automaticRetryAllowed,false);
});

test('mismatched organization, commentary, published state, and ID never produce a public link',async()=>{
  for(const body of [
    {id:'urn:li:share:99999'},
    {author:'urn:li:organization:99999'},
    {commentary:'other message'},
    {lifecycleState:'DRAFT'},
    {visibility:'CONNECTIONS'},
    {distribution:{feedDistribution:'NONE'}},
  ]){
    const adapter=createLinkedInOrganizationPublisherAdapter(config({
      fetchImpl:async(url,opts)=>opts.method==='POST'?created():readback(body),
    }));
    const r=await adapter.publish(input());
    assert.equal(r.state,'reconciliation_required',JSON.stringify(body));
    assert.equal(r.url,null);
  }
});

test('invalid or missing POST URN is a reconciliation hold rather than publication',async()=>{
  for(const id of ['','urn:li:organization:123','urn:li:share:1/evil']){
    const adapter=createLinkedInOrganizationPublisherAdapter(config({fetchImpl:async()=>created(id)}));
    const r=await adapter.publish(input());
    assert.equal(r.state,'reconciliation_required');
    assert.equal(r.remoteId,null);
  }
});

test('no Base44 link or unsafe family content can reach LinkedIn',async()=>{
  for(const metadata of [
    {message:MESSAGE,link:'https://legacy.base44.app/demo'},
    {message:'porn entertainment promotion',link:LINK},
  ]){
    let calls=0;
    const a=createLinkedInOrganizationPublisherAdapter(config({fetchImpl:async()=>{calls++;return created();}}));
    await assert.rejects(()=>a.publish({...input(),metadata}));
    assert.equal(calls,0);
  }
});

test('adapter integrates with the existing Clip runtime on a model-free preflight',async()=>{
  let posted=0;
  const a=createLinkedInOrganizationPublisherAdapter(config({
    fetchImpl:async(url,opts)=>{
      if(opts.method==='POST'){posted++;return created();}
      return readback({commentary:MESSAGE+'\n\n'+LINK});
    },
    claimPublish:async()=>({status:'claimed',receiptRef:'durable'}),
  }));
  const receipt=await publishClipSocialPost({
    request:{
      schema:'evercraft.clip.social-publish-request.v1',
      id:'journal-example-linkedin',destination:'linkedin-organization',
      brandKey:'evercraft-journal',
      authorization:{approved:true,authorizationRef:'passport:authorized-journal-example-linkedin'},
      metadata:{message:MESSAGE,link:LINK,campaign:'journal'},
    },
    adapters:[a],
    policy:{
      allowPublishing:true,allowedDestinations:['linkedin-organization'],blockedBrandKeys:[],
      publicLinkPreflight:{
        fetchImpl:async()=>new Response('<html><title>Evercraft Journal</title><body>Evercraft Journal story</body></html>',{
          status:200,headers:{'content-type':'text/html'}
        }),
      }
    }
  });
  assert.equal(posted,1);
  assert.equal(receipt.status,'published');
  assert.equal(receipt.remoteId,ID);
  assert.equal(receipt.publicLinkPreflight.verified,true);
});
