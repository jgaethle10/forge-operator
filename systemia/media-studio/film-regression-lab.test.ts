import assert from 'node:assert/strict';
import test from 'node:test';
import {
  captureFilmBenchmark,
  compareFilmBenchmark,
  type FilmBenchmarkRunInput,
} from './film-regression-lab.js';
import type { NarrativeFilmAdmissionReceipt } from './narrative-film-admission.js';
import type { StudioMasterQcReceipt } from './master-qc.js';
import type { SequenceAestheticReport } from './sequence-aesthetic.js';
import type { IdentityFingerprintAdmission } from './identity-fingerprint.js';
import type { DialogueSyncAdmission } from './dialogue-sync-gate.js';
import type { BoundaryContinuityAdmission } from './continuity-boundary.js';
import type { StudioDeliveryReceipt } from './studio-delivery.js';

const MASTER='m'.repeat(64).replace(/m/g,'a');

function filmAdmission():NarrativeFilmAdmissionReceipt{
  return {
    schema:'evercraft.fallen.narrative-film-admission.v1',id:'film-admission',
    projectId:'film',projectVersion:4,projectTimelineDigest:'t'.repeat(64),
    sequenceId:'seq',sequencePlanDigest:'s'.repeat(64),performancePlanDigest:'p'.repeat(64),
    aestheticReportDigest:'r'.repeat(64),status:'accepted',reasons:[],warnings:[],shots:[],
    admissionDigest:'f'.repeat(64),
    boundaries:{
      finalTimelineBytesBound:true,everyVisibleCharacterIdentityBound:true,
      continuousCutsRequireBoundaryAdmission:true,dialogueShotsRequireDialogueAdmission:true,
      postSelectionFinishesMustBeAdmitted:true,sequenceAestheticAdmissionRequired:true,
      deliveryMustRequireThisReceiptForNarrativeFilm:true,masterQcStillRequiredAtDelivery:true,
      publicationAuthorityGranted:false
    },
    admittedAt:'2026-09-30T00:00:00Z'
  };
}

function identities(score=.94,distance=.12):IdentityFingerprintAdmission[]{
  return ['eli','fox'].map((entityId,index)=>({
    schema:'evercraft.fallen.identity-fingerprint-admission.v1' as const,
    packetDigest:String(index+1).repeat(64),entityId,candidateSha256:String(index+3).repeat(64),
    status:'accepted' as const,reasons:[],warnings:[],localMeanDistance:distance,
    localMaxDistance:distance+.05,verifiedIdentityScore:score,admissionDigest:String(index+5).repeat(64),
    boundaries:{grossAppearanceGateRequired:true,verifiedIdentityGateRequired:true,noBiometricClaim:true,publicationAuthorityGranted:false},
    admittedAt:'2026-09-30T00:00:00Z'
  }));
}

function continuity():BoundaryContinuityAdmission[]{
  return [{
    schema:'evercraft.fallen.boundary-continuity-admission.v1',
    packetDigest:'1'.repeat(64),previousArtifactDigest:'3'.repeat(64),currentArtifactDigest:'4'.repeat(64),
    status:'accepted',reasons:[],warnings:[],verifiedMetrics:['identity','action_phase'],
    receiptDigest:'7'.repeat(64),
    boundaries:{exactBoundaryFramesBound:true,verifierReceiptsRequired:true,localSimilarityIsNotIdentityProof:true,timelineAdmissionMayFailClosed:true,publicationAuthorityGranted:false},
    admittedAt:'2026-09-30T00:00:00Z'
  }];
}

function dialogue(score=.92,offset=40):DialogueSyncAdmission[]{
  return [{
    schema:'evercraft.fallen.dialogue-sync-admission.v1',
    packetDigest:'8'.repeat(64),speakerId:'eli',syncedVideoSha256:'4'.repeat(64),
    status:'accepted',reasons:[],warnings:[],bestCorrelation:.91,bestOffsetMs:offset,
    visualSyncScore:score,identityScore:.94,admissionDigest:'9'.repeat(64),
    boundaries:{providerSuccessIsNotAdmission:true,objectiveAndVisualSyncEvidenceRequired:true,identityMustSurviveFinishPass:true,noPhonemeRecognitionClaim:true,publicationAuthorityGranted:false},
    admittedAt:'2026-09-30T00:00:00Z'
  }];
}

function aesthetic(score=.9):SequenceAestheticReport{
  const names:any[]=[
    'edit_rhythm','composition_variety','camera_motivation','motion_naturalism',
    'performance_naturalism','visual_hierarchy','tone_coherence','spectacle_restraint'
  ];
  return {
    schema:'evercraft.fallen.sequence-aesthetic-report.v1',sequenceId:'seq',status:'accepted',
    reasons:[],warnings:[],
    structure:{shotCount:2,identicalScaleRun:1,identicalMovementRun:1,dominantLensMm:50,dominantLensFraction:.5,staticFraction:.5,durationMeanSec:4,durationCv:.2,uniqueShotScales:['wide','close'],uniqueMovements:['locked','handheld']},
    perShot:[
      {shotId:'s1',artifactDigest:'3'.repeat(64),status:'accepted',reasons:[]},
      {shotId:'s2',artifactDigest:'4'.repeat(64),status:'accepted',reasons:[]}
    ],
    sequenceMetrics:names.map(metric=>({metric,score,threshold:.76,findings:[]})),
    reportDigest:'r'.repeat(64),
    boundaries:{selectedArtifactsBound:true,perShotVisualEvidenceRequired:true,sequenceLevelVerifierRequired:true,structuralHeuristicsAreNotAestheticTruth:true,noAutomaticStylePrescription:true,publicationAuthorityGranted:false},
    assessedAt:'2026-09-30T00:00:00Z'
  };
}

function master(black=.01,freeze=.04,silence=.2):StudioMasterQcReceipt{
  return {
    schema:'evercraft.fallen.master-qc-receipt.v1',status:'accepted',path:'/tmp/master.mp4',sha256:MASTER,
    measurements:{durationSec:8,width:1920,height:1080,fps:30,videoCodec:'h264',audioCodec:'aac',hasAudio:true,blackDurationSec:black*8,freezeDurationSec:freeze*8,silenceDurationSec:silence*8,blackRatio:black,freezeRatio:freeze,silenceRatio:silence},
    policy:{expectedDurationSec:8,durationToleranceSec:.15,minShortEdge:1080,minFps:23.9,maxBlackRatio:.08,maxFreezeRatio:.35,maxSilenceRatio:.85,requireAudio:true,allowedVideoCodecs:['h264'],allowedAudioCodecs:['aac']},
    reasons:[],evidenceRefs:['sha256:'+MASTER],
    boundaries:{technicalQcOnly:true,creativeTournamentStillRequired:true,truthAndRightsGatesStillRequired:true,publicationAuthorityGranted:false},
    assessedAt:'2026-09-30T00:00:00Z'
  };
}

function delivery():StudioDeliveryReceipt{
  return {
    schema:'evercraft.fallen.studio-delivery-receipt.v1',deliveryId:'delivery',outputDir:'/tmp',
    videoPath:'/tmp/master.mp4',renderReceiptPath:'/tmp/render.json',masterQcReceiptPath:'/tmp/qc.json',
    clipManifestPath:'/tmp/clip.json',mediaSha256:MASTER,manifestSha256:'c'.repeat(64),
    state:'ready_for_clip_intake',qualityMode:'narrative_film',publicationAuthorityGranted:false
  };
}

function run(runId='run-1'):FilmBenchmarkRunInput{
  return {
    schema:'evercraft.fallen.film-benchmark-run-input.v1',benchmarkId:'bridge-benchmark',
    runId,engineRef:'main@abc',filmAdmission:filmAdmission(),
    identityAdmissions:identities(),continuityAdmissions:continuity(),dialogueAdmissions:dialogue(),
    aestheticReport:aesthetic(),masterQc:master(),delivery:delivery(),
    sourceRefs:['benchmark:bridge']
  };
}

test('captures a film benchmark as separate hard dimensions rather than one flattering score',()=>{
  const snapshot=captureFilmBenchmark(run());
  assert.equal(snapshot.status,'accepted');
  assert.deepEqual(snapshot.criticalFailures,[]);
  assert.equal(snapshot.metrics.identity.minVerifiedScore,.94);
  assert.equal(snapshot.metrics.dialogue.maxAbsOffsetMs,40);
  assert.equal(snapshot.metrics.aesthetic.minMetricScore,.9);
  assert.equal(snapshot.metrics.master.sha256,MASTER);
  assert.equal(snapshot.boundaries.noSingleCompositeScore,true);
});

test('critical film failure cannot be averaged away by strong scores elsewhere',()=>{
  const input=run();
  input.dialogueAdmissions[0].status='rejected';
  const snapshot=captureFilmBenchmark(input);
  assert.equal(snapshot.status,'rejected');
  assert.ok(snapshot.criticalFailures.includes('dialogue_admission_rejected'));
});

test('comparison catches quality regression even when current run still clears absolute gates',()=>{
  const baseline=captureFilmBenchmark(run('baseline'));
  const currentInput=run('current');
  currentInput.identityAdmissions=identities(.89,.19);
  currentInput.dialogueAdmissions=dialogue(.86,130);
  currentInput.aestheticReport=aesthetic(.84);
  const current=captureFilmBenchmark(currentInput);
  assert.equal(current.status,'accepted');
  const comparison=compareFilmBenchmark({baseline,current});
  assert.equal(comparison.status,'regressed');
  assert.ok(comparison.regressions.some(item=>item.startsWith('identity_min_verified_score')));
  assert.ok(comparison.regressions.some(item=>item.startsWith('identity_max_local_mean_distance')));
  assert.ok(comparison.regressions.some(item=>item.startsWith('dialogue_min_visual_sync_score')));
  assert.ok(comparison.regressions.some(item=>item.startsWith('dialogue_max_abs_offset_ms')));
  assert.ok(comparison.regressions.some(item=>item.startsWith('aesthetic_min_metric_score')));
});

test('small bounded movement inside regression tolerance remains accepted',()=>{
  const baseline=captureFilmBenchmark(run('baseline'));
  const currentInput=run('current');
  currentInput.identityAdmissions=identities(.925,.14);
  currentInput.dialogueAdmissions=dialogue(.90,70);
  currentInput.aestheticReport=aesthetic(.88);
  const current=captureFilmBenchmark(currentInput);
  const comparison=compareFilmBenchmark({baseline,current});
  assert.equal(comparison.status,'accepted');
});

test('delivery must point to the exact Master QC bytes',()=>{
  const input=run();
  input.delivery.mediaSha256='0'.repeat(64);
  const snapshot=captureFilmBenchmark(input);
  assert.equal(snapshot.status,'rejected');
  assert.ok(snapshot.criticalFailures.includes('delivery_master_digest_mismatch'));
});
