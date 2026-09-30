import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { publishClipMedia } from './publisher-runtime.mjs';

const digest=(file)=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function stagedFixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'clip-publish-runtime-'));
  const media=path.join(root,'master.mp4');
  fs.writeFileSync(media,Buffer.from('staged-video'));
  const mediaSha=digest(media);
  const manifestPath=path.join(root,'manifest.json');
  fs.writeFileSync(manifestPath,JSON.stringify({
    schema:'evercraft.clip.media-intake.v1',
    deliveryId:'delivery-1',
    destinations:['youtube'],
    media:{path:media,sha256:mediaSha},
    metadata:{title:'Original',description:'Original description',tags:['one']},
  }));
  const receiptPath=path.join(root,'intake-receipt.json');
  fs.writeFileSync(receiptPath,JSON.stringify({
    schema:'evercraft.clip.intake-receipt.v1',
    deliveryId:'delivery-1',
    status:'staged',
    stagedManifestPath:manifestPath,
    stagedMediaPath:media,
    mediaSha256:mediaSha,
    manifestDigest:'a'.repeat(64),
    boundaries:{
      firstPartyQueue:true,
      inputBytesReverified:true,
      masterQcRequired:true,
      publicationAuthorityGranted:false,
    },
  }));
  return {root,media,mediaSha,manifestPath,receiptPath};
}

function request(receiptPath){
  return {
    schema:'evercraft.clip.publish-request.v1',
    id:'publish-1',
    intakeReceiptPath:receiptPath,
    destination:'youtube',
    brandKey:'evercraft-journal',
    authorization:{approved:true,authorizationRef:'policy:clip-autopublish-v1'},
    metadata:{title:'Published Title',privacyStatus:'private'},
  };
}

test('publishes only from a verified staged intake through a verified destination adapter',async()=>{
  const f=stagedFixture();
  let calls=0;
  const adapter={
    id:'youtube-test',
    destination:'youtube',
    verified:true,
    async publish(input){
      calls++;
      assert.equal(input.mediaSha256,f.mediaSha);
      assert.equal(input.metadata.title,'Published Title');
      return {
        state:'published',
        remoteId:'yt-1',
        url:'https://www.youtube.com/watch?v=yt-1',
        mediaSha256:input.mediaSha256,
        observedPrivacyStatus:'private',
        sourceRefs:['provider:test-youtube'],
      };
    },
  };
  const receipt=await publishClipMedia({
    request:request(f.receiptPath),
    adapters:[adapter],
    policy:{
      allowPublishing:true,
      allowedDestinations:['youtube'],
      blockedBrandKeys:['rnb-chicken-and-soul'],
    },
  });
  assert.equal(receipt.status,'published');
  assert.equal(receipt.remoteId,'yt-1');
  assert.equal(receipt.observedPrivacyStatus,'private');
  assert.equal(receipt.boundaries.firstPartyClipRuntime,true);
  assert.equal(receipt.boundaries.inputDigestBound,true);
  assert.equal(calls,1);
});

test('blocked brand policy stops before a platform adapter can run',async()=>{
  const f=stagedFixture();
  let called=false;
  const req=request(f.receiptPath);
  req.brandKey='rnb-chicken-and-soul';
  await assert.rejects(()=>publishClipMedia({
    request:req,
    adapters:[{destination:'youtube',verified:true,async publish(){called=true;}}],
    policy:{
      allowPublishing:true,
      allowedDestinations:['youtube'],
      blockedBrandKeys:['rnb-chicken-and-soul'],
    },
  }),/clip_publish_policy_brand_blocked/);
  assert.equal(called,false);
});

test('unverified adapters cannot publish',async()=>{
  const f=stagedFixture();
  await assert.rejects(()=>publishClipMedia({
    request:request(f.receiptPath),
    adapters:[{destination:'youtube',verified:false,async publish(){throw new Error('no');}}],
    policy:{
      allowPublishing:true,
      allowedDestinations:['youtube'],
      blockedBrandKeys:[],
    },
  }),/clip_publish_verified_adapter_missing/);
});

test('provider failures return a failed receipt without inventing a publication',async()=>{
  const f=stagedFixture();
  const receipt=await publishClipMedia({
    request:request(f.receiptPath),
    adapters:[{
      destination:'youtube',
      verified:true,
      async publish(){throw new Error('provider_down');},
    }],
    policy:{
      allowPublishing:true,
      allowedDestinations:['youtube'],
      blockedBrandKeys:[],
    },
  });
  assert.equal(receipt.status,'failed');
  assert.match(receipt.error,/provider_down/);
  assert.equal('remoteId' in receipt,false);
  assert.equal(receipt.boundaries.publicationStateAssertedFromProviderResponse,false);
});
