import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessNarrativeShootReadiness,
  type NarrativeShootReadinessInput,
} from './narrative-shoot-readiness.js';
import type { CinematicSequencePlan, CinematicShotContract } from './cinematic-sequence.js';
import type { VisualModelEndpoint, VisualReference } from './model-fabric.js';

function ref(id:string,role:'identity'|'environment'|'dialogue_audio'):VisualReference{
  return {
    id,
    kind:role==='dialogue_audio'?'audio':'image',
    role,
    digest:(id[0]??'a').repeat(64).slice(0,64),
    sourceRefs:['canon:'+id],
    locators:[
      {kind:'url',value:'https://assets.example/'+id+(role==='dialogue_audio'?'.wav':'.png')},
      ...(role==='dialogue_audio'
        ?[{kind:'provider_asset' as const,providerId:'sync',value:'sync-'+id}]
        :[{kind:'provider_asset' as const,providerId:'veo',value:'veo-'+id}])
    ],
  };
}

function shot(id:string,index:number,carry?:string,dialogue=false):CinematicShotContract{
  return {
    schema:'evercraft.fallen.cinematic-shot-contract.v1',
    sequenceId:'seq',id,needId:'need-'+id,index,locationId:'bridge',durationSec:8,
    aspectRatio:'16:9',continuityDigest:'c'.repeat(64),shotScale:index?'close':'wide',
    lensMm:index?85:28,cameraMovement:index?'handheld':'locked',
    screenDirection:'left_to_right',axisReset:false,
    dialogue:dialogue?{speakerId:'eli'}:undefined,
    characters:[{entityId:'eli',startZone:'left',startFacing:'right'}],
    sourceRefs:['story:bridge'],
    baseReferences:[ref('eli','identity'),ref('bridge','environment')],
    carryInFromShotId:carry,mustProvideStartFrame:Boolean(carry),
    prompt:'Preserve Eli and the bridge canon while the rescue continues.'
  };
}

function sequence():CinematicSequencePlan{
  return {
    schema:'evercraft.fallen.cinematic-sequence-plan.v1',id:'seq',status:'accepted',
    shots:[shot('s1',0),shot('s2',1,'s1',true)],errors:[],warnings:[],
    continuityDigest:'c'.repeat(64),digest:'s'.repeat(64),
    boundaries:{
      identityReferencesRequired:true,environmentReferencesRequired:true,
      actionContinuityFailsClosed:true,axisCrossingFailsClosed:true,
      carryInFramesRequiredWhenContinuous:true,directPublicationAuthority:false
    },
    createdAt:'2026-10-01T00:00:00Z'
  };
}

function endpoints():VisualModelEndpoint[]{
  const commonRequirements:any[]=['reference_identity','reference_environment','commercial_rights','provenance_receipt','timing_control'];
  return [
    {
      id:'cinema-url',providerId:'runway',displayName:'Cinema URL',enabled:true,executionState:'verified',
      capabilities:[{
        task:'video',inputModes:['text','image_reference','start_frame'],
        requirements:commonRequirements,
        referenceRoles:['identity','environment','start_frame'],
        identityContinuityViaStartFrame:true,
        environmentContinuityViaStartFrame:true,
        framesExclusiveWithReferences:true,locatorKinds:['url'],maxReferences:2,
        aspectRatios:['16:9'],maxDurationSec:10,qualityTier:5,costTier:4,latencyTier:3
      } as any]
    },
    {
      id:'cinema-asset',providerId:'veo',displayName:'Cinema Asset',enabled:true,executionState:'verified',
      capabilities:[{
        task:'video',inputModes:['text','image_reference','start_frame'],
        requirements:commonRequirements,
        referenceRoles:['identity','environment','start_frame'],
        identityContinuityViaStartFrame:true,
        environmentContinuityViaStartFrame:true,
        framesExclusiveWithReferences:true,locatorKinds:['provider_asset'],providerLocatorId:'veo',
        maxReferences:2,aspectRatios:['16:9'],maxDurationSec:10,
        qualityTier:5,costTier:5,latencyTier:3
      } as any]
    },
    {
      id:'sync:lip',providerId:'sync',displayName:'Sync Lip',enabled:true,executionState:'verified',
      capabilities:[{
        task:'lip_sync',inputModes:['video_reference','audio_reference'],
        requirements:['reference_identity','commercial_rights','provenance_receipt','timing_control'],
        referenceRoles:['identity','dialogue_audio'],locatorKinds:['url','provider_asset'],providerLocatorId:'sync',
        maxReferences:2,qualityTier:5,costTier:3,latencyTier:2
      }]
    }
  ];
}

function input():NarrativeShootReadinessInput{
  return {
    schema:'evercraft.fallen.narrative-shoot-readiness-input.v1',
    id:'bridge-preflight',
    sequencePlan:sequence(),
    endpoints:endpoints(),
    executableModelIds:['cinema-url','cinema-asset','sync:lip'],
    dialogueAudioByShot:{s2:ref('eli-line-1','dialogue_audio')},
    generatedImageMaterializations:[
      {kind:'url'},
      {kind:'provider_asset',providerId:'veo'}
    ],
    generatedVideoMaterializations:[
      {kind:'url'},
      {kind:'provider_asset',providerId:'sync'}
    ],
    candidateCount:2,
    modelDiversity:2,
    minimumCandidatesPerShot:2,
    minimumDistinctModelsPerShot:2,
    sourceRefs:['benchmark:bridge']
  };
}

test('proves the establishing shot executable now and continuous dialogue shot executable after predecessor',()=>{
  const report=assessNarrativeShootReadiness(input());
  assert.equal(report.status,'ready');
  assert.deepEqual(report.immediateShotIds,['s1']);
  assert.deepEqual(report.deferredShotIds,['s2']);
  assert.deepEqual(report.blockedShotIds,[]);
  assert.equal(report.shots[0].generation.plannedCandidates,2);
  assert.equal(report.shots[0].generation.distinctModels,2);
  assert.equal(report.shots[1].state,'ready_after_predecessor');
  assert.equal(report.shots[1].finish.status,'ready');
  assert.ok(report.shots[1].finish.steps.some(step=>step.task==='lip_sync'&&step.status==='ready'));
  assert.equal(report.boundaries.noProviderCallExecuted,true);
  assert.equal(report.boundaries.paidGenerationAuthorityGranted,false);
});

test('verified endpoint without an available runtime adapter does not count as executable',()=>{
  const value=input();
  value.executableModelIds=['cinema-url','sync:lip'];
  value.minimumDistinctModelsPerShot=2;
  const report=assessNarrativeShootReadiness(value);
  assert.equal(report.status,'blocked');
  assert.ok(report.blockedShotIds.includes('s1'));
  assert.ok(report.shots[0].blockers.some(reason=>reason.startsWith('model_diversity_shortfall:')));
  assert.ok(report.runtime.missingVerifiedAdapterModelIds.includes('cinema-asset'));
});

test('dialogue shot is blocked before spending when approved dialogue audio is absent',()=>{
  const value=input();
  value.dialogueAudioByShot={};
  const report=assessNarrativeShootReadiness(value);
  const row=report.shots.find(shot=>shot.shotId==='s2');
  assert.equal(row?.state,'blocked');
  assert.ok(row?.blockers.includes('dialogue_audio_missing'));
});

test('provider that silently drops environment canon cannot make an establishing shot ready',()=>{
  const value=input();
  value.sequencePlan.shots=[shot('s1',0)];
  value.endpoints=[{
    id:'identity-only',providerId:'thin',displayName:'Thin provider',enabled:true,executionState:'verified',
    capabilities:[{
      task:'video',inputModes:['text','image_reference'],
      requirements:['reference_identity','reference_environment','commercial_rights','provenance_receipt','timing_control'],
      referenceRoles:['identity'],locatorKinds:['url'],maxReferences:1,
      aspectRatios:['16:9'],qualityTier:5,costTier:2,latencyTier:2
    }]
  }];
  value.executableModelIds=['identity-only'];
  value.minimumCandidatesPerShot=2;
  value.minimumDistinctModelsPerShot=1;
  const report=assessNarrativeShootReadiness(value);
  assert.equal(report.status,'blocked');
  assert.ok(report.shots[0].generation.rejectedModels[0].reasons.some(reason=>
    reason==='environment_reference_mode_not_supported'||reason==='environment_canon_not_carried_to_provider'
  ));
});

test('continuity materialization path is required for a dependent shot',()=>{
  const value=input();
  value.generatedImageMaterializations=[];
  const report=assessNarrativeShootReadiness(value);
  const row=report.shots.find(shot=>shot.shotId==='s2');
  assert.equal(row?.state,'blocked');
  assert.ok(row?.blockers.includes('generated_start_frame_materialization_missing'));
});
