import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  journalStoryResourceRef,
  journalClipHandoffPath,
  publishJournalStoryFacebookFromHome,
} from './clip-journal-publish-adapter.mjs';

function fixtureRoot(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'home-clip-journal-'));
  const slug='college-football-power-rankings-2026-10-06';
  const dir=path.join(root,'public','journal','production',slug);
  fs.mkdirSync(dir,{recursive:true});
  const canonical='https://journal.evercraft.global/'+slug+'/';
  fs.writeFileSync(path.join(dir,'clip-handoff.json'),JSON.stringify({
    schema:'evercraft.clip.journal-handoff.v1',
    story_id:'journal:2026-10-06:cfb-power-rankings',
    slug,
    title:'Evercraft College Football Power Rankings: Alabama Is No. 1',
    canonical_url:canonical,
    publication_authority:false,
    derivatives:[{platform:'facebook',copy:'The rankings are live.'}],
    link_verification:{
      expectedText:['Evercraft College Football Power Rankings'],
      expectedCanonicalUrl:canonical,
      expectedOgUrl:canonical,
      expectedStoryId:'journal:2026-10-06:cfb-power-rankings',
      requireCanonicalSelfMatch:true,
      requireOpenGraphSelfMatch:true,
    },
  },null,2));
  return {root,slug,canonical};
}

test('Journal Clip Home adapter derives a fixed story resource and never accepts a URL',async()=>{
  const {root,slug,canonical}=fixtureRoot();
  try{
    let seen=null;
    const receipt=await publishJournalStoryFacebookFromHome({
      repoRoot:root,
      slug,
      credentialStateDir:path.join(root,'credentials'),
      stateRoot:fs.mkdtempSync(path.join(os.tmpdir(),'clip-journal-claims-')),
      authorizationRef:'policy:test',
      publisher:async(input)=>{
        seen=input;
        return {
          status:'published',
          remoteId:'page_post',
          url:'https://www.facebook.com/page/posts/post',
          authorizationRef:'policy:test',
          publicLinkPreflight:{verified:true},
          canonicalPostflight:{verified:true},
          boundaries:{journalReceiptBound:true,canonicalPostflightVerified:true},
        };
      },
    });
    assert.equal(seen.handoff.canonical_url,canonical);
    assert.equal(receipt.resource_ref,'journal-story:'+slug);
    assert.equal(receipt.canonical_url,canonical);
    assert.equal(receipt.boundaries.arbitraryUrlInputAccepted,false);
    assert.equal(receipt.boundaries.secretMaterialReturned,false);
    assert.equal(receipt.boundaries.canonicalPreflightVerified,true);
    assert.equal(receipt.boundaries.canonicalPostflightVerified,true);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('Journal Clip Home adapter blocks traversal-shaped slugs before filesystem access',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'home-clip-journal-'));
  try{
    assert.throws(()=>journalClipHandoffPath(root,'../../secrets'),/slug_invalid/);
    assert.throws(()=>journalStoryResourceRef('https://evil.example/post'),/slug_invalid/);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('Journal Clip Home adapter refuses a handoff whose embedded slug does not match the requested resource',async()=>{
  const {root,slug}=fixtureRoot();
  try{
    const file=journalClipHandoffPath(root,slug);
    const handoff=JSON.parse(fs.readFileSync(file,'utf8'));
    handoff.slug='another-story';
    fs.writeFileSync(file,JSON.stringify(handoff));
    await assert.rejects(()=>publishJournalStoryFacebookFromHome({
      repoRoot:root,
      slug,
      credentialStateDir:path.join(root,'credentials'),
      publisher:async()=>{throw new Error('must_not_publish');},
    }),/handoff_slug_mismatch/);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('a second Home publish call cannot submit the same story twice',async()=>{
  const {root,slug}=fixtureRoot(),stateRoot=fs.mkdtempSync(path.join(os.tmpdir(),'clip-journal-claim-'));
  try{
    let calls=0;
    const opts={repoRoot:root,slug,credentialStateDir:path.join(root,'credentials'),
      stateRoot,authorizationRef:'passport-grant:test',publisher:async()=>{
        calls++;return {status:'published',remoteId:'123_456',
          url:'https://www.facebook.com/123/posts/456',authorizationRef:'passport-grant:test'};}};
    const first=await publishJournalStoryFacebookFromHome(opts);
    const second=await publishJournalStoryFacebookFromHome(opts);
    assert.equal(first.state,'published');
    assert.equal(second.state,'duplicate_or_reconciliation_hold');
    assert.equal(second.automatic_retry_allowed,false);
    assert.equal(second.provider_remote_id,'123_456');
    assert.equal(calls,1);
    assert.equal(fs.readdirSync(stateRoot).filter(x=>x.endsWith('.json')).length,1);
  }finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(stateRoot,{recursive:true,force:true});}
});
test('an uncertain provider failure leaves a claim and forbids blind resubmission',async()=>{
  const {root,slug}=fixtureRoot(),stateRoot=fs.mkdtempSync(path.join(os.tmpdir(),'clip-journal-claim-'));
  try{
    let calls=0;
    const opts={repoRoot:root,slug,stateRoot,
      credentialStateDir:path.join(root,'credentials'),publisher:async()=>{
        calls++;throw Error('provider timeout after POST');}};
    const first=await publishJournalStoryFacebookFromHome(opts);
    const second=await publishJournalStoryFacebookFromHome(opts);
    assert.equal(first.state,'reconciliation_required');
    assert.equal(first.provider_may_have_published,true);
    assert.equal(first.automatic_retry_allowed,false);
    assert.equal(second.state,'duplicate_or_reconciliation_hold');
    assert.equal(calls,1);
    const contents=fs.readFileSync(path.join(stateRoot,slug+'.json'),'utf8');
    assert.ok(!contents.includes('provider timeout'));
  }finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(stateRoot,{recursive:true,force:true});}
});
test('no durable claim directory means no provider POST',async()=>{
  const {root,slug}=fixtureRoot();
  try{
    let calls=0;
    await assert.rejects(publishJournalStoryFacebookFromHome({repoRoot:root,slug,stateRoot:'',
      credentialStateDir:path.join(root,'credentials'),publisher:async()=>{calls++;}}),
      /durable_state_root_required/);
    assert.equal(calls,0);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('source repository cannot be used as the durable claim store',async()=>{
  const {root,slug}=fixtureRoot();
  try{
    await assert.rejects(publishJournalStoryFacebookFromHome({repoRoot:root,slug,stateRoot:path.join(root,'clip-attempts'),
      credentialStateDir:path.join(root,'credentials'),publisher:async()=>{throw Error('must not publish');}}),
      /outside_repository/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
