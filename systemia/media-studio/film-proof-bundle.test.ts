import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  materializeFilmProofBundle,
  verifyFilmProofBundle,
  type FilmProofBundleInput,
} from './film-proof-bundle.js';
import type { FilmBenchmarkSnapshot } from './film-regression-lab.js';
import type { NarrativeFilmAdmissionReceipt } from './narrative-film-admission.js';
import type { StudioDeliveryReceipt, ClipDeliveryManifest } from './studio-delivery.js';
import type { TimelineExportReceipt } from './timeline-export.js';
import type { StudioMasterQcReceipt } from './master-qc.js';

function sha(file:string){
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function write(file:string,value:unknown){
  fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n','utf8');
}
function admission():NarrativeFilmAdmissionReceipt{
  return {
    schema:'evercraft.fallen.narrative-film-admission.v1',id:'admission',projectId:'film',
    projectVersion:7,projectTimelineDigest:'t'.repeat(64),sequenceId:'seq',
    sequencePlanDigest:'s'.repeat(64),performancePlanDigest:'p'.repeat(64),
    aestheticReportDigest:'a'.repeat(64),status:'accepted',reasons:[],warnings:[],shots:[],
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
function benchmark(masterSha:string):FilmBenchmarkSnapshot{
  return {
    schema:'evercraft.fallen.film-benchmark-snapshot.v1',benchmarkId:'bridge',runId:'run-1',
    engineRef:'main@abc',status:'accepted',criticalFailures:[],
    metrics:{
      identity:{count:1,minVerifiedScore:.94,meanVerifiedScore:.94,maxLocalMeanDistance:.1},
      continuity:{count:1,acceptedCount:1},
      dialogue:{count:1,minVisualSyncScore:.92,maxAbsOffsetMs:40,minIdentityScore:.94},
      aesthetic:{metricCount:8,minMetricScore:.88,meanMetricScore:.91},
      master:{width:1920,height:1080,fps:30,blackRatio:.01,freezeRatio:.02,silenceRatio:.2,sha256:masterSha},
      delivery:{qualityMode:'narrative_film',mediaSha256:masterSha}
    },
    thresholdPolicy:{
      minIdentityScore:.86,maxIdentityMeanDistance:.38,minDialogueVisualSyncScore:.82,
      maxDialogueOffsetMs:180,minAestheticMetricScore:.76,maxBlackRatio:.08,maxFreezeRatio:.35,
      maxSilenceRatio:.85,maxIdentityScoreDrop:.03,maxIdentityDistanceIncrease:.05,
      maxDialogueScoreDrop:.03,maxDialogueOffsetIncreaseMs:60,maxAestheticScoreDrop:.04,
      maxBlackRatioIncrease:.02,maxFreezeRatioIncrease:.05,maxSilenceRatioIncrease:.08
    },
    sourceRefs:['benchmark:bridge'],snapshotDigest:'b'.repeat(64),
    boundaries:{noSingleCompositeScore:true,criticalGateFailureCannotBeAveragedAway:true,exactMasterDigestBound:true,narrativeFilmAdmissionRequired:true,publicationAuthorityGranted:false},
    capturedAt:'2026-09-30T00:00:00Z'
  };
}
function setup(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-proof-'));
  const deliveryDir=path.join(root,'delivery');fs.mkdirSync(deliveryDir);
  const masterPath=path.join(deliveryDir,'master.mp4');
  fs.writeFileSync(masterPath,Buffer.from('narrative-master-bytes'));
  const masterSha=sha(masterPath);
  const renderPath=path.join(deliveryDir,'render.json');
  const qcPath=path.join(deliveryDir,'qc.json');
  const clipPath=path.join(deliveryDir,'clip.json');
  const adm=admission();
  const render:TimelineExportReceipt={
    schema:'evercraft.fallen.timeline-export-receipt.v1',projectId:'film',projectVersion:7,
    outputPath:masterPath,sha256:masterSha,sizeBytes:fs.statSync(masterPath).size,width:1920,
    height:1080,fps:30,durationSec:8,videoCodec:'h264',audioCodec:'aac',inputAssetIds:['s1'],
    audioMaster:{targetLufs:-14,truePeakDb:-1,lra:11,dialogueDucking:true,duckThreshold:.05,duckRatio:8,attackMs:20,releaseMs:350,sampleRate:48000},
    renderedAt:'2026-09-30T00:00:00Z',publicationAuthorityGranted:false
  };
  const qc:StudioMasterQcReceipt={
    schema:'evercraft.fallen.master-qc-receipt.v1',status:'accepted',path:masterPath,sha256:masterSha,
    measurements:{durationSec:8,width:1920,height:1080,fps:30,videoCodec:'h264',audioCodec:'aac',hasAudio:true,blackDurationSec:0,freezeDurationSec:0,silenceDurationSec:1,blackRatio:0,freezeRatio:0,silenceRatio:.125},
    policy:{expectedDurationSec:8,durationToleranceSec:.15,minShortEdge:1080,minFps:23.9,maxBlackRatio:.08,maxFreezeRatio:.35,maxSilenceRatio:.85,requireAudio:true,allowedVideoCodecs:['h264'],allowedAudioCodecs:['aac']},
    reasons:[],evidenceRefs:['sha256:'+masterSha],
    boundaries:{technicalQcOnly:true,creativeTournamentStillRequired:true,truthAndRightsGatesStillRequired:true,publicationAuthorityGranted:false},
    assessedAt:'2026-09-30T00:00:00Z'
  };
  const clip:ClipDeliveryManifest={
    schema:'evercraft.clip.media-intake.v1',deliveryId:'d',sourceApp:'fallen',
    sourceProjectId:'film',sourceProjectVersion:7,qualityMode:'narrative_film',
    state:'ready_for_clip_intake',
    media:{path:masterPath,sha256:masterSha,sizeBytes:fs.statSync(masterPath).size,width:1920,height:1080,fps:30,durationSec:8,videoCodec:'h264',audioCodec:'aac'},
    captions:[],metadata:{title:'Film',tags:[]},destinations:['youtube'],
    provenance:{inputAssetIds:['s1'],sourceRefs:['story'],continuityDigests:['continuity'],renderReceiptPath:renderPath,masterQcReceiptPath:qcPath,narrativeFilmAdmissionDigest:adm.admissionDigest},
    boundaries:{publicationAuthorityGranted:false,platformCredentialsConsumed:false,platformPublishStateAsserted:false,downstreamClipGateRequired:true,narrativeFilmAdmissionRequired:true},
    createdAt:'2026-09-30T00:00:00Z'
  };
  write(renderPath,render);write(qcPath,qc);write(clipPath,clip);
  const delivery:StudioDeliveryReceipt={
    schema:'evercraft.fallen.studio-delivery-receipt.v1',deliveryId:'d',outputDir:deliveryDir,
    videoPath:masterPath,renderReceiptPath:renderPath,masterQcReceiptPath:qcPath,
    clipManifestPath:clipPath,mediaSha256:masterSha,manifestSha256:sha(clipPath),
    state:'ready_for_clip_intake',qualityMode:'narrative_film',publicationAuthorityGranted:false
  };
  const evidencePath=path.join(root,'identity.json');
  write(evidencePath,{schema:'evidence',status:'accepted'});
  const bundle:FilmProofBundleInput={
    schema:'evercraft.fallen.film-proof-bundle-input.v1',id:'bridge-proof',
    filmAdmission:adm,benchmark:benchmark(masterSha),delivery,
    evidenceFiles:[{role:'identity-eli',path:evidencePath,expectedSha256:sha(evidencePath),sourceRefs:['identity:eli']}],
    sourceRefs:['story:bridge'],includeMaster:true
  };
  return {root,bundle,masterSha};
}

test('materializes and self-verifies one immutable narrative-film proof package',()=>{
  const {root,bundle,masterSha}=setup();
  const receipt=materializeFilmProofBundle({bundle,outputDir:path.join(root,'proofs')});
  assert.equal(receipt.verificationStatus,'accepted');
  assert.equal(receipt.masterIncluded,true);
  assert.ok(receipt.fileCount>=7);
  const verify=verifyFilmProofBundle(receipt.bundleDir);
  assert.equal(verify.status,'accepted');
  const manifest=JSON.parse(fs.readFileSync(receipt.manifestPath,'utf8'));
  assert.equal(manifest.masterSha256,masterSha);
  assert.equal(manifest.filmAdmissionDigest,'f'.repeat(64));
  assert.ok(manifest.files.some((entry:any)=>entry.role==='evidence:identity-eli'));
});

test('tampering with any bundled evidence makes verification fail',()=>{
  const {root,bundle}=setup();
  const receipt=materializeFilmProofBundle({bundle,outputDir:path.join(root,'proofs')});
  const evidence=path.join(receipt.bundleDir,'evidence','001-identity-eli.json');
  fs.appendFileSync(evidence,'tamper');
  const verify=verifyFilmProofBundle(receipt.bundleDir);
  assert.equal(verify.status,'rejected');
  assert.ok(verify.reasons.some(reason=>reason.startsWith('proof_entry_digest_mismatch:')));
});

test('delivery pointing at a different master than benchmark is rejected before packaging',()=>{
  const {root,bundle}=setup();
  bundle.benchmark.metrics.master.sha256='0'.repeat(64);
  assert.throws(
    ()=>materializeFilmProofBundle({bundle,outputDir:path.join(root,'proofs')}),
    /film_proof_benchmark_master_delivery_mismatch/
  );
});

test('clip manifest must remain bound to exact Film Admission',()=>{
  const {root,bundle}=setup();
  const clip=JSON.parse(fs.readFileSync(bundle.delivery.clipManifestPath,'utf8'));
  clip.provenance.narrativeFilmAdmissionDigest='0'.repeat(64);
  write(bundle.delivery.clipManifestPath,clip);
  bundle.delivery.manifestSha256=sha(bundle.delivery.clipManifestPath);
  assert.throws(
    ()=>materializeFilmProofBundle({bundle,outputDir:path.join(root,'proofs')}),
    /film_proof_clip_admission_digest_mismatch/
  );
});

test('master can be omitted from lightweight proof package while its digest remains bound',()=>{
  const {root,bundle,masterSha}=setup();
  bundle.includeMaster=false;
  const receipt=materializeFilmProofBundle({bundle,outputDir:path.join(root,'proofs')});
  assert.equal(receipt.masterIncluded,false);
  const manifest=JSON.parse(fs.readFileSync(receipt.manifestPath,'utf8'));
  assert.equal(manifest.masterSha256,masterSha);
  assert.equal(manifest.files.some((entry:any)=>entry.role==='master_video'),false);
  assert.equal(verifyFilmProofBundle(receipt.bundleDir).status,'accepted');
});
