import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  discoverCfbJournalHandoffs,
  emptyCfbClipResidentState,
  runCfbJournalPublishCycle,
} from './cfb-journal-resident.mjs';

function journalFixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cfb-clip-resident-'));
  const journalRoot=path.join(root,'public','journal');
  const slug='college-football-power-rankings-2026-10-06';
  const dir=path.join(journalRoot,'production',slug);
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'clip-handoff.json'),JSON.stringify({
    schema:'evercraft.clip.journal-handoff.v1',
    story_id:'journal:2026-10-06:cfb-power-rankings',
    slug,
    title:'Evercraft College Football Power Rankings',
    canonical_url:'https://journal.evercraft.global/'+slug+'/',
    publication_authority:false,
    derivatives:[{platform:'facebook',copy:'CFB rankings are live.'}],
    link_verification:{
      expectedText:['Evercraft College Football Power Rankings'],
      expectedCanonicalUrl:'https://journal.evercraft.global/'+slug+'/',
      expectedOgUrl:'https://journal.evercraft.global/'+slug+'/',
      expectedStoryId:'journal:2026-10-06:cfb-power-rankings',
      requireCanonicalSelfMatch:true,
      requireOpenGraphSelfMatch:true
    }
  },null,2));
  return {root,journalRoot,slug};
}

test('resident discovers only CFB Journal handoffs',()=>{
  const {root,journalRoot,slug}=journalFixture();
  try{
    const other=path.join(journalRoot,'production','other-story');
    fs.mkdirSync(other,{recursive:true});
    fs.writeFileSync(path.join(other,'clip-handoff.json'),JSON.stringify({
      schema:'evercraft.clip.journal-handoff.v1',
      story_id:'journal:other',
      slug:'other-story',
      publication_authority:false
    }));
    const rows=discoverCfbJournalHandoffs(journalRoot);
    assert.equal(rows.length,1);
    assert.equal(rows[0].slug,slug);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('resident publishes one unseen CFB story and records the provider receipt',async()=>{
  const {root,journalRoot}=journalFixture();
  try{
    let calls=0;
    const result=await runCfbJournalPublishCycle({
      journalRoot,
      credentialStateDir:path.join(root,'credentials'),
      inputState:emptyCfbClipResidentState(),
      authorizeStory:async({resource_ref,story_resource_ref,scope})=>({
        decision:'allow',
        grant_id:'grant-cfb-publish',
        resource_ref,
        story_resource_ref,
        scope,
      }),
      now:()=> '2026-10-07T05:30:00.000Z',
      publisher:async()=> {
        calls+=1;
        return {
          status:'published',
          remoteId:'page_post_1',
          url:'https://www.facebook.com/page/posts/1',
          publishedAt:'2026-10-07T05:30:00.000Z',
          publicLinkPreflight:{verified:true},
          canonicalPostflight:{verified:true},
          boundaries:{canonicalPostflightVerified:true,journalReceiptBound:true}
        };
      }
    });
    assert.equal(calls,1);
    assert.equal(result.snapshot.provider_publishes_this_cycle,1);
    const state=Object.values(result.state.stories)[0];
    assert.equal(state.state,'published');
    assert.equal(state.remote_id,'page_post_1');
    assert.equal(state.provider_published,true);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('resident never republishes a story with a terminal provider receipt',async()=>{
  const {root,journalRoot}=journalFixture();
  try{
    let calls=0;
    const first=await runCfbJournalPublishCycle({
      journalRoot,
      credentialStateDir:path.join(root,'credentials'),
      authorizeStory:async({resource_ref,story_resource_ref,scope})=>({
        decision:'allow',
        grant_id:'grant-cfb-publish',
        resource_ref,
        story_resource_ref,
        scope,
      }),
      now:()=> '2026-10-07T05:30:00.000Z',
      publisher:async()=> {
        calls+=1;
        return {
          status:'published_postflight_failed',
          remoteId:'page_post_2',
          url:'https://www.facebook.com/page/posts/2',
          publishedAt:'2026-10-07T05:30:00.000Z',
          publicLinkPreflight:{verified:true},
          boundaries:{canonicalPostflightVerified:false,journalReceiptBound:true},
          postflight_error:'temporary_origin_failure'
        };
      }
    });
    const second=await runCfbJournalPublishCycle({
      journalRoot,
      credentialStateDir:path.join(root,'credentials'),
      inputState:first.state,
      authorizeStory:async({resource_ref,story_resource_ref,scope})=>({
        decision:'allow',
        grant_id:'grant-cfb-publish',
        resource_ref,
        story_resource_ref,
        scope,
      }),
      now:()=> '2026-10-07T05:35:00.000Z',
      publisher:async()=> {
        calls+=1;
        throw new Error('must_not_republish');
      }
    });
    assert.equal(calls,1);
    assert.equal(second.snapshot.provider_publishes_this_cycle,0);
    assert.equal(second.snapshot.published_postflight_failed,1);
    assert.equal(second.snapshot.events[0].action,'skip_terminal');
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('resident leaves preflight failures retryable instead of burning the story',async()=>{
  const {root,journalRoot}=journalFixture();
  try{
    let calls=0;
    const first=await runCfbJournalPublishCycle({
      journalRoot,
      credentialStateDir:path.join(root,'credentials'),
      authorizeStory:async({resource_ref,story_resource_ref,scope})=>({
        decision:'allow',
        grant_id:'grant-cfb-publish',
        resource_ref,
        story_resource_ref,
        scope,
      }),
      now:()=> '2026-10-07T05:30:00.000Z',
      publisher:async()=> {
        calls+=1;
        return {status:'failed',error:'clip_public_link_http_status_404',boundaries:{}};
      }
    });
    assert.equal(Object.values(first.state.stories)[0].state,'failed');
    const second=await runCfbJournalPublishCycle({
      journalRoot,
      credentialStateDir:path.join(root,'credentials'),
      inputState:first.state,
      authorizeStory:async({resource_ref,story_resource_ref,scope})=>({
        decision:'allow',
        grant_id:'grant-cfb-publish',
        resource_ref,
        story_resource_ref,
        scope,
      }),
      now:()=> '2026-10-07T05:35:00.000Z',
      publisher:async()=> {
        calls+=1;
        return {
          status:'published',
          remoteId:'page_post_3',
          url:'https://www.facebook.com/page/posts/3',
          publicLinkPreflight:{verified:true},
          boundaries:{canonicalPostflightVerified:true,journalReceiptBound:true}
        };
      }
    });
    assert.equal(calls,2);
    assert.equal(Object.values(second.state.stories)[0].state,'published');
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});


test('resident holds before vault or provider access when Passport denies the exact story resource',async()=>{
  const {root,journalRoot,slug}=journalFixture();
  try{
    let publishes=0;
    const result=await runCfbJournalPublishCycle({
      journalRoot,
      credentialStateDir:path.join(root,'credentials'),
      authorizeStory:async({resource_ref,story_resource_ref,scope})=>{
        assert.equal(resource_ref,'journal-series:cfb-power-rankings');
        assert.equal(story_resource_ref,'journal-story:'+slug);
        assert.equal(scope,'home.clip.publish');
        return {decision:'deny',reason:'no_active_story_grant'};
      },
      publisher:async()=>{
        publishes+=1;
        throw new Error('must_not_publish');
      },
      now:()=> '2026-10-07T05:30:00.000Z',
    });
    assert.equal(publishes,0);
    assert.equal(result.snapshot.authorization_holds,1);
    assert.equal(result.snapshot.provider_publishes_this_cycle,0);
    assert.equal(result.snapshot.events[0].action,'authorization_hold');
    assert.equal(Object.values(result.state.stories)[0].provider_published,false);
    assert.equal(result.snapshot.boundaries.passportAuthorizationRequired,true);
    assert.equal(result.snapshot.boundaries.seriesResourceAuthorizationRequired,true);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});
