import assert from 'node:assert/strict';
import test from 'node:test';
import { publishCfbJournalToFacebook } from './cfb-clip-facebook-publish.mjs';

function handoff(){
  const canonical='https://journal.evercraft.global/college-football-power-rankings-2026-10-06/';
  return {
    schema:'evercraft.clip.journal-handoff.v1',
    story_id:'journal:2026-10-06:cfb-power-rankings',
    slug:'college-football-power-rankings-2026-10-06',
    title:'Evercraft College Football Power Rankings: Alabama Is No. 1',
    canonical_url:canonical,
    publication_receipt_ref:'receipts/college-football-power-rankings-2026-10-06.json',
    publication_authority:false,
    source_refs:['ncaa-fbs-scoreboard','evercraft-cfb-edition-evidence'],
    derivatives:[
      {platform:'facebook',copy:'The Evercraft College Football Power Rankings are live.'},
    ],
    link_verification:{
      expectedText:['Evercraft College Football Power Rankings'],
      expectedCanonicalUrl:canonical,
      expectedOgUrl:canonical,
      expectedStoryId:'journal:2026-10-06:cfb-power-rankings',
      requireCanonicalSelfMatch:true,
      requireOpenGraphSelfMatch:true,
    },
  };
}

function pageBody(canonical=handoff().canonical_url){
  return '<html><head>'+
    '<title>Evercraft College Football Power Rankings: Alabama Is No. 1</title>'+
    '<link rel="canonical" href="'+canonical+'">'+
    '<meta property="og:url" content="'+canonical+'">'+
    '<meta name="evercraft:story_id" content="journal:2026-10-06:cfb-power-rankings">'+
    '</head><body>Evercraft College Football Power Rankings</body></html>';
}

function okPageFetch(canonical=handoff().canonical_url){
  return async()=>({
    status:200,
    headers:new Headers({'content-type':'text/html'}),
    async text(){return pageBody(canonical);},
  });
}

function resolvedCredential(){
  return {
    config:{pageId:'page-1',pageAccessToken:'secret'},
    safe_status:{facebook:'resolved',secret_material_returned:false},
  };
}

test('publishes through Evercraft Clip only after Journal identity verification and repeats canonical postflight',async()=>{
  let publishes=0;
  const receipt=await publishCfbJournalToFacebook({
    handoff:handoff(),
    fetchImpl:okPageFetch(),
    resolveCredential:resolvedCredential,
    adapterFactory:()=>({
      destination:'facebook-page',
      verified:true,
      async publish(input){
        publishes+=1;
        assert.equal(input.metadata.link,handoff().canonical_url);
        return {
          state:'published',
          remoteId:'page-1_post-1',
          url:'https://www.facebook.com/page-1/posts/post-1',
          sourceRefs:['provider:test-facebook'],
        };
      },
    }),
  });
  assert.equal(receipt.status,'published');
  assert.equal(publishes,1);
  assert.equal(receipt.publicLinkPreflight.identity.storyId,'journal:2026-10-06:cfb-power-rankings');
  assert.equal(receipt.canonicalPostflight.verified,true);
  assert.equal(receipt.boundaries.canonicalPostflightVerified,true);
  assert.equal(receipt.boundaries.journalReceiptBound,true);
});

test('wrong canonical identity blocks the provider adapter before publication',async()=>{
  let publishes=0;
  const receipt=await publishCfbJournalToFacebook({
    handoff:handoff(),
    fetchImpl:okPageFetch('https://journal.evercraft.global/wrong-story/'),
    resolveCredential:resolvedCredential,
    adapterFactory:()=>({
      destination:'facebook-page',
      verified:true,
      async publish(){
        publishes+=1;
        throw new Error('must_not_publish');
      },
    }),
  });
  assert.equal(receipt.status,'failed');
  assert.match(receipt.error,/canonical_mismatch/);
  assert.equal(publishes,0);
});

test('missing Evercraft credential blocks publication before link or provider work',async()=>{
  let adapterBuilt=false;
  await assert.rejects(()=>publishCfbJournalToFacebook({
    handoff:handoff(),
    fetchImpl:async()=>{throw new Error('must_not_fetch');},
    resolveCredential:()=>({config:{},safe_status:{facebook:'credential_missing'}}),
    adapterFactory:()=>{adapterBuilt=true;throw new Error('must_not_build');},
  }),/credential_unavailable:credential_missing/);
  assert.equal(adapterBuilt,false);
});
