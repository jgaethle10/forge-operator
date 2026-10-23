import assert from 'node:assert/strict';
import test from 'node:test';
import {createFacebookPageVideoPublisherAdapter,createInstagramReelPublisherAdapter} from './native-video-publishers.mjs';

const SHA='a'.repeat(64),MEDIA='https://media.base44.com/videos/public/clip/Relay_RC35_APPROVAL.mp4';
const input={approved:true,authorizationRef:'owner:2026-10-23-relay',
  rightsApproved:true,rightsReceiptRef:'mixkit-assets-provenance-reviewed',
  mediaSha256:SHA,mediaUrl:MEDIA,caption:'Today we introduce Evercraft Relay and our first commercial.',
  campaignKey:'relay-rc35-commercial'};
function config(overrides={}){
  return {verified:true,allowPublish:true,allowedAccountIds:['123'],pageId:'123',igUserId:'123',
    accessToken:'secret-kept-out-of-results',assertNotDuplicate:async()=>true,...overrides};
}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});}

test('Facebook video gets provider ID and verified permalink before published status',async()=>{
  const calls=[];
  const adapter=createFacebookPageVideoPublisherAdapter(config({fetchImpl:async(url,init)=>{
    calls.push({url,init});return calls.length===1?json({id:'456'}):json({permalink_url:'https://www.facebook.com/reel/456'});
  }}));
  const out=await adapter.publish(input);
  assert.equal(out.state,'published');assert.equal(out.remoteId,'456');
  assert.equal(out.url,'https://www.facebook.com/reel/456');
  assert.equal(out.sourceMediaSha256,SHA);
  assert.equal(calls.length,2);
  assert.match(calls[0].url,/\/123\/videos$/);
  assert.match(calls[0].init.body,/file_url=/);
  assert.equal(calls[0].init.body.includes('access_token'),false);
  assert.equal(JSON.stringify(out).includes('secret-kept-out-of-results'),false);
});

test('Facebook missing provider permalink stays unverified',async()=>{
  let n=0;const adapter=createFacebookPageVideoPublisherAdapter(config({fetchImpl:async()=>{
    return ++n===1?json({id:'456'}):json({status:{video_status:'processing'}});
  }}));
  const out=await adapter.publish(input);
  assert.equal(out.state,'pending_verification');assert.equal(out.url,null);
});

test('hard brand exclusions apply even when account is allowlisted',async()=>{
  let calls=0;
  const adapter=createFacebookPageVideoPublisherAdapter(config({pageId:'924929507380565',
    allowedAccountIds:['924929507380565'],fetchImpl:async()=>{calls++;return json({id:'1'});}}));
  await assert.rejects(()=>adapter.publish(input),/brand_excluded/);assert.equal(calls,0);
});

test('Facebook links in feed caption are rejected before posting',async()=>{
  let calls=0;
  const adapter=createFacebookPageVideoPublisherAdapter(config({fetchImpl:async()=>{calls++;return json({id:'1'});}}));
  await assert.rejects(()=>adapter.publish({...input,caption:'View https://example.com'}),/facebook_caption_links_prohibited/);
  assert.equal(calls,0);
});

test('blocked rights and duplicate checks fail closed',async()=>{
  let calls=0;
  const adapter=createFacebookPageVideoPublisherAdapter(config({assertNotDuplicate:async()=>false,
    fetchImpl:async()=>{calls++;return json({id:'1'});}}));
  await assert.rejects(()=>adapter.publish({...input,rightsApproved:false}),/rights_receipt_missing/);
  await assert.rejects(()=>adapter.publish(input),/duplicate_or_check_unresolved/);
  assert.equal(calls,0);
});

test('Instagram Reel waits until container finishes and can be resumed',async()=>{
  const calls=[];
  const adapter=createInstagramReelPublisherAdapter(config({fetchImpl:async(url,init)=>{
    calls.push({url,init});return calls.length===1?json({id:'container-42'}):json({status_code:'IN_PROGRESS'});
  }}));
  const out=await adapter.publish(input);
  assert.equal(out.state,'pending_processing');assert.equal(out.containerId,'container-42');
  assert.equal(calls.length,2);assert.match(calls[0].init.body,/media_type=REELS/);
  const resumeCalls=[];
  const resume=createInstagramReelPublisherAdapter(config({fetchImpl:async(url,init)=>{
    resumeCalls.push({url,init});
    if(resumeCalls.length===1)return json({status_code:'FINISHED'});
    if(resumeCalls.length===2)return json({id:'media-77'});
    return json({permalink:'https://www.instagram.com/reel/demo/'});
  }}));
  const result=await resume.publish({...input,resumeContainerId:out.containerId});
  assert.equal(result.state,'published');assert.equal(result.remoteId,'media-77');
  assert.equal(result.url,'https://www.instagram.com/reel/demo/');
  assert.equal(resumeCalls.length,3);assert.match(resumeCalls[1].url,/\/123\/media_publish$/);
});
