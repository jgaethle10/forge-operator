import assert from 'node:assert/strict';
import test from 'node:test';
import { makeTimelineProject, timelineDigest } from './timeline.js';
import type { NarrativeFilmAdmissionReceipt } from './narrative-film-admission.js';
import {
  buildClipDeliveryManifest,
  type StudioDeliveryRequest,
} from './studio-delivery.js';
import type { TimelineExportReceipt } from './timeline-export.js';

function request():StudioDeliveryRequest{
  return {
    schema:'evercraft.fallen.studio-delivery-request.v1',
    id:'delivery-1',
    slug:'Week in Motion 01',
    project:makeTimelineProject({
      id:'week-1',
      title:'Week in Motion',
      aspectRatio:'16:9',
      fps:30,
      assets:[
        {
          id:'shot',
          path:'/tmp/shot.mp4',
          digest:'a'.repeat(64),
          kind:'video',
          sourceRefs:['source:shot'],
          evidenceState:'observed',
          continuityDigest:'continuity-a',
        },
        {
          id:'captions',
          path:'/tmp/captions.srt',
          digest:'b'.repeat(64),
          kind:'captions',
          sourceRefs:['caption:script'],
        },
      ],
      tracks:[
        {
          id:'picture',
          kind:'video',
          name:'Picture',
          clips:[{
            id:'shot-clip',
            trackId:'picture',
            assetId:'shot',
            startSec:0,
            durationSec:3,
          }],
        },
        {
          id:'captions',
          kind:'captions',
          name:'Captions',
          clips:[{
            id:'caption-clip',
            trackId:'captions',
            assetId:'captions',
            startSec:0,
            durationSec:3,
          }],
        },
      ],
    }),
    destinations:['youtube','linkedin','youtube'],
    metadata:{
      title:'Week in Motion',
      description:'A proof-backed update.',
      tags:['evercraft',' systemia ','evercraft'],
      language:'en',
    },
  };
}



function narrativeAdmission(r:StudioDeliveryRequest):NarrativeFilmAdmissionReceipt{
  return {
    schema:'evercraft.fallen.narrative-film-admission.v1',
    id:'film-admission',
    projectId:r.project.id,
    projectVersion:r.project.version,
    projectTimelineDigest:timelineDigest(r.project),
    sequenceId:'sequence-1',
    sequencePlanDigest:'s'.repeat(64),
    performancePlanDigest:'p'.repeat(64),
    aestheticReportDigest:'a'.repeat(64),
    status:'accepted',
    reasons:[],
    warnings:[],
    shots:[],
    admissionDigest:'f'.repeat(64),
    boundaries:{
      finalTimelineBytesBound:true,
      everyVisibleCharacterIdentityBound:true,
      continuousCutsRequireBoundaryAdmission:true,
      dialogueShotsRequireDialogueAdmission:true,
      postSelectionFinishesMustBeAdmitted:true,
      sequenceAestheticAdmissionRequired:true,
      deliveryMustRequireThisReceiptForNarrativeFilm:true,
      masterQcStillRequiredAtDelivery:true,
      publicationAuthorityGranted:false,
    },
    admittedAt:'2026-09-30T00:00:00Z',
  };
}

function receipt():TimelineExportReceipt{
  return {
    schema:'evercraft.fallen.timeline-export-receipt.v1',
    projectId:'week-1',
    projectVersion:1,
    outputPath:'/tmp/final.mp4',
    sha256:'c'.repeat(64),
    sizeBytes:12345,
    width:1920,
    height:1080,
    fps:30,
    durationSec:3,
    videoCodec:'h264',
    audioCodec:'aac',
    inputAssetIds:['shot','captions'],
    audioMaster:{
      targetLufs:-14,
      truePeakDb:-1,
      lra:11,
      dialogueDucking:true,
      duckThreshold:.05,
      duckRatio:8,
      attackMs:20,
      releaseMs:350,
      sampleRate:48000,
    },
    renderedAt:'2026-09-30T00:00:00Z',
    publicationAuthorityGranted:false,
  };
}

test('builds a Clip-ready manifest without claiming publication',()=>{
  const manifest=buildClipDeliveryManifest({
    request:request(),
    renderReceipt:receipt(),
    renderReceiptPath:'/tmp/final.render-receipt.json',
    masterQcReceiptPath:'/tmp/final.master-qc.json',
  });
  assert.equal(manifest.schema,'evercraft.clip.media-intake.v1');
  assert.equal(manifest.state,'ready_for_clip_intake');
  assert.equal(manifest.sourceApp,'fallen');
  assert.deepEqual(manifest.destinations,['youtube','linkedin']);
  assert.deepEqual(manifest.metadata.tags,['evercraft','systemia']);
  assert.equal(manifest.media.sha256,'c'.repeat(64));
  assert.equal(manifest.captions.length,1);
  assert.deepEqual(manifest.provenance.sourceRefs.sort(),['caption:script','source:shot']);
  assert.deepEqual(manifest.provenance.continuityDigests,['continuity-a']);
  assert.equal(manifest.boundaries.publicationAuthorityGranted,false);
  assert.equal(manifest.boundaries.platformCredentialsConsumed,false);
  assert.equal(manifest.boundaries.platformPublishStateAsserted,false);
  assert.equal(manifest.boundaries.downstreamClipGateRequired,true);
  assert.match(manifest.provenance.masterQcReceiptPath,/final\.master-qc\.json$/);
});

test('render receipt must belong to the exact project version',()=>{
  const r=receipt();
  r.projectVersion=2;
  assert.throws(
    ()=>buildClipDeliveryManifest({
      request:request(),
      renderReceipt:r,
      renderReceiptPath:'/tmp/r.json',
      masterQcReceiptPath:'/tmp/qc.json',
    }),
    /studio_delivery_render_version_mismatch/
  );
});

test('delivery requires an explicit destination and title',()=>{
  const noDest=request();
  noDest.destinations=[];
  assert.throws(
    ()=>buildClipDeliveryManifest({
      request:noDest,
      renderReceipt:receipt(),
      renderReceiptPath:'/tmp/r.json',
      masterQcReceiptPath:'/tmp/qc.json',
    }),
    /studio_delivery_destinations_missing/
  );

  const noTitle=request();
  noTitle.metadata.title=' ';
  assert.throws(
    ()=>buildClipDeliveryManifest({
      request:noTitle,
      renderReceipt:receipt(),
      renderReceiptPath:'/tmp/r.json',
      masterQcReceiptPath:'/tmp/qc.json',
    }),
    /studio_delivery_title_missing/
  );
});


test('narrative film delivery fails closed without an exact Film Admission receipt',()=>{
  const r=request();
  r.qualityMode='narrative_film';
  assert.throws(
    ()=>buildClipDeliveryManifest({
      request:r,
      renderReceipt:receipt(),
      renderReceiptPath:'/tmp/r.json',
      masterQcReceiptPath:'/tmp/qc.json',
    }),
    /studio_delivery_narrative_film_admission_rejected:narrative_film_admission_missing/
  );
});

test('accepted narrative film admission is bound into the Clip intake manifest',()=>{
  const r=request();
  r.qualityMode='narrative_film';
  r.narrativeFilmAdmission=narrativeAdmission(r);
  const manifest=buildClipDeliveryManifest({
    request:r,
    renderReceipt:receipt(),
    renderReceiptPath:'/tmp/r.json',
    masterQcReceiptPath:'/tmp/qc.json',
  });
  assert.equal(manifest.qualityMode,'narrative_film');
  assert.equal(manifest.boundaries.narrativeFilmAdmissionRequired,true);
  assert.equal(manifest.provenance.narrativeFilmAdmissionDigest,'f'.repeat(64));
});

test('editing the timeline after Film Admission invalidates narrative delivery',()=>{
  const r=request();
  r.qualityMode='narrative_film';
  r.narrativeFilmAdmission=narrativeAdmission(r);
  r.project.version+=1;
  r.project.tracks[0].clips[0].durationSec=2.5;
  assert.throws(
    ()=>buildClipDeliveryManifest({
      request:r,
      renderReceipt:{...receipt(),projectVersion:r.project.version},
      renderReceiptPath:'/tmp/r.json',
      masterQcReceiptPath:'/tmp/qc.json',
    }),
    /narrative_film_project_version_mismatch/
  );
});
