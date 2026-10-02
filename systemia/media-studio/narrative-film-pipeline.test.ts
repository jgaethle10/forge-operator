import assert from 'node:assert/strict';
import test from 'node:test';
import { planNarrativeFilmPipeline } from './narrative-film-pipeline.js';
import { makeTimelineProject, timelineDigest } from './timeline.js';
import type { CinematicSequencePlan, CinematicShotContract } from './cinematic-sequence.js';
import type { PerformancePlan } from './performance-director.js';
import type { FilmPipelineShotState } from './narrative-film-pipeline.js';
import type { SelectedShotAestheticEvidence, SequenceAestheticReport } from './sequence-aesthetic.js';
import type { IdentityFingerprintAdmission } from './identity-fingerprint.js';
import type { BoundaryContinuityAdmission } from './continuity-boundary.js';
import type { DialogueSyncAdmission } from './dialogue-sync-gate.js';

const A='a'.repeat(64),B='b'.repeat(64),C='c'.repeat(64);

function shot(id:string,index:number,needId:string,carry?:string,dialogue=false):CinematicShotContract{
  return {
    schema:'evercraft.fallen.cinematic-shot-contract.v1',sequenceId:'seq',id,needId,index,
    locationId:'bridge',durationSec:4,aspectRatio:'16:9',continuityDigest:'continuity',
    shotScale:index?'close':'wide',lensMm:index?85:28,cameraMovement:index?'handheld':'locked',
    screenDirection:'left_to_right',axisReset:false,
    dialogue:dialogue?{speakerId:'eli'}:undefined,
    characters:[{entityId:'eli',startZone:'center',startFacing:'camera'}],
    sourceRefs:['story'],baseReferences:[],carryInFromShotId:carry,
    mustProvideStartFrame:Boolean(carry),prompt:'shot'
  };
}

function sequence():CinematicSequencePlan{
  return {
    schema:'evercraft.fallen.cinematic-sequence-plan.v1',id:'seq',status:'accepted',
    shots:[shot('s1',0,'n1'),shot('s2',1,'n2','s1',true)],
    errors:[],warnings:[],continuityDigest:'continuity',digest:'s'.repeat(64),
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
    directions:[],errors:[],warnings:[],digest:'p'.repeat(64),
    boundaries:{
      everyVisibleCharacterDirected:true,emotionalTeleportFailsClosed:true,
      dialoguePerformanceRequired:true,performanceDoesNotOverrideBlocking:true,
      directPublicationAuthority:false
    },
    createdAt:'2026-09-30T00:00:00Z'
  };
}

function project(){
  return makeTimelineProject({
    id:'film',title:'Film',aspectRatio:'16:9',fps:30,
    assets:[
      {id:'a',path:'/tmp/a.mp4',digest:A,kind:'video',sourceRefs:['a']},
      {id:'c',path:'/tmp/c.mp4',digest:C,kind:'video',sourceRefs:['c']}
    ],
    tracks:[{id:'picture',kind:'video',name:'Picture',clips:[
      {id:'s1-clip',trackId:'picture',assetId:'a',startSec:0,durationSec:4},
      {id:'s2-clip',trackId:'picture',assetId:'c',startSec:4,durationSec:4}
    ]}]
  });
}

function identity(d:string):IdentityFingerprintAdmission{
  return {
    schema:'evercraft.fallen.identity-fingerprint-admission.v1',
    packetDigest:'x'.repeat(64),entityId:'eli',candidateSha256:d,status:'accepted',
    reasons:[],warnings:[],localMeanDistance:.1,localMaxDistance:.2,verifiedIdentityScore:.95,
    admissionDigest:'i'.repeat(64),
    boundaries:{grossAppearanceGateRequired:true,verifiedIdentityGateRequired:true,noBiometricClaim:true,publicationAuthorityGranted:false},
    admittedAt:'2026-09-30T00:00:00Z'
  };
}

function continuity():BoundaryContinuityAdmission{
  return {
    schema:'evercraft.fallen.boundary-continuity-admission.v1',
    packetDigest:'x'.repeat(64),previousArtifactDigest:A,currentArtifactDigest:C,status:'accepted',
    reasons:[],warnings:[],verifiedMetrics:['identity','action_phase'],receiptDigest:'q'.repeat(64),
    boundaries:{exactBoundaryFramesBound:true,verifierReceiptsRequired:true,localSimilarityIsNotIdentityProof:true,timelineAdmissionMayFailClosed:true,publicationAuthorityGranted:false},
    admittedAt:'2026-09-30T00:00:00Z'
  };
}

function dialogue():DialogueSyncAdmission{
  return {
    schema:'evercraft.fallen.dialogue-sync-admission.v1',
    packetDigest:'x'.repeat(64),speakerId:'eli',syncedVideoSha256:C,status:'accepted',
    reasons:[],warnings:[],bestCorrelation:.9,bestOffsetMs:40,visualSyncScore:.92,identityScore:.95,
    admissionDigest:'d'.repeat(64),
    boundaries:{providerSuccessIsNotAdmission:true,objectiveAndVisualSyncEvidenceRequired:true,identityMustSurviveFinishPass:true,noPhonemeRecognitionClaim:true,publicationAuthorityGranted:false},
    admittedAt:'2026-09-30T00:00:00Z'
  };
}

function aestheticEvidence(shotId:string,d:string):SelectedShotAestheticEvidence{
  return {
    shotId,
    candidate:{
      id:'candidate-'+shotId,shotId,artifactPath:'/tmp/'+shotId+'.mp4',artifactDigest:d,
      kind:'video',durationSec:4,aspectRatio:'16:9',sourceState:'generated_visualization',
      provenance:'complete',syntheticLabelPresent:true,subjectIds:['eli'],observations:[]
    },
    observationPacket:{
      schema:'evercraft.fallen.visual-observation-packet.v1',
      candidateId:'candidate-'+shotId,shotId,artifactPath:'/tmp/'+shotId+'.mp4',
      artifactDigest:d,kind:'video',durationSec:4,aspectRatio:'16:9',subjectIds:['eli'],
      requestedMetrics:['composition','motion_quality','beauty','editability'],frames:[],
      objective:{durationSec:4,motionActivity:.1}
    },
    receipts:[]
  };
}

function aesthetic():SequenceAestheticReport{
  return {
    schema:'evercraft.fallen.sequence-aesthetic-report.v1',sequenceId:'seq',status:'accepted',
    reasons:[],warnings:[],
    structure:{shotCount:2,identicalScaleRun:1,identicalMovementRun:1,dominantLensMm:28,dominantLensFraction:.5,staticFraction:.5,durationMeanSec:4,durationCv:0,uniqueShotScales:['wide','close'],uniqueMovements:['locked','handheld']},
    perShot:[
      {shotId:'s1',artifactDigest:A,status:'accepted',reasons:[]},
      {shotId:'s2',artifactDigest:C,status:'accepted',reasons:[]}
    ],
    sequenceMetrics:[],
    reportDigest:'r'.repeat(64),
    boundaries:{selectedArtifactsBound:true,perShotVisualEvidenceRequired:true,sequenceLevelVerifierRequired:true,structuralHeuristicsAreNotAestheticTruth:true,noAutomaticStylePrescription:true,publicationAuthorityGranted:false},
    assessedAt:'2026-09-30T00:00:00Z'
  };
}

function readyShots():FilmPipelineShotState[]{
  return [
    {
      shotId:'s1',timelineClipId:'s1-clip',candidateDigests:[A,'1'.repeat(64)],
      baseSelection:{schema:'evercraft.fallen.shot-selection-receipt.v1',needId:'n1',candidateId:'a',artifactDigest:A,creativeGenomeDigest:'g',tournamentReceiptDigest:'t',selectedAt:'now'},
      baseProductionAdmission:{needId:'n1',status:'accepted',reasons:[],artifactDigest:A},
      finalArtifactDigest:A,identityAdmissions:[identity(A)],aestheticEvidence:aestheticEvidence('s1',A)
    },
    {
      shotId:'s2',timelineClipId:'s2-clip',candidateDigests:[B,'2'.repeat(64)],
      baseSelection:{schema:'evercraft.fallen.shot-selection-receipt.v1',needId:'n2',candidateId:'b',artifactDigest:B,creativeGenomeDigest:'g',tournamentReceiptDigest:'t',selectedAt:'now'},
      baseProductionAdmission:{needId:'n2',status:'accepted',reasons:[],artifactDigest:B},
      finishSteps:['lip_sync'],finalArtifactDigest:C,
      finishProductionAdmission:{needId:'finish',status:'accepted',reasons:[],artifactDigest:C},
      identityAdmissions:[identity(C)],dialogueAdmission:dialogue(),continuityAdmission:continuity(),
      aestheticEvidence:aestheticEvidence('s2',C)
    }
  ];
}

test('early pipeline exposes candidate generation instead of pretending downstream gates are ready',()=>{
  const p=project();
  const plan=planNarrativeFilmPipeline({
    schema:'evercraft.fallen.narrative-film-pipeline-input.v1',id:'pipe',project:p,
    sequencePlan:sequence(),performancePlan:performance(),
    shots:[
      {shotId:'s1',timelineClipId:'s1-clip'},
      {shotId:'s2',timelineClipId:'s2-clip'}
    ]
  });
  assert.equal(plan.status,'work_ready');
  assert.deepEqual(plan.readyJobs.map(j=>j.kind),['generate_candidates','generate_candidates']);
  assert.ok(plan.blockedStages.some(stage=>stage.stage==='sequence_aesthetic_review'));
});

test('fully evidenced shots advance to exactly one sequence aesthetic review job',()=>{
  const p=project();
  const plan=planNarrativeFilmPipeline({
    schema:'evercraft.fallen.narrative-film-pipeline-input.v1',id:'pipe',project:p,
    sequencePlan:sequence(),performancePlan:performance(),shots:readyShots()
  });
  assert.equal(plan.status,'work_ready');
  assert.deepEqual(plan.readyJobs.map(j=>j.kind),['sequence_aesthetic_review']);
  assert.deepEqual(plan.finalArtifactDigests,{s1:A,s2:C});
});

test('accepted aesthetics advance to Film Admission, not delivery',()=>{
  const p=project();
  const plan=planNarrativeFilmPipeline({
    schema:'evercraft.fallen.narrative-film-pipeline-input.v1',id:'pipe',project:p,
    sequencePlan:sequence(),performancePlan:performance(),shots:readyShots(),aestheticReport:aesthetic()
  });
  assert.equal(plan.status,'work_ready');
  assert.deepEqual(plan.readyJobs.map(j=>j.kind),['narrative_film_admission']);
  assert.ok(plan.blockedStages.some(stage=>stage.stage==='studio_delivery'));
});

test('exact current Film Admission unlocks narrative Studio Delivery',()=>{
  const p=project();
  const plan=planNarrativeFilmPipeline({
    schema:'evercraft.fallen.narrative-film-pipeline-input.v1',id:'pipe',project:p,
    sequencePlan:sequence(),performancePlan:performance(),shots:readyShots(),aestheticReport:aesthetic(),
    filmAdmission:{
      schema:'evercraft.fallen.narrative-film-admission.v1',
      projectId:p.id,projectVersion:p.version,projectTimelineDigest:timelineDigest(p),
      sequenceId:'seq',status:'accepted',admissionDigest:'f'.repeat(64)
    }
  });
  assert.equal(plan.status,'delivery_ready');
  assert.deepEqual(plan.readyJobs.map(j=>j.kind),['studio_delivery']);
  assert.equal(plan.readyJobs[0].payload.qualityMode,'narrative_film');
});

test('timeline mutation makes an old Film Admission stale and reopens admission instead of delivery',()=>{
  const p=project();
  const oldDigest=timelineDigest(p);
  p.version+=1;
  p.tracks[0].clips[0].durationSec=3.5;
  const plan=planNarrativeFilmPipeline({
    schema:'evercraft.fallen.narrative-film-pipeline-input.v1',id:'pipe',project:p,
    sequencePlan:sequence(),performancePlan:performance(),shots:readyShots(),aestheticReport:aesthetic(),
    filmAdmission:{
      schema:'evercraft.fallen.narrative-film-admission.v1',
      projectId:p.id,projectVersion:p.version-1,projectTimelineDigest:oldDigest,
      sequenceId:'seq',status:'accepted',admissionDigest:'f'.repeat(64)
    }
  });
  assert.ok(plan.readyJobs.some(j=>j.kind==='narrative_film_admission'));
  assert.equal(plan.readyJobs.some(j=>j.kind==='studio_delivery'),false);
});
