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
