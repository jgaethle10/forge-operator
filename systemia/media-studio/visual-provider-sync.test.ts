import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createSyncLabsLipAdapter,
  stageSyncLabsAsset,
  syncLabsLipEndpoint,
} from './visual-provider-sync.js';
import type { VisualModelJob } from './model-fabric.js';

function response(input:{
  ok?:boolean;
  status?:number;
  json?:any;
  text?:string;
  bytes?:Buffer;
}){
  return {
    ok:input.ok??true,
    status:input.status??200,
    async json(){return input.json??{};},
    async text(){return input.text??'';},
    async arrayBuffer(){
      const bytes=input.bytes??Buffer.alloc(0);
      return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
    },
  };
}

function job(model='sync-3'):VisualModelJob{
  return {
    schema:'evercraft.fallen.visual-model-job.v1',
    id:'eli-dialogue-shot-01',
    requestId:'request-1',
    needId:'need-1',
    modelId:`sync:${model}`,
    providerId:'sync',
    task:'lip_sync',
    continuityDigest:'c'.repeat(64),
    prompt:'Preserve the selected performance and sync Eli to the approved dialogue take.',
    durationSec:4,
    aspectRatio:'16:9',
    references:[
      {
        id:'selected-video',
        kind:'video',
        role:'identity',
        digest:'a'.repeat(64),
        sourceRefs:['shot-selection:receipt-1'],
        locator:{kind:'url',value:'https://media.evercraft.test/selected.mp4'},
      },
      {
        id:'dialogue-take',
        kind:'audio',
        role:'dialogue_audio',
        digest:'b'.repeat(64),
        sourceRefs:['voice:eli:v1'],
        locator:{kind:'url',value:'https://media.evercraft.test/dialogue.wav'},
      }
    ],
    requires:['reference_identity','commercial_rights','provenance_receipt','timing_control'],
    outputContract:{
      commercialRightsRequired:true,
      provenanceRequired:true,
      artifactDigestRequired:true,
      tournamentCandidateRequired:true,
    }
  };
}

test('declares verified sync-3 as a real Model Fabric lip-sync endpoint',()=>{
  const endpoint=syncLabsLipEndpoint('sync-3',true);
  assert.equal(endpoint.executionState,'verified');
  assert.equal(endpoint.capabilities[0].task,'lip_sync');
  assert.deepEqual(endpoint.capabilities[0].inputModes,['video_reference','audio_reference']);
  assert.ok(endpoint.capabilities[0].requirements.includes('reference_identity'));
  assert.equal(endpoint.capabilities[0].qualityTier,5);
});

test('executes sync-3 with exact selected video/audio URLs and deterministic idempotency',async()=>{
  const calls:Array<{url:string;init:any}>=[];
  const output=Buffer.from('fake-mp4-bytes');
  let poll=0;
  const adapter=createSyncLabsLipAdapter({
    apiKey:'secret',
    modelId:'sync-3',
    outputDir:fs.mkdtempSync(path.join(os.tmpdir(),'fallen-sync-provider-')),
    verified:true,
    commercialRights:'allowed',
    allowPaidGeneration:true,
    pollIntervalMs:0,
    maxPolls:3,
    fetchImpl:async(url,init)=>{
      calls.push({url,init});
      if(url.endsWith('/v2/generate')){
        return response({status:201,json:{id:'generation-123',status:'PENDING'}}) as any;
      }
      if(url.includes('/v2/generate/generation-123')){
        poll+=1;
        return response({
          json:poll===1
            ?{id:'generation-123',status:'PROCESSING'}
            :{
              id:'generation-123',
              status:'COMPLETED',
              outputUrl:'https://cdn.sync.test/out.mp4',
              outputDuration:4,
            }
        }) as any;
      }
      if(url==='https://cdn.sync.test/out.mp4'){
        return response({bytes:output}) as any;
      }
      throw new Error('unexpected_url:'+url);
    }
  });

  const receipt=await adapter.execute(job());
  assert.equal(receipt.providerId,'sync');
  assert.equal(receipt.providerRequestId,'generation-123');
  assert.equal(receipt.commercialRights,'allowed');
  assert.equal(receipt.provenance,'complete');
  assert.equal(fs.readFileSync(receipt.artifact.path).toString(),'fake-mp4-bytes');

  const create=calls.find(call=>call.url.endsWith('/v2/generate'));
  assert.ok(create);
  assert.match(create?.init.headers['Idempotency-Key'],/^[a-f0-9]{64}$/);
  const body=JSON.parse(create?.init.body);
  assert.equal(body.model,'sync-3');
  assert.deepEqual(body.input,[
    {type:'video',url:'https://media.evercraft.test/selected.mp4'},
    {type:'audio',url:'https://media.evercraft.test/dialogue.wav'},
  ]);
  assert.equal(body.options.active_speaker_detection.auto_detect,true);
  assert.ok(receipt.sourceRefs.includes('source-video-sha256:'+'a'.repeat(64)));
  assert.ok(receipt.sourceRefs.includes('dialogue-audio-sha256:'+'b'.repeat(64)));
});

test('paid generation stays fail-closed until explicitly authorized',async()=>{
  const adapter=createSyncLabsLipAdapter({
    apiKey:'secret',modelId:'sync-3',
    outputDir:os.tmpdir(),verified:true,
    commercialRights:'allowed',
    allowPaidGeneration:false,
    fetchImpl:async()=>{throw new Error('should_not_call_provider');}
  });
  await assert.rejects(()=>adapter.execute(job()),/sync_paid_generation_not_authorized/);
});

test('supports already-staged Sync provider assets in generation inputs',async()=>{
  const staged=job();
  staged.references[0].locator={kind:'provider_asset',providerId:'sync',value:'video-asset-1'};
  staged.references[1].locator={kind:'provider_asset',providerId:'sync',value:'audio-asset-1'};
  let createBody:any=null;
  const adapter=createSyncLabsLipAdapter({
    apiKey:'secret',modelId:'sync-3',
    outputDir:fs.mkdtempSync(path.join(os.tmpdir(),'fallen-sync-assets-')),
    verified:true,commercialRights:'allowed',allowPaidGeneration:true,
    pollIntervalMs:0,maxPolls:1,
    fetchImpl:async(url,init)=>{
      if(url.endsWith('/v2/generate')){
        createBody=JSON.parse(String(init?.body));
        return response({status:201,json:{id:'generation-asset',status:'PENDING'}}) as any;
      }
      if(url.includes('/v2/generate/generation-asset')){
        return response({json:{id:'generation-asset',status:'COMPLETED',outputUrl:'https://cdn.sync.test/assets.mp4',outputDuration:4}}) as any;
      }
      return response({bytes:Buffer.from('asset-output')}) as any;
    }
  });
  await adapter.execute(staged);
  assert.deepEqual(createBody.input,[
    {type:'video',assetId:'video-asset-1'},
    {type:'audio',assetId:'audio-asset-1'},
  ]);
});

test('stages local Evercraft media through Sync presign, raw PUT, and asset registration',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-sync-stage-'));
  const file=path.join(root,'eli-dialogue.wav');
  fs.writeFileSync(file,Buffer.from('dialogue-bytes'));
  const calls:Array<{url:string;init:any}>=[];
  const staged=await stageSyncLabsAsset({
    apiKey:'secret',
    filePath:file,
    contentType:'audio/wav',
    assetType:'AUDIO',
    fetchImpl:async(url,init)=>{
      calls.push({url,init});
      if(url.endsWith('/v2/assets/upload')){
        return response({status:201,json:{
          uploadUrl:'https://uploads.sync.test/presigned',
          url:'https://assets.sync.test/eli-dialogue.wav'
        }}) as any;
      }
      if(url==='https://uploads.sync.test/presigned'){
        assert.equal(init?.method,'PUT');
        assert.equal(init?.headers['Content-Type'],'audio/wav');
        assert.equal(Buffer.isBuffer(init?.body),true);
        assert.equal((init?.body as Buffer).toString(),'dialogue-bytes');
        assert.equal(init?.headers['x-api-key'],undefined);
        return response({}) as any;
      }
      if(url.endsWith('/v2/assets')){
        const body=JSON.parse(String(init?.body));
        assert.equal(body.type,'AUDIO');
        assert.equal(body.url,'https://assets.sync.test/eli-dialogue.wav');
        return response({status:201,json:{id:'asset-audio-123'}}) as any;
      }
      throw new Error('unexpected_url:'+url);
    }
  });
  assert.equal(staged.assetId,'asset-audio-123');
  assert.deepEqual(staged.locator,{kind:'provider_asset',providerId:'sync',value:'asset-audio-123'});
  assert.equal(staged.sourceSha256.length,64);
  assert.equal(calls.length,3);
});

test('refuses unbounded data references instead of silently treating them as uploaded assets',async()=>{
  const bad=job();
  bad.references[0].locator={
    kind:'data_uri',
    value:'data:video/mp4;base64,AAAA',
  };
  const adapter=createSyncLabsLipAdapter({
    apiKey:'secret',modelId:'sync-3',
    outputDir:os.tmpdir(),verified:true,
    commercialRights:'allowed',
    allowPaidGeneration:true,
    fetchImpl:async()=>{throw new Error('should_not_call_provider');}
  });
  await assert.rejects(
    ()=>adapter.execute(bad),
    /sync_source_video_locator_unsupported:data_uri/
  );
});

test('provider failure can never masquerade as a completed production receipt',async()=>{
  const adapter=createSyncLabsLipAdapter({
    apiKey:'secret',modelId:'sync-3',
    outputDir:os.tmpdir(),verified:true,
    commercialRights:'allowed',
    allowPaidGeneration:true,
    pollIntervalMs:0,
    maxPolls:1,
    fetchImpl:async(url)=>{
      if(url.endsWith('/v2/generate')){
        return response({status:201,json:{id:'generation-bad',status:'PENDING'}}) as any;
      }
      return response({
        json:{
          id:'generation-bad',
          status:'FAILED',
          errorCode:'generation_input_video_inaccessible',
          error:'input inaccessible'
        }
      }) as any;
    }
  });
  await assert.rejects(
    ()=>adapter.execute(job()),
    /sync_generation_failed:FAILED:generation_input_video_inaccessible/
  );
});
