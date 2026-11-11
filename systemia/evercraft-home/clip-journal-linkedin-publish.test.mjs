import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProviderCredentialVault } from './credential-vault.mjs';
import { startEvercraftHomeServer } from './server.mjs';
import { publishJournalStoryLinkedInFromHome } from './clip-journal-linkedin-publish-adapter.mjs';

const SLUG='source-proof-2026';
const TITLE='How Our Code Works';
const CANONICAL='https://journal.evercraft.global/'+SLUG+'/';
const STORY='journal:2026-11-10:source-proof';
const MESSAGE='Most repeated operations can execute through ordinary software.';
const POST_ID='urn:li:share:6844785523593134080';

function fixture(){
  const repoRoot=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-linkedin-repo-'));
  const stateRoot=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-linkedin-claims-'));
  const credentialStateDir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-linkedin-vault-'));
  const dir=path.join(repoRoot,'public','journal','production',SLUG);
  fs.mkdirSync(dir,{recursive:true});
  const handoff={
    schema:'evercraft.clip.journal-handoff.v1',
    story_id:STORY,slug:SLUG,title:TITLE,canonical_url:CANONICAL,
    publication_authority:false,
    publication_receipt_ref:'receipts/'+SLUG+'.json',
    derivatives:[{platform:'linkedin',copy:MESSAGE}],
    link_verification:{
      expectedText:[TITLE],
      expectedCanonicalUrl:CANONICAL,expectedOgUrl:CANONICAL,
      expectedStoryId:STORY,
      requireCanonicalSelfMatch:true,requireOpenGraphSelfMatch:true,
    }
  };
  fs.writeFileSync(path.join(dir,'clip-handoff.json'),JSON.stringify(handoff));
  const vault=new ProviderCredentialVault({stateDir:credentialStateDir});
  vault.put({provider:'linkedin-organization',environment:'live',label:'evercraft-clip',
    apiKeyId:'urn:li:organization:5515715',
    apiSecret:'linked-in-fixture-token-abcdefghijklmnopqrstuvwxyz',
    actorRef:'test:owner'});
  return {repoRoot,stateRoot,credentialStateDir,close(){
    fs.rmSync(repoRoot,{recursive:true,force:true});
    fs.rmSync(stateRoot,{recursive:true,force:true});
    fs.rmSync(credentialStateDir,{recursive:true,force:true});
  }};
}
function linkHtml(){
  return '<html><head><title>'+TITLE+'</title>' +
    '<link rel="canonical" href="'+CANONICAL+'">' +
    '<meta property="og:url" content="'+CANONICAL+'">' +
    '<meta property="og:title" content="'+TITLE+'">' +
    '<meta name="evercraft:story_id" content="'+STORY+'">' +
    '</head><body><article>'+TITLE+' is an engineering analysis.</article></body></html>';
}
function mockFetch(counter){
  return async(url,opts={})=>{
    if(url===CANONICAL){
      counter.link++;
      return new Response(linkHtml(),{status:200,headers:{'content-type':'text/html'}});
    }
    if(url==='https://api.linkedin.com/rest/posts' && opts.method==='POST'){
      counter.posts++;
      const payload=JSON.parse(opts.body);
      assert.equal(payload.author,'urn:li:organization:5515715');
      assert.equal(payload.commentary,MESSAGE+'\n\n'+CANONICAL);
      assert.equal(opts.headers.Authorization,'Bearer linked-in-fixture-token-abcdefghijklmnopqrstuvwxyz');
      return new Response(null,{status:201,headers:{'x-restli-id':POST_ID}});
    }
    if(url.includes('/rest/posts/') && opts.method==='GET'){
      counter.reads++;
      return new Response(JSON.stringify({
        id:POST_ID,author:'urn:li:organization:5515715',
        commentary:MESSAGE+'\n\n'+CANONICAL,
        lifecycleState:'PUBLISHED',visibility:'PUBLIC',
        distribution:{feedDistribution:'MAIN_FEED'}
      }),{status:200});
    }
    throw Error('unexpected mock URL');
  };
}
function argumentsFor(f,fetchImpl){
  return {
    ...f,slug:SLUG,organizationId:'5515715',
    authorizationRef:'passport-grant:test-owner-real-scope',
    linkedinVersion:'202609',publisherEnabled:true,
    orgAccessVerified:true,writePermissionVerified:true,
    readPermissionVerified:true,fetchImpl
  };
}

test('Owned Home LinkedIn endpoint never publishes in loopback development auth',async()=>{
  const runtime=await startEvercraftHomeServer({
    host:'127.0.0.1',port:0,authMode:'local',credentialStateDir:'',
  });
  try{
    const response=await fetch(runtime.url+'/api/clip/journal/linkedin',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({slug:SLUG}),
    });
    assert.equal(response.status,403);
    const body=await response.json();
    assert.equal(body.state,'clip_linkedin_passport_runtime_required');
    assert.equal(body.publication_performed,false);
  }finally{await runtime.close();}
});

test('Journal LinkedIn publish uses sealed credentials and publisher readback, blocks replay',async()=>{
  const f=fixture(),counter={posts:0,reads:0,link:0};
  try{
    const opts=argumentsFor(f,mockFetch(counter));
    const first=await publishJournalStoryLinkedInFromHome(opts);
    assert.equal(first.state,'published');
    assert.equal(first.provider_remote_id,POST_ID);
    assert.equal(first.provider_post_url,'https://www.linkedin.com/feed/update/'+POST_ID+'/');
    assert.equal(first.durable_claim_recorded,true);
    assert.equal(first.secret_material_returned,false);
    assert.equal(counter.posts,1);assert.equal(counter.reads,1);
    const next=await publishJournalStoryLinkedInFromHome(opts);
    assert.equal(next.state,'duplicate_or_reconciliation_hold');
    assert.equal(next.automatic_retry_allowed,false);
    assert.equal(counter.posts,1);
    const claim=JSON.parse(fs.readFileSync(path.join(f.stateRoot,'linkedin-'+SLUG+'.json'),'utf8'));
    assert.equal(claim.state,'published');
    assert.ok(!JSON.stringify(first).includes('fixture-token'));
  }finally{f.close();}
});

test('Missing writer permissions holds before any claim or LinkedIn POST',async()=>{
  const f=fixture(),counter={posts:0,reads:0,link:0};
  try{
    const r=await publishJournalStoryLinkedInFromHome({
      ...argumentsFor(f,mockFetch(counter)),writePermissionVerified:false
    });
    assert.equal(r.state,'failed');
    assert.equal(counter.posts,0);
    assert.equal(fs.readdirSync(f.stateRoot).length,0);
  }finally{f.close();}
});

test('A Link verification failure prevents both provider POST and durable claim',async()=>{
  const f=fixture(),counter={posts:0,reads:0,link:0};
  try{
    const r=await publishJournalStoryLinkedInFromHome({
      ...argumentsFor(f,async(url,opts)=>{
        if(url===CANONICAL)return new Response('missing',{status:404});
        return mockFetch(counter)(url,opts);
      })
    });
    assert.equal(r.state,'failed');
    assert.equal(counter.posts,0);
    assert.equal(fs.readdirSync(f.stateRoot).length,0);
  }finally{f.close();}
});

test('Unverified private organization mismatch stops before publishing',async()=>{
  const f=fixture(),counter={posts:0,reads:0,link:0};
  try{
    await assert.rejects(()=>publishJournalStoryLinkedInFromHome({
      ...argumentsFor(f,mockFetch(counter)),organizationId:'99999999'
    }),/clip_linkedin_organization_identity_mismatch/);
    assert.equal(counter.posts,0);
  }finally{f.close();}
});
