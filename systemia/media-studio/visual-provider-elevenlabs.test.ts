import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createElevenLabsVeoAdapter,
  elevenLabsVeoEndpoint,
} from './visual-provider-elevenlabs.js';
import type { VisualModelJob } from './model-fabric.js';

const job:VisualModelJob={
  schema:'evercraft.fallen.visual-model-job.v1',
  id:'shot-01',
  requestId:'request-01',
  needId:'need-01',
  modelId:'elevenlabs:veo-3.1-fast-generate-001',
  providerId:'elevenlabs',
  task:'video',
  prompt:'Cinematic tracking shot through a grounded technology headquarters.',
  durationSec:8,
  aspectRatio:'16:9',
  targetResolution:'1080p',
  references:[{
    id:'start',
    kind:'image',
    role:'start_frame',
    digest:'a'.repeat(64),
    sourceRefs:['asset:start'],
    locator:{kind:'provider_asset',providerId:'elevenlabs',value:'asset-start'}
  }],
  continuityDigest:'continuity',
  requires:['commercial_rights','provenance_receipt','timing_control'],
  outputContract:{
    commercialRightsRequired:true,
    provenanceRequired:true,
    artifactDigestRequired:true,
    tournamentCandidateRequired:true
  }
};

function response(status:number,payload:any,bytes?:Buffer){
  return {
    ok:status>=200&&status<300,
    status,
    async json(){return payload;},
    async text(){return typeof payload==='string'?payload:JSON.stringify(payload);},
    async arrayBuffer(){
      const b=bytes??Buffer.from(JSON.stringify(payload));
      return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
    }
  };
}

test('ElevenLabs Veo endpoint stays declared until independently verified',()=>{
  assert.equal(elevenLabsVeoEndpoint('veo-3.1-fast-generate-001').executionState,'declared');
  assert.equal(elevenLabsVeoEndpoint('veo-3.1-fast-generate-001',true).executionState,'verified');
});

test('adapter maps a governed Fallen job into ElevenLabs async generation and returns a digest receipt',async()=>{
  const calls:Array<{url:string;body?:any}>=[];
  let poll=0;
  const fetchImpl=async(url:string,init?:any)=>{
    calls.push({url,body:init?.body?JSON.parse(init.body):undefined});
    if(url.endsWith('/v1/flows/video')){
      return response(200,{id:'generation-1',status:'pending'});
    }
    if(url.includes('/v1/flows/video/generation-1')){
      poll++;
      return poll===1
        ? response(200,{id:'generation-1',status:'generating'})
        : response(200,{id:'generation-1',status:'completed',content_url:'https://signed.example/video',content_mime_type:'video/mp4'});
    }
    if(url==='https://signed.example/video'){
      return response(200,{},Buffer.from('video-bytes'));
    }
    return response(404,{error:'not found'});
  };
  const outputDir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-elevenlabs-'));
  const adapter=createElevenLabsVeoAdapter({
    apiKey:'test-key',
    modelId:'veo-3.1-fast-generate-001',
    outputDir,
    verified:true,
    commercialRights:'allowed',
    allowPaidGeneration:true,
    pollIntervalMs:0,
    maxPolls:3,
    fetchImpl:fetchImpl as any,
  });
  const receipt=await adapter.execute(job);
  assert.equal(receipt.providerRequestId,'generation-1');
  assert.equal(receipt.artifact.mimeType,'video/mp4');
  assert.equal(receipt.artifact.digest.length,64);
  assert.equal(fs.existsSync(receipt.artifact.path),true);
  assert.equal(calls[0].body.model_id,'veo-3.1-fast-generate-001');
  assert.equal(calls[0].body.duration_secs,8);
  assert.deepEqual(calls[0].body.start_frame,{type:'asset',asset_id:'asset-start'});
});

test('adapter rejects unsupported end frame without a start frame before spending',async()=>{
  const adapter=createElevenLabsVeoAdapter({
    apiKey:'test-key',
    modelId:'veo-3.1-fast-generate-001',
    outputDir:os.tmpdir(),
    verified:true,
    commercialRights:'allowed',
    allowPaidGeneration:true,
    fetchImpl:(async()=>{throw new Error('network should not run');}) as any,
  });
  await assert.rejects(
    ()=>adapter.execute({
      ...job,
      references:[{
        id:'end',kind:'image',role:'end_frame',sourceRefs:['asset:end'],
        locator:{kind:'provider_asset',providerId:'elevenlabs',value:'asset-end'}
      }]
    }),
    /elevenlabs_end_frame_requires_start_frame/
  );
});

test('commercial rights remain unknown unless explicitly configured',async()=>{
  let poll=0;
  const fetchImpl=async(url:string)=>{
    if(url.endsWith('/v1/flows/video')) return response(200,{id:'generation-2',status:'pending'});
    if(url.includes('/generation-2')){
      poll++;
      return response(200,{id:'generation-2',status:'completed',content_url:'https://signed.example/v2',content_mime_type:'video/mp4'});
    }
    return response(200,{},Buffer.from('video-2'));
  };
  const adapter=createElevenLabsVeoAdapter({
    apiKey:'test-key',modelId:'veo-3.1-fast-generate-001',
    outputDir:fs.mkdtempSync(path.join(os.tmpdir(),'fallen-elevenlabs-rights-')),
    verified:true,commercialRights:'unknown',allowPaidGeneration:true,pollIntervalMs:0,maxPolls:1,
    fetchImpl:fetchImpl as any,
  });
  const receipt=await adapter.execute(job);
  assert.equal(receipt.commercialRights,'unknown');
});


test('paid generation requires an explicit execution authorization',async()=>{
  const adapter=createElevenLabsVeoAdapter({
    apiKey:'test-key',modelId:'veo-3.1-fast-generate-001',outputDir:os.tmpdir(),verified:true,commercialRights:'allowed',
    fetchImpl:(async()=>{throw new Error('network should not run');}) as any,
  });
  await assert.rejects(()=>adapter.execute(job),/elevenlabs_paid_generation_not_authorized/);
});


test('Veo endpoint advertises governed identity references and frame/reference exclusivity',()=>{
  const capability=elevenLabsVeoEndpoint('veo-3.1-generate-001',true).capabilities[0];
  assert.ok(capability.inputModes.includes('image_reference'));
  assert.ok(capability.requirements.includes('reference_identity'));
  assert.equal(capability.framesExclusiveWithReferences,true);
  assert.equal(capability.identityContinuityViaStartFrame,true);
  assert.deepEqual(capability.referenceImageDurationOptions,[8]);
  assert.deepEqual(capability.locatorKinds,['inline_base64','provider_asset','provider_generation']);
});

test('Veo maps identity environment and style images into subject/style reference roles',async()=>{
  const calls:Array<{url:string;body?:any}>=[];
  const fetchImpl=async(url:string,init?:any)=>{
    calls.push({url,body:init?.body?JSON.parse(init.body):undefined});
    if(url.endsWith('/v1/flows/video')) return response(200,{id:'generation-refs',status:'pending'});
    if(url.includes('/generation-refs')) return response(200,{id:'generation-refs',status:'completed',content_url:'https://signed.example/refs',content_mime_type:'video/mp4'});
    return response(200,{},Buffer.from('reference-video'));
  };
  const adapter=createElevenLabsVeoAdapter({
    apiKey:'test-key',modelId:'veo-3.1-generate-001',
    outputDir:fs.mkdtempSync(path.join(os.tmpdir(),'fallen-elevenlabs-refs-')),
    verified:true,commercialRights:'allowed',allowPaidGeneration:true,pollIntervalMs:0,maxPolls:1,
    fetchImpl:fetchImpl as any,
  });
  await adapter.execute({
    ...job,
    modelId:'elevenlabs:veo-3.1-generate-001',
    references:[
      {
        id:'eli',kind:'image',role:'identity',sourceRefs:['canon:eli'],
        locator:{kind:'provider_asset',providerId:'elevenlabs',value:'asset-eli'}
      },
      {
        id:'bridge',kind:'image',role:'environment',sourceRefs:['canon:bridge'],
        locator:{kind:'provider_asset',providerId:'elevenlabs',value:'asset-bridge'}
      },
      {
        id:'style',kind:'image',role:'style',sourceRefs:['style:film'],
        locator:{kind:'provider_generation',providerId:'elevenlabs',value:'style-generation'}
      }
    ],
    requires:['reference_identity','commercial_rights','provenance_receipt','timing_control']
  });
  assert.deepEqual(calls[0].body.images,[
    {image:{type:'asset',asset_id:'asset-eli'},role:'subject'},
    {image:{type:'asset',asset_id:'asset-bridge'},role:'subject'},
    {image:{type:'generation',generation_id:'style-generation'},role:'style'}
  ]);
  assert.equal(calls[0].body.start_frame,undefined);
});

test('Veo refuses mixed start-frame and free reference-image modes before spending',async()=>{
  const adapter=createElevenLabsVeoAdapter({
    apiKey:'test-key',modelId:'veo-3.1-fast-generate-001',outputDir:os.tmpdir(),
    verified:true,commercialRights:'allowed',allowPaidGeneration:true,
    fetchImpl:(async()=>{throw new Error('network should not run');}) as any,
  });
  await assert.rejects(()=>adapter.execute({
    ...job,
    references:[
      ...job.references,
      {
        id:'eli',kind:'image',role:'identity',sourceRefs:['canon:eli'],
        locator:{kind:'provider_asset',providerId:'elevenlabs',value:'asset-eli'}
      }
    ],
    requires:['reference_identity','commercial_rights','provenance_receipt','timing_control']
  }),/elevenlabs_reference_images_cannot_mix_with_frames/);
});

test('Veo reference-image mode requires eight seconds before any paid request',async()=>{
  const adapter=createElevenLabsVeoAdapter({
    apiKey:'test-key',modelId:'veo-3.1-generate-001',outputDir:os.tmpdir(),
    verified:true,commercialRights:'allowed',allowPaidGeneration:true,
    fetchImpl:(async()=>{throw new Error('network should not run');}) as any,
  });
  await assert.rejects(()=>adapter.execute({
    ...job,
    modelId:'elevenlabs:veo-3.1-generate-001',
    durationSec:6,
    references:[{
      id:'eli',kind:'image',role:'identity',sourceRefs:['canon:eli'],
      locator:{kind:'provider_asset',providerId:'elevenlabs',value:'asset-eli'}
    }],
    requires:['reference_identity','commercial_rights','provenance_receipt','timing_control']
  }),/elevenlabs_reference_images_require_eight_seconds/);
});
