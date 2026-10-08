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
    pageId:'page-1',pageAccessToken:'secret',verified:true,allowPublish:true,
    fetchImpl:async(url,init)=>{
      calls.push({url,init});
      if(String(url).includes('/photos')) return {status:200,async text(){return JSON.stringify({post_id:'page-1_post-7',id:'photo-7'});}};
      return {status:200,async text(){return JSON.stringify({permalink_url:'https://www.facebook.com/page-1/posts/post-7'});}};
    },
  });
  const receipt=await adapter.publish({imageBytes:renderSpaceDudzSocialPng({candidate:{label:'A',concept:'moon_motel'}}),mimeType:'image/png',caption:'vote A',contentDigest:'sha256:test'});
  assert.equal(receipt.state,'published');
  assert.equal(receipt.remoteId,'page-1_post-7');
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
