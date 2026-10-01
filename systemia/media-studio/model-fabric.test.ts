import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildVisualFinishPlan,
  buildVisualModelPlan,
  type VisualModelEndpoint,
  type VisualShotRequest,
} from './model-fabric.js';

const endpoints:VisualModelEndpoint[]=[
  {
    id:'cinema-a',
    providerId:'provider-a',
    displayName:'Cinema A',
    enabled:true,
    executionState:'verified',
    capabilities:[{
      task:'video',
      inputModes:['text','image_reference','start_frame','end_frame','video_reference'],
      requirements:['reference_identity','commercial_rights','provenance_receipt','timing_control'],
      aspectRatios:['16:9','9:16'],
      maxDurationSec:20,
      maxReferences:8,
      batchVariants:4,
      qualityTier:5,costTier:4,latencyTier:3
    }]
  },
  {
    id:'cinema-b',
    providerId:'provider-b',
    displayName:'Cinema B',
    enabled:true,
    executionState:'verified',
    capabilities:[{
      task:'video',
      inputModes:['text','image_reference','video_reference','motion_reference'],
      requirements:['reference_identity','commercial_rights','provenance_receipt','timing_control'],
      aspectRatios:['16:9','9:16','1:1'],
      maxDurationSec:30,
      maxReferences:12,
      nativeAudio:true,
      batchVariants:4,
      qualityTier:5,costTier:3,latencyTier:3
    },{
      task:'motion_transfer',
      inputModes:['image_reference','motion_reference'],
      requirements:['reference_identity','commercial_rights','provenance_receipt','timing_control'],
      maxDurationSec:30,
      maxReferences:2,
      qualityTier:5,costTier:3,latencyTier:2
    }]
  },
  {
    id:'cinema-c',
    providerId:'provider-a',
    displayName:'Cinema C',
    enabled:true,
    executionState:'verified',
    capabilities:[{
      task:'video',
      inputModes:['text','image_reference'],
      requirements:['reference_identity','commercial_rights','provenance_receipt','timing_control'],
      aspectRatios:['16:9'],
      maxDurationSec:10,
      maxReferences:3,
      qualityTier:4,costTier:2,latencyTier:1
    }]
  },
  {
    id:'lip-a',
    providerId:'provider-c',
    displayName:'Lip A',
    enabled:true,
    executionState:'verified',
    capabilities:[{
      task:'lip_sync',
      inputModes:['video_reference','audio_reference'],
      requirements:['reference_identity','commercial_rights','provenance_receipt','timing_control'],
      maxDurationSec:60,
      maxReferences:2,
      qualityTier:5,costTier:2,latencyTier:2
    }]
  },
  {
    id:'upscale-a',
    providerId:'provider-d',
    displayName:'Upscale A',
    enabled:true,
    executionState:'verified',
    capabilities:[{
      task:'upscale',
      inputModes:['video_reference','image_reference'],
      requirements:['commercial_rights','provenance_receipt'],
      resolutions:['1080p','2K','4K'],
      maxReferences:1,
      qualityTier:5,costTier:2,latencyTier:2
    }]
  },
  {
    id:'declared-only',
    providerId:'provider-z',
    displayName:'Declared only',
    enabled:true,
    executionState:'declared',
    capabilities:[{
      task:'video',
      inputModes:['text','image_reference','video_reference'],
      requirements:['reference_identity','commercial_rights','provenance_receipt','timing_control'],
      qualityTier:5,costTier:1,latencyTier:1
    }]
  }
];

const request:VisualShotRequest={
  schema:'evercraft.fallen.visual-shot-request.v1',
  id:'week-systemia-shot',
  needId:'need-systemia',
  task:'video',
  prompt:'Track the founder into Global Operations while the Systemia wall wakes up.',
  durationSec:8,
  aspectRatio:'16:9',
  targetResolution:'1080p',
  continuityDigest:'continuity-123',
  requires:['reference_identity','commercial_rights','provenance_receipt','timing_control'],
  requiredInputModes:['image_reference'],
  references:[{
    id:'founder-ref',
    kind:'image',
    role:'identity',
    digest:'abc',
    sourceRefs:['user:approved-founder-reference']
  }],
  candidateCount:3,
  modelDiversity:1,
  sourceRefs:['episode:week-in-motion']
};

test('routes a shot across verified diverse visual models',()=>{
  const plan=buildVisualModelPlan(request,endpoints);
  assert.equal(plan.status,'routed');
  assert.equal(plan.jobs.length,3);
  assert.equal(new Set(plan.jobs.map(job=>job.providerId)).size>=2,true);
  assert.equal(plan.jobs.some(job=>job.modelId==='declared-only'),false);
  assert.equal(plan.boundaries.tournamentSelectionRequired,true);
  assert.ok(plan.digest.length===64);
});

test('reference identity fails closed when no identity reference is supplied',()=>{
  const plan=buildVisualModelPlan({...request,references:[]},endpoints);
  assert.equal(plan.status,'blocked');
  assert.equal(plan.jobs.length,0);
  const videoModelIds=new Set(['cinema-a','cinema-b','cinema-c']);
  const videoRejections=plan.rejectedModels.filter(row=>videoModelIds.has(row.modelId));
  assert.equal(videoRejections.length,3);
  assert.ok(videoRejections.every(row=>row.reasons.includes('identity_reference_missing')));
});

test('native audio requirement narrows routing to a capable model',()=>{
  const plan=buildVisualModelPlan({...request,requireNativeAudio:true,candidateCount:4},endpoints);
  assert.deepEqual(plan.jobs.map(job=>job.modelId),['cinema-b']);
});

test('finishing compiles lip-sync and upscale as governed post-tournament passes',()=>{
  const plan=buildVisualFinishPlan({
    schema:'evercraft.fallen.visual-finish-request.v1',
    id:'finish-1',
    needId:'need-systemia',
    sourceVideoRef:{
      id:'winner-video',kind:'video',role:'product',digest:'winner',
      sourceRefs:['tournament:winner']
    },
    dialogueAudioRef:{
      id:'dialogue',kind:'audio',role:'dialogue_audio',digest:'voice',
      sourceRefs:['voice:approved']
    },
    targetResolution:'4K',
    continuityDigest:'continuity-123',
    sourceRefs:['episode:week-in-motion']
  },endpoints);

  assert.deepEqual(plan.steps.map(step=>step.task),['lip_sync','upscale']);
  assert.equal(plan.steps[0].modelPlan.status,'routed');
  assert.equal(plan.steps[1].modelPlan.status,'routed');
  assert.equal(plan.boundaries.finishAfterTournament,true);
});


test('verified continuity start frame can satisfy reference identity when provider carries identity through the frame',()=>{
  const endpoint:VisualModelEndpoint={
    id:'frame-continuity',
    providerId:'frame-provider',
    displayName:'Frame Continuity',
    enabled:true,
    executionState:'verified',
    capabilities:[{
      task:'video',
      inputModes:['text','start_frame'],
      requirements:['reference_identity','commercial_rights','provenance_receipt','timing_control'],
      referenceRoles:['start_frame'],
      identityContinuityViaStartFrame:true,
      framesExclusiveWithReferences:true,
      locatorKinds:['url'],
      maxReferences:1,
      qualityTier:5,costTier:3,latencyTier:2
    }]
  };
  const plan=buildVisualModelPlan({
    ...request,
    requiredInputModes:['start_frame'],
    references:[
      {
        id:'canon-face',kind:'image',role:'identity',
        sourceRefs:['canon:face'],locator:{kind:'url',value:'https://assets.example/canon.png'}
      },
      {
        id:'prior-end',kind:'image',role:'start_frame',
        sourceRefs:['continuity:prior-end'],locator:{kind:'url',value:'https://assets.example/prior-end.png'}
      }
    ]
  },[endpoint]);
  assert.equal(plan.status,'routed');
  assert.equal(plan.jobs.length,1);
  assert.deepEqual(plan.jobs[0].references.map(ref=>ref.role),['start_frame']);
});

test('provider locator mismatch blocks routing before execution',()=>{
  const endpoint:VisualModelEndpoint={
    id:'asset-only',
    providerId:'asset-provider',
    displayName:'Asset only',
    enabled:true,
    executionState:'verified',
    capabilities:[{
      task:'video',
      inputModes:['text','image_reference'],
      requirements:['reference_identity','commercial_rights','provenance_receipt','timing_control'],
      referenceRoles:['identity'],
      locatorKinds:['provider_asset'],
      maxReferences:1,
      qualityTier:5,costTier:3,latencyTier:2
    }]
  };
  const plan=buildVisualModelPlan({
    ...request,
    references:[{
      id:'face',kind:'image',role:'identity',sourceRefs:['canon:face'],
      locator:{kind:'url',value:'https://assets.example/face.png'}
    }]
  },[endpoint]);
  assert.equal(plan.status,'blocked');
  assert.ok(plan.rejectedModels[0].reasons.includes('reference_locator_unsupported:identity:url'));
});

test('reference-image duration constraints reject an otherwise compatible paid route early',()=>{
  const endpoint:VisualModelEndpoint={
    id:'eight-second-reference-model',
    providerId:'provider',
    displayName:'Eight second references',
    enabled:true,
    executionState:'verified',
    capabilities:[{
      task:'video',
      inputModes:['text','image_reference'],
      requirements:['reference_identity','commercial_rights','provenance_receipt','timing_control'],
      referenceRoles:['identity'],
      referenceImageDurationOptions:[8],
      maxReferences:3,
      qualityTier:5,costTier:5,latencyTier:3
    }]
  };
  const plan=buildVisualModelPlan({
    ...request,
    durationSec:6,
    targetResolution:undefined,
    references:[{
      id:'face',kind:'image',role:'identity',sourceRefs:['canon:face']
    }]
  },[endpoint]);
  assert.equal(plan.status,'blocked');
  assert.ok(plan.rejectedModels[0].reasons.includes('reference_image_duration_not_supported'));
});


test('one canonical reference can materialize differently for different providers',()=>{
  const refs=[{
    id:'eli-canon',
    kind:'image' as const,
    role:'identity' as const,
    digest:'e'.repeat(64),
    sourceRefs:['canon:eli'],
    locators:[
      {kind:'url' as const,value:'https://assets.evercraft.test/eli.png'},
      {kind:'provider_asset' as const,providerId:'elevenlabs',value:'asset-eli'},
    ]
  }];
  const routeRequest:VisualShotRequest={
    ...request,
    targetResolution:undefined,
    references:refs,
    candidateCount:2,
    modelDiversity:1,
  };
  const providerEndpoints:VisualModelEndpoint[]=[
    {
      id:'runway-like',providerId:'runway',displayName:'Runway-like',enabled:true,executionState:'verified',
      capabilities:[{
        task:'video',inputModes:['text','image_reference'],
        requirements:['reference_identity','commercial_rights','provenance_receipt','timing_control'],
        referenceRoles:['identity'],locatorKinds:['url'],maxReferences:1,
        qualityTier:5,costTier:3,latencyTier:2
      }]
    },
    {
      id:'veo-like',providerId:'elevenlabs',displayName:'Veo-like',enabled:true,executionState:'verified',
      capabilities:[{
        task:'video',inputModes:['text','image_reference'],
        requirements:['reference_identity','commercial_rights','provenance_receipt','timing_control'],
        referenceRoles:['identity'],locatorKinds:['provider_asset'],providerLocatorId:'elevenlabs',
        maxReferences:1,qualityTier:5,costTier:3,latencyTier:2
      }]
    }
  ];
  const plan=buildVisualModelPlan(routeRequest,providerEndpoints);
  assert.equal(plan.status,'routed');
  assert.equal(plan.jobs.length,2);
  const runway=plan.jobs.find(job=>job.providerId==='runway');
  const veo=plan.jobs.find(job=>job.providerId==='elevenlabs');
  assert.deepEqual(runway?.references[0].locator,{kind:'url',value:'https://assets.evercraft.test/eli.png'});
  assert.deepEqual(veo?.references[0].locator,{kind:'provider_asset',providerId:'elevenlabs',value:'asset-eli'});
});

test('provider asset from the wrong provider does not satisfy locator readiness',()=>{
  const endpoint:VisualModelEndpoint={
    id:'sync-only',providerId:'sync',displayName:'Sync-only',enabled:true,executionState:'verified',
    capabilities:[{
      task:'video',inputModes:['text','image_reference'],
      requirements:['reference_identity','commercial_rights','provenance_receipt','timing_control'],
      referenceRoles:['identity'],locatorKinds:['provider_asset'],providerLocatorId:'sync',
      maxReferences:1,qualityTier:5,costTier:3,latencyTier:2
    }]
  };
  const plan=buildVisualModelPlan({
    ...request,targetResolution:undefined,
    references:[{
      id:'eli',kind:'image',role:'identity',sourceRefs:['canon:eli'],
      locators:[{kind:'provider_asset',providerId:'elevenlabs',value:'asset-eli'}]
    }]
  },[endpoint]);
  assert.equal(plan.status,'blocked');
  assert.ok(plan.rejectedModels[0].reasons.includes('reference_locator_unsupported:identity:provider_asset@elevenlabs'));
});

test('legacy single locator remains supported alongside the materialization mesh',()=>{
  const endpoint:VisualModelEndpoint={
    id:'url-provider',providerId:'url',displayName:'URL provider',enabled:true,executionState:'verified',
    capabilities:[{
      task:'video',inputModes:['text','image_reference'],
      requirements:['reference_identity','commercial_rights','provenance_receipt','timing_control'],
      referenceRoles:['identity'],locatorKinds:['url'],maxReferences:1,
      qualityTier:5,costTier:3,latencyTier:2
    }]
  };
  const plan=buildVisualModelPlan({
    ...request,targetResolution:undefined,
    references:[{
      id:'eli',kind:'image',role:'identity',sourceRefs:['canon:eli'],
      locator:{kind:'url',value:'https://assets.example/eli.png'}
    }]
  },[endpoint]);
  assert.equal(plan.status,'routed');
  assert.deepEqual(plan.jobs[0].references[0].locator,{kind:'url',value:'https://assets.example/eli.png'});
});
