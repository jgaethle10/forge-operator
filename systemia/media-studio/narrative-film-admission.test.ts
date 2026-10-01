import assert from 'node:assert/strict';
import test from 'node:test';
import { admitNarrativeFilm, validateNarrativeFilmAdmissionForProject } from './narrative-film-admission.js';
import { makeTimelineProject } from './timeline.js';
import type { CinematicSequencePlan, CinematicShotContract } from './cinematic-sequence.js';
import type { PerformancePlan } from './performance-director.js';
import type { IdentityFingerprintAdmission } from './identity-fingerprint.js';
import type { BoundaryContinuityAdmission } from './continuity-boundary.js';
import type { ShotSelectionReceipt, ProductionAdmission } from './types.js';

const A='a'.repeat(64),B='b'.repeat(64),C='c'.repeat(64);

function shot(id:string,index:number,needId:string,characters:string[],carry?:string,dialogue?:string):CinematicShotContract{
  return {
    schema:'evercraft.fallen.cinematic-shot-contract.v1',
    sequenceId:'seq',id,needId,index,locationId:'bridge',durationSec:4,aspectRatio:'16:9',
    continuityDigest:'continuity',shotScale:index?'close':'wide',lensMm:index?85:28,
    cameraMovement:index?'handheld':'locked',screenDirection:'left_to_right',axisReset:false,
    characters:characters.map(entityId=>({entityId,startZone:'center',startFacing:'camera'})),
    sourceRefs:['story'],baseReferences:[],carryInFromShotId:carry,mustProvideStartFrame:Boolean(carry),
    dialogue:dialogue?{speakerId:dialogue}:undefined,prompt:'shot'
  };
}

function sequence():CinematicSequencePlan{
  const shots=[
    shot('s1',0,'need-1',['eli']),
    shot('s2',1,'need-2',['eli'],'s1','eli'),
  ];
  return {
    schema:'evercraft.fallen.cinematic-sequence-plan.v1',id:'seq',status:'accepted',
    shots,errors:[],warnings:[],continuityDigest:'continuity',digest:'seq'.padEnd(64,'0'),
    boundaries:{
      identityReferencesRequired:true,environmentReferencesRequired:true,
      actionContinuityFailsClosed:true,axisCrossingFailsClosed:true,
      carryInFramesRequiredWhenContinuous:true,directPublicationAuthority:false
    },
    createdAt:'2026-09-30T00:00:00Z'
  };
}

function performance():PerformancePlan{
  return {
    schema:'evercraft.fallen.performance-plan.v1',sequenceId:'seq',status:'accepted',
    directions:[],errors:[],warnings:[],digest:'perf'.padEnd(64,'0'),
    boundaries:{
      everyVisibleCharacterDirected:true,emotionalTeleportFailsClosed:true,
      dialoguePerformanceRequired:true,performanceDoesNotOverrideBlocking:true,
      directPublicationAuthority:false
    },
    createdAt:'2026-09-30T00:00:00Z'
  };
}

function identity(entityId:string,digestValue:string):IdentityFingerprintAdmission{
  return {
    schema:'evercraft.fallen.identity-fingerprint-admission.v1',
    packetDigest:'p'.repeat(64),entityId,candidateSha256:digestValue,status:'accepted',
    reasons:[],warnings:[],localMeanDistance:.1,localMaxDistance:.2,verifiedIdentityScore:.95,
    admissionDigest:(entityId==='eli'?'1':'2').repeat(64),
    boundaries:{
      grossAppearanceGateRequired:true,verifiedIdentityGateRequired:true,
      noBiometricClaim:true,publicationAuthorityGranted:false
    },
    admittedAt:'2026-09-30T00:00:00Z'
  };
}

function selection(needId:string,digestValue:string):ShotSelectionReceipt{
  return {
    schema:'evercraft.fallen.shot-selection-receipt.v1',needId,
    candidateId:'candidate-'+needId,artifactDigest:digestValue,
    creativeGenomeDigest:'g'.repeat(64),tournamentReceiptDigest:'t'.repeat(64),
    selectedAt:'2026-09-30T00:00:00Z'
  };
}

function prod(needId:string,digestValue:string):ProductionAdmission{
  return {needId,status:'accepted',reasons:[],artifactDigest:digestValue};
}

function continuity(previous:string,current:string):BoundaryContinuityAdmission{
  return {
    schema:'evercraft.fallen.boundary-continuity-admission.v1',
    packetDigest:'p'.repeat(64),previousArtifactDigest:previous,currentArtifactDigest:current,
    status:'accepted',reasons:[],warnings:[],verifiedMetrics:['identity','action_phase'],
    receiptDigest:'q'.repeat(64),
    boundaries:{
      exactBoundaryFramesBound:true,verifierReceiptsRequired:true,
      localSimilarityIsNotIdentityProof:true,timelineAdmissionMayFailClosed:true,
      publicationAuthorityGranted:false
    },
    admittedAt:'2026-09-30T00:00:00Z'
  };
}

function project(){
  return makeTimelineProject({
    id:'film',title:'Film',aspectRatio:'16:9',fps:30,
    assets:[
      {id:'one',path:'/tmp/one.mp4',digest:A,kind:'video',sourceRefs:['shot:s1']},
      {id:'two',path:'/tmp/two.mp4',digest:C,kind:'video',sourceRefs:['shot:s2']}
    ],
    tracks:[{
      id:'picture',kind:'video',name:'Picture',clips:[
        {id:'s1-clip',trackId:'picture',assetId:'one',startSec:0,durationSec:4},
        {id:'s2-clip',trackId:'picture',assetId:'two',startSec:4,durationSec:4}
      ]
    }]
  });
}

function input(){
  const seq=sequence();
  return {
    schema:'evercraft.fallen.narrative-film-admission-input.v1' as const,
    id:'film-admission-1',
    project:project(),
    sequencePlan:seq,
    performancePlan:performance(),
    shots:[
      {
        shotId:'s1',timelineClipId:'s1-clip',finalArtifactDigest:A,
        baseSelection:selection('need-1',A),baseProductionAdmission:prod('need-1',A),
        identityAdmissions:[identity('eli',A)],sourceRefs:['shot:s1']
      },
      {
        shotId:'s2',timelineClipId:'s2-clip',finalArtifactDigest:C,
        baseSelection:selection('need-2',B),baseProductionAdmission:prod('need-2',B),
        finishProductionAdmission:prod('need-2-lipsync',C),
        identityAdmissions:[identity('eli',C)],
        continuityAdmission:continuity(A,C),
        dialogueAdmission:{
          schema:'evercraft.fallen.dialogue-sync-admission.v1' as const,
          packetDigest:'d'.repeat(64),speakerId:'eli',syncedVideoSha256:C,status:'accepted' as const,
          reasons:[],warnings:[],bestCorrelation:.9,bestOffsetMs:40,visualSyncScore:.92,
          identityScore:.95,admissionDigest:'l'.repeat(64)
        },
        sourceRefs:['shot:s2','dialogue:eli']
      }
    ],
    aestheticReport:{
      schema:'evercraft.fallen.sequence-aesthetic-report.v1' as const,
      sequenceId:'seq',status:'accepted' as const,reasons:[],warnings:[],
      perShot:[
        {shotId:'s1',artifactDigest:A,status:'accepted' as const,reasons:[]},
        {shotId:'s2',artifactDigest:C,status:'accepted' as const,reasons:[]}
      ],
      reportDigest:'aesthetic'.padEnd(64,'0')
    }
  };
}

test('accepts narrative film only after final timeline bytes pass every shot and sequence gate',()=>{
  const admitted=admitNarrativeFilm(input());
  assert.equal(admitted.status,'accepted');
  assert.equal(admitted.shots.length,2);
  assert.equal(admitted.shots[1].baseSelectionDigest,B);
  assert.equal(admitted.shots[1].finalArtifactDigest,C);
  assert.equal(admitted.boundaries.masterQcStillRequiredAtDelivery,true);
  assert.equal(validateNarrativeFilmAdmissionForProject({
    project:input().project,admission:admitted
  }).status,'accepted');
});

test('dialogue finish cannot silently mutate identity and still enter film mode',()=>{
  const value=input();
  value.shots[1].identityAdmissions=[];
  const admitted=admitNarrativeFilm(value);
  assert.equal(admitted.status,'rejected');
  assert.ok(admitted.reasons.includes('shot_admission_rejected:s2'));
  assert.ok(admitted.shots[1].reasons.includes('final_identity_admission_missing:eli'));
});

test('continuous cut must bind final post-finish artifact to the prior final artifact',()=>{
  const value=input();
  value.shots[1].continuityAdmission=continuity(B,C);
  const admitted=admitNarrativeFilm(value);
  assert.equal(admitted.status,'rejected');
  assert.ok(admitted.shots[1].reasons.includes('continuity_previous_artifact_mismatch'));
});

test('narrative admission is invalidated by any later timeline mutation',()=>{
  const value=input();
  const admitted=admitNarrativeFilm(value);
  const changed=JSON.parse(JSON.stringify(value.project));
  changed.version+=1;
  changed.tracks[0].clips[0].durationSec=3.5;
  const validation=validateNarrativeFilmAdmissionForProject({project:changed,admission:admitted});
  assert.equal(validation.status,'rejected');
  assert.ok(validation.reasons.includes('narrative_film_project_version_mismatch'));
  assert.ok(validation.reasons.includes('narrative_film_timeline_digest_mismatch'));
});

test('sequence aesthetic report must describe the exact final artifacts in the timeline',()=>{
  const value=input();
  value.aestheticReport.perShot[1].artifactDigest=B;
  const admitted=admitNarrativeFilm(value);
  assert.equal(admitted.status,'rejected');
  assert.ok(admitted.reasons.includes('aesthetic_shot_artifact_mismatch:s2'));
});

test('a final artifact different from the tournament winner requires admitted finish production',()=>{
  const value=input();
  value.shots[1].finishProductionAdmission=undefined;
  const admitted=admitNarrativeFilm(value);
  assert.equal(admitted.status,'rejected');
  assert.ok(admitted.shots[1].reasons.includes('final_finish_production_admission_missing_or_mismatched'));
});
