import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {
  assertLiveJournalForFacebook,publishGeneralJournalFacebookFromHome
} from './clip-journal-facebook-general.mjs';

const SLUG='code-vs-inference-2026';
const STORY='journal:2026-11-10:code-vs-inference';
const TITLE='AI Helped Build the Software. Code Executes the Task.';
const URL='https://journal.evercraft.global/'+SLUG+'/';
const COPY='We built deterministic software alongside carefully governed AI inference.';
const PAGE='1234567890';

function html(){
  return '<html><head><title>'+TITLE+'</title>'+
    '<link rel="canonical" href="'+URL+'">'+
    '<meta property="og:url" content="'+URL+'">'+
    '<meta property="og:title" content="'+TITLE+'">'+
    '<meta name="evercraft:story_id" content="'+STORY+'">'+
    '</head><body><article>'+TITLE+'</article></body></html>';
}
function fixture(){
  const repoRoot=fs.mkdtempSync(path.join(os.tmpdir(),'clip-facebook-general-repo-'));
  const stateRoot=fs.mkdtempSync(path.join(os.tmpdir(),'clip-facebook-general-claims-'));
  const storyDir=path.join(repoRoot,'public','journal','production',SLUG);
  const receiptDir=path.join(repoRoot,'public','journal','receipts');
  const articleDir=path.join(repoRoot,'public','journal',SLUG);
  for(const dir of [storyDir,receiptDir,articleDir])fs.mkdirSync(dir,{recursive:true});
  const handoff={
    schema:'evercraft.clip.journal-handoff.v1',slug:SLUG,story_id:STORY,
    title:TITLE,canonical_url:URL,publication_authority:false,
    publication_receipt_ref:'receipts/'+SLUG+'.json',
    derivatives:[{platform:'facebook',copy:COPY},{platform:'linkedin',copy:'Different copy.'}],
    link_verification:{
      expectedText:[TITLE],expectedCanonicalUrl:URL,expectedOgUrl:URL,
      expectedStoryId:STORY,requireCanonicalSelfMatch:true,
      requireOpenGraphSelfMatch:true
    },
  };
  fs.writeFileSync(path.join(storyDir,'clip-handoff.json'),JSON.stringify(handoff));
  const article=html();
  fs.writeFileSync(path.join(articleDir,'index.html'),article);
  fs.writeFileSync(path.join(receiptDir,SLUG+'.json'),JSON.stringify({
    schema:'evercraft.journal.publication-receipt.v1',
    slug:SLUG,story_id:STORY,title:TITLE,canonical_url:URL,
    clip_handoff_ref:'production/'+SLUG+'/clip-handoff.json',
    article_sha256:createHash('sha256').update(article).digest('hex'),
    publication_authority:true,publication_state:'live',live_edition_eligible:true,
    editorial_gate:{status:'accepted',score:10},
    production_grade:{status:'accepted',text_primary:false},
    freshness_expires_at:new Date(Date.now()+86400000).toISOString(),
  }));
  return {repoRoot,stateRoot,handoff,receiptDir,
    cleanup(){fs.rmSync(repoRoot,{recursive:true,force:true});fs.rmSync(stateRoot,{recursive:true,force:true});}};
}
function successfulFetch(counter){
  return async(url,init={})=>{
    if(url===URL){
      counter.links++;
      return new Response(html(),{status:200,headers:{'content-type':'text/html'}});
    }
    if(url.includes('/'+PAGE+'/feed')&&init.method==='POST'){
      counter.posts++;
      const fields=new URLSearchParams(init.body);
      assert.equal(fields.get('message'),COPY);
      assert.equal(fields.get('link'),URL);
      assert.equal(init.headers.Authorization,'Bearer private-fb-test-token');
      return new Response(JSON.stringify({id:PAGE+'_98765'}),{status:200});
    }
    if(url.includes(PAGE+'_98765')&&init.method==='GET'){
      counter.reads++;
      return new Response(JSON.stringify({
        id:PAGE+'_98765',permalink_url:'https://www.facebook.com/'+PAGE+'/posts/98765'
      }),{status:200});
    }
    throw Error('unexpected mock request');
  };
}
function options(f,c,opts={}){
  return {
    repoRoot:f.repoRoot,stateRoot:f.stateRoot,slug:SLUG,
    credentialStateDir:'private-vault-required-not-used-in-fixture',
    authorizationRef:'passport-grant:story-authority-12345',
    expectedPageId:PAGE,publisherEnabled:true,writePermissionVerified:true,
    resolveCredential:()=>({
      safe_status:{facebook:'resolved'},
      config:{pageId:PAGE,pageAccessToken:'private-fb-test-token'}
    }),
    fetchImpl:successfulFetch(c),
    ...opts
  };
}

test('general Journal Facebook performs checked code path and preserves duplicate claim',async()=>{
  const f=fixture(),c={links:0,posts:0,reads:0};
  try{
    const first=await publishGeneralJournalFacebookFromHome(options(f,c));
    assert.equal(first.state,'published');
    assert.equal(first.provider_remote_id,PAGE+'_98765');
    assert.equal(first.provider_post_url,'https://www.facebook.com/'+PAGE+'/posts/98765');
    assert.equal(first.durable_claim_recorded,true);
    assert.equal(first.secret_material_returned,false);
    assert.equal(c.posts,1);assert.equal(c.reads,1);
    const next=await publishGeneralJournalFacebookFromHome(options(f,c));
    assert.equal(next.state,'duplicate_or_reconciliation_hold');
    assert.equal(next.automatic_retry_allowed,false);
    assert.equal(c.posts,1);
  }finally{f.cleanup();}
});

test('missing real publication receipt or damaged article hash blocks without provider attempt',async()=>{
  for(const mutation of ['missing','tampered']){
    const f=fixture(),c={links:0,posts:0,reads:0};
    try{
      if(mutation==='missing')fs.unlinkSync(path.join(f.receiptDir,SLUG+'.json'));
      else fs.writeFileSync(path.join(f.repoRoot,'public','journal',SLUG,'index.html'),'tampered');
      await assert.rejects(()=>publishGeneralJournalFacebookFromHome(options(f,c)),/journal_receipt_(missing|unverified)/);
      assert.equal(c.posts,0);assert.equal(fs.readdirSync(f.stateRoot).length,0);
    }finally{f.cleanup();}
  }
});

test('wrong Page identity, missing grant and unpublished permissions fail before any provider POST',async()=>{
  for(const changes of [
    {expectedPageId:'99999999'},
    {authorizationRef:'policy:not-passport'},
    {writePermissionVerified:false},
    {publisherEnabled:false},
    {stateRoot:''},
  ]){
    const f=fixture(),c={links:0,posts:0,reads:0};
    try{
      await assert.rejects(()=>publishGeneralJournalFacebookFromHome(options(f,c,changes)),/clip_facebook_general_/);
      assert.equal(c.posts,0);
    }finally{f.cleanup();}
  }
});

test('Facebook provider readback uncertain requires reconciliation and prohibits retry',async()=>{
  const f=fixture(),c={links:0,posts:0,reads:0};
  try{
    const realFetch=successfulFetch(c);
    const opts=options(f,c,{
      fetchImpl:async(url,init)=>{
        if(init?.method==='GET'&&url.includes(PAGE+'_98765'))
          return new Response('{}',{status:403});
        return realFetch(url,init);
      },
    });
    const first=await publishGeneralJournalFacebookFromHome(opts);
    assert.equal(first.state,'reconciliation_required');
    assert.equal(first.provider_remote_id,PAGE+'_98765');
    assert.equal(first.provider_post_url,null);
    assert.equal(first.manual_reconciliation_required,true);
    const second=await publishGeneralJournalFacebookFromHome(opts);
    assert.equal(second.state,'duplicate_or_reconciliation_hold');
    assert.equal(c.posts,1);
  }finally{f.cleanup();}
});

test('bad live Journal canonical URL blocks a submit before any durable claim',async()=>{
  const f=fixture(),c={links:0,posts:0,reads:0};
  try{
    const opts=options(f,c,{
      fetchImpl:async(url,init)=>url===URL?new Response('not found',{status:404}):successfulFetch(c)(url,init)
    });
    await assert.rejects(()=>publishGeneralJournalFacebookFromHome(opts),/clip_public_link_http_status_404/);
    assert.equal(c.posts,0);
    assert.equal(fs.readdirSync(f.stateRoot).length,0);
  }finally{f.cleanup();}
});

test('expired Journal cannot be promoted as a fresh social story',()=>{
  const f=fixture();
  try{
    const file=path.join(f.receiptDir,SLUG+'.json');
    const receipt=JSON.parse(fs.readFileSync(file,'utf8'));
    receipt.freshness_expires_at='2020-01-01T00:00:00Z';
    fs.writeFileSync(file,JSON.stringify(receipt));
    assert.throws(()=>assertLiveJournalForFacebook({
      repoRoot:f.repoRoot,slug:SLUG,handoff:f.handoff
    }),/journal_receipt_unverified/);
  }finally{f.cleanup();}
});
