import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {renderSpaceDudzSocialPng} from '../graphics-command/space-dudz-social-raster.mjs';
import {createFacebookPagePhotoPublisherAdapter} from './facebook-page-photo-publisher.mjs';
import {runSpaceDudzPublishCycle,emptySpaceDudzResidentState} from './space-dudz-resident.mjs';

test('Graphics Command renders deterministic PNG bytes without a public image host',()=>{
  const candidate={id:'moon-motel',label:'A',name:'Moon Motel',concept:'moon_motel'};
  const a=renderSpaceDudzSocialPng({candidate,campaign:{campaign_id:'c1'}});
  const b=renderSpaceDudzSocialPng({candidate,campaign:{campaign_id:'c1'}});
  assert.deepEqual(a,b);
  assert.equal(a.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.ok(a.length>1024);
});

test('Facebook photo adapter uploads bytes and returns provider receipt',async()=>{
  const calls=[];
  const adapter=createFacebookPagePhotoPublisherAdapter({
    pageId:'123',pageAccessToken:'secret',verified:true,allowPublish:true,
    fetchImpl:async(url,init)=>{
      calls.push({url,init});
      if(String(url).includes('/photos')) return {status:200,async text(){return JSON.stringify({post_id:'123_456',id:'789'});}};
      return {status:200,async json(){return {id:'123_456',permalink_url:'https://www.facebook.com/123/posts/456'};}};
    },
  });
  const receipt=await adapter.publish({imageBytes:renderSpaceDudzSocialPng({candidate:{label:'A',concept:'moon_motel'}}),mimeType:'image/png',caption:'vote A',contentDigest:'sha256:test'});
  assert.equal(receipt.state,'published');
  assert.equal(receipt.remoteId,'123_456');
  assert.equal(calls.length,2);
  assert.ok(calls[0].init.body instanceof FormData);
});

test('Space Dudz cycle publishes one candidate, then dedupes it on next cycle',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'space-dudz-resident-'));
  const campaignDir=path.join(root,'systemia','clip','campaigns','space-dudz-orbit-one');
  fs.mkdirSync(campaignDir,{recursive:true});
  fs.writeFileSync(path.join(campaignDir,'campaign.json'),JSON.stringify({
    schema:'evercraft.clip.space-dudz-campaign.v1',campaign_id:'c1',poll_id:'p1',brand_key:'space-dudz',resource_ref:'brand:space-dudz',publication_authority:false,creative_system:'evercraft_graphics_command',
    candidates:[
      {id:'a',label:'A',name:'A',concept:'moon_motel',mime_type:'image/png',caption:'A'},
      {id:'b',label:'B',name:'B',concept:'signal_lost',mime_type:'image/png',caption:'B'},
    ],
  }));
  let publications=0;
  const publisher=async({candidate})=>({status:'published',remoteId:'remote-'+candidate.id,url:'https://facebook.test/'+candidate.id,mediaSha256:'hash-'+candidate.id,publishedAt:'2026-10-07T19:00:00Z'});
  const authorize=async()=>({decision:'allow',grant_id:'grant-space-dudz'});
  const first=await runSpaceDudzPublishCycle({repoRoot:root,credentialStateDir:'/tmp/unused',inputState:emptySpaceDudzResidentState(),authorize,publisher:async x=>{publications++;return publisher(x);}});
  assert.equal(first.snapshot.provider_publishes_this_cycle,1);
  assert.equal(first.snapshot.published,1);
  const second=await runSpaceDudzPublishCycle({repoRoot:root,credentialStateDir:'/tmp/unused',inputState:first.state,authorize,publisher:async x=>{publications++;return publisher(x);}});
  assert.equal(second.snapshot.provider_publishes_this_cycle,1);
  assert.equal(second.snapshot.published,2);
  assert.equal(publications,2);
  assert.equal(second.snapshot.events[0].action,'skip_terminal');
});

test('a reconciliation hold never resends the same photo post on the next cycle',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'space-dudz-hold-'));
  const dir=path.join(root,'systemia','clip','campaigns','space-dudz-orbit-one');
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'campaign.json'),JSON.stringify({
    schema:'evercraft.clip.space-dudz-campaign.v1',campaign_id:'c1',poll_id:'p1',
    brand_key:'space-dudz',resource_ref:'brand:space-dudz',
    publication_authority:false,creative_system:'evercraft_graphics_command',
    candidates:[
      {id:'a',label:'A',name:'A',concept:'moon_motel',caption:'A'},
      {id:'b',label:'B',name:'B',concept:'signal_lost',caption:'B'}
    ]
  }));
  let aCalls=0;
  const publisher=async({candidate})=>{
    if(candidate.id==='a'){
      aCalls++;
      return {status:'reconciliation_required',remoteId:'123_456',url:null,reason:'post_readback_http_not_ok'};
    }
    return {status:'published',remoteId:'123_999',url:'https://www.facebook.com/123/posts/999'};
  };
  const authorize=async()=>({decision:'allow',grant_id:'grant-space-dudz'});
  const first=await runSpaceDudzPublishCycle({repoRoot:root,inputState:emptySpaceDudzResidentState(),authorize,publisher});
  assert.equal(first.state.candidates.a.state,'reconciliation_required');
  assert.equal(first.snapshot.manual_reconciliation_holds,1);
  const second=await runSpaceDudzPublishCycle({repoRoot:root,inputState:first.state,authorize,publisher});
  assert.equal(aCalls,1);
  assert.equal(second.snapshot.events[0].action,'manual_reconciliation_hold');
  assert.equal(second.snapshot.published,1);
});
