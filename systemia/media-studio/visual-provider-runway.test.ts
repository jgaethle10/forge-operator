import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRunwayGen45Adapter, runwayGen45Endpoint } from './visual-provider-runway.js';
import type { VisualModelJob } from './model-fabric.js';

const baseJob:VisualModelJob={
  schema:'evercraft.fallen.visual-model-job.v1',
  id:'runway-shot',
  requestId:'request-runway',
  needId:'need-runway',
  modelId:'runway:gen4.5',
  providerId:'runway',
  task:'video',
  prompt:'Slow cinematic dolly through a grounded technology operations floor.',
  durationSec:5,
  aspectRatio:'16:9',
  references:[],
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

test('Runway Gen-4.5 endpoint remains declared until a live adapter is verified',()=>{
  assert.equal(runwayGen45Endpoint().executionState,'declared');
  assert.equal(runwayGen45Endpoint(true).executionState,'verified');
});

test('Runway adapter executes text-to-video and captures output locally',async()=>{
  const calls:Array<{url:string;body?:any;headers?:any}>=[];
  let polls=0;
  const fetchImpl=async(url:string,init?:any)=>{
    calls.push({url,body:init?.body?JSON.parse(init.body):undefined,headers:init?.headers});
    if(url.endsWith('/v1/image_to_video')) return response(200,{id:'task-1'});
    if(url.endsWith('/v1/tasks/task-1')){
      polls++;
      return polls===1
        ? response(200,{id:'task-1',status:'PENDING'})
        : response(200,{id:'task-1',status:'SUCCEEDED',output:['https://signed.runway/video.mp4']});
    }
    if(url==='https://signed.runway/video.mp4') return response(200,{},Buffer.from('runway-video'));
    return response(404,{error:'not-found'});
  };
  const outputDir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-runway-'));
  const adapter=createRunwayGen45Adapter({
    apiKey:'test-key',outputDir,verified:true,commercialRights:'allowed',allowPaidGeneration:true,
    pollIntervalMs:0,maxPolls:3,fetchImpl:fetchImpl as any,
  });
  const receipt=await adapter.execute(baseJob);
  assert.equal(receipt.providerRequestId,'task-1');
  assert.equal(receipt.artifact.digest.length,64);
  assert.equal(fs.existsSync(receipt.artifact.path),true);
  assert.equal(calls[0].body.model,'gen4.5');
  assert.equal(calls[0].body.ratio,'1280:720');
  assert.equal(calls[0].headers['X-Runway-Version'],'2024-11-06');
});

test('Runway start frame accepts a URL and becomes promptImage',async()=>{
  const calls:any[]=[];
  const fetchImpl=async(url:string,init?:any)=>{
    calls.push({url,body:init?.body?JSON.parse(init.body):undefined});
    if(url.endsWith('/v1/image_to_video')) return response(200,{id:'task-2'});
    if(url.endsWith('/v1/tasks/task-2')) return response(200,{id:'task-2',status:'SUCCEEDED',output:['https://signed.runway/v2.mp4']});
    return response(200,{},Buffer.from('runway-2'));
  };
  const adapter=createRunwayGen45Adapter({
    apiKey:'test-key',
    outputDir:fs.mkdtempSync(path.join(os.tmpdir(),'fallen-runway-ref-')),
    verified:true,commercialRights:'allowed',allowPaidGeneration:true,pollIntervalMs:0,maxPolls:1,
    fetchImpl:fetchImpl as any,
  });
  await adapter.execute({
    ...baseJob,
    references:[{
      id:'start',kind:'image',role:'start_frame',sourceRefs:['asset:start'],
      locator:{kind:'url',value:'https://assets.example/start.png'}
    }]
  });
  assert.equal(calls[0].body.promptImage,'https://assets.example/start.png');
});

test('unsupported end-frame contract fails before any paid request',async()=>{
  const adapter=createRunwayGen45Adapter({
    apiKey:'test-key',outputDir:os.tmpdir(),verified:true,commercialRights:'allowed',allowPaidGeneration:true,
    fetchImpl:(async()=>{throw new Error('network should not run');}) as any,
  });
  await assert.rejects(()=>adapter.execute({
    ...baseJob,
    references:[{
      id:'end',kind:'image',role:'end_frame',sourceRefs:['asset:end'],
      locator:{kind:'url',value:'https://assets.example/end.png'}
    }]
  }),/runway_gen45_end_frame_not_supported/);
});


test('paid generation requires an explicit execution authorization',async()=>{
  const adapter=createRunwayGen45Adapter({
    apiKey:'test-key',outputDir:os.tmpdir(),verified:true,commercialRights:'allowed',
    fetchImpl:(async()=>{throw new Error('network should not run');}) as any,
  });
  await assert.rejects(()=>adapter.execute(baseJob),/runway_paid_generation_not_authorized/);
});


test('Runway endpoint declares one-image identity continuity semantics',()=>{
  const capability=runwayGen45Endpoint(true).capabilities[0];
  assert.ok(capability.requirements.includes('reference_identity'));
  assert.ok(capability.inputModes.includes('image_reference'));
  assert.equal(capability.identityContinuityViaStartFrame,true);
  assert.deepEqual(capability.referenceRoles,['identity','start_frame']);
  assert.deepEqual(capability.locatorKinds,['url','data_uri']);
  assert.equal(capability.maxReferences,1);
});

test('Runway can use one canonical identity image as promptImage for a first shot',async()=>{
  const calls:any[]=[];
  const fetchImpl=async(url:string,init?:any)=>{
    calls.push({url,body:init?.body?JSON.parse(init.body):undefined});
    if(url.endsWith('/v1/image_to_video')) return response(200,{id:'task-identity'});
    if(url.endsWith('/v1/tasks/task-identity')) return response(200,{id:'task-identity',status:'SUCCEEDED',output:['https://signed.runway/identity.mp4']});
    return response(200,{},Buffer.from('identity-video'));
  };
  const adapter=createRunwayGen45Adapter({
    apiKey:'test-key',outputDir:fs.mkdtempSync(path.join(os.tmpdir(),'fallen-runway-identity-')),
    verified:true,commercialRights:'allowed',allowPaidGeneration:true,pollIntervalMs:0,maxPolls:1,
    fetchImpl:fetchImpl as any,
  });
  await adapter.execute({
    ...baseJob,
    references:[{
      id:'eli',kind:'image',role:'identity',sourceRefs:['canon:eli'],
      locator:{kind:'url',value:'https://assets.example/eli.png'}
    }],
    requires:['reference_identity','commercial_rights','provenance_receipt','timing_control']
  });
  assert.equal(calls[0].body.promptImage,'https://assets.example/eli.png');
});

test('Runway refuses multiple prompt identity images before spending',async()=>{
  const adapter=createRunwayGen45Adapter({
    apiKey:'test-key',outputDir:os.tmpdir(),verified:true,commercialRights:'allowed',allowPaidGeneration:true,
    fetchImpl:(async()=>{throw new Error('network should not run');}) as any,
  });
  await assert.rejects(()=>adapter.execute({
    ...baseJob,
    references:[
      {id:'eli',kind:'image',role:'identity',sourceRefs:['canon:eli'],locator:{kind:'url',value:'https://assets.example/eli.png'}},
      {id:'fox',kind:'image',role:'identity',sourceRefs:['canon:fox'],locator:{kind:'url',value:'https://assets.example/fox.png'}}
    ],
    requires:['reference_identity','commercial_rights','provenance_receipt','timing_control']
  }),/runway_gen45_multiple_prompt_images_unsupported/);
});
