import assert from 'node:assert/strict';
import test from 'node:test';
import { executionToShotCandidates, applySelectedExecutionToTimeline } from './timeline-ingest.js';
import { makeTimelineProject } from './timeline.js';
import type { VisualExecutionResult } from './model-fabric-runtime.js';
import type { ShotSelectionReceipt } from './types.js';

const execution:VisualExecutionResult={
  schema:'evercraft.fallen.visual-model-execution.v1',
  requestId:'req',
  status:'completed',
  completed:[
    {
      schema:'evercraft.fallen.visual-execution-receipt.v1',
      jobId:'candidate-a',
      requestId:'req',
      needId:'need-1',
      modelId:'runway:gen4.5',
      providerId:'runway',
      providerRequestId:'task-a',
      artifact:{
        path:'/tmp/a.mp4',digest:'a'.repeat(64),mimeType:'video/mp4',
        durationSec:5,aspectRatio:'16:9'
      },
      commercialRights:'allowed',
      provenance:'complete',
      continuityDigest:'continuity',
      sourceRefs:['provider:runway'],
      generatedAt:'2026-09-28T00:00:00Z'
    },
    {
      schema:'evercraft.fallen.visual-execution-receipt.v1',
      jobId:'candidate-b',
      requestId:'req',
      needId:'need-1',
      modelId:'elevenlabs:veo-3.1-fast-generate-001',
      providerId:'elevenlabs',
      providerRequestId:'generation-b',
      artifact:{
        path:'/tmp/b.mp4',digest:'b'.repeat(64),mimeType:'video/mp4',
        durationSec:5,aspectRatio:'16:9'
      },
      commercialRights:'allowed',
      provenance:'complete',
      continuityDigest:'continuity',
      sourceRefs:['provider:elevenlabs'],
      generatedAt:'2026-09-28T00:00:00Z'
    }
  ],
  failed:[],
  executionDigest:'e'.repeat(64),
  boundaries:{
    verifiedAdaptersOnly:true,
    planModelBindingEnforced:true,
    receiptArtifactDigestRequired:true,
    failedCandidatesDoNotBecomeAssets:true,
    publicationAuthorityGranted:false
  },
  completedAt:'2026-09-28T00:00:00Z'
};

test('turns provider execution receipts into tournament candidates without laundering synthetic media into observed evidence',()=>{
  const candidates=executionToShotCandidates({
    execution,shotId:'systemia-shot',aspectRatio:'16:9',subjectIds:['systemia']
  });
  assert.equal(candidates.length,2);
  assert.deepEqual(candidates.map(c=>c.providerId).sort(),['elevenlabs','runway']);
  assert.ok(candidates.every(c=>c.sourceState==='generated_visualization'));
  assert.ok(candidates.every(c=>c.syntheticLabelPresent===true));
});

test('winning candidate replaces exactly one timeline clip after tournament selection',()=>{
  const project=makeTimelineProject({
    id:'week',
    title:'Week in Motion',
    aspectRatio:'16:9',
    assets:[{
      id:'placeholder',
      path:'/tmp/placeholder.mp4',
      digest:'p'.repeat(64),
      kind:'video',
      sourceRefs:['storyboard:placeholder'],
      evidenceState:'synthetic_visualization',
      continuityDigest:'continuity'
    }],
    tracks:[{
      id:'picture',
      kind:'video',
      name:'Picture',
      clips:[{
        id:'systemia-shot',
        trackId:'picture',
        assetId:'placeholder',
        startSec:12,
        durationSec:5
      }]
    }]
  });

  const selection:ShotSelectionReceipt={
    schema:'evercraft.fallen.shot-selection-receipt.v1',
    needId:'need-1',
    candidateId:'candidate-b',
    artifactDigest:'b'.repeat(64),
    creativeGenomeDigest:'g'.repeat(64),
    tournamentReceiptDigest:'t'.repeat(64),
    selectedAt:'2026-09-28T00:00:00Z'
  };

  const result=applySelectedExecutionToTimeline({
    project,clipId:'systemia-shot',execution,selection,expectedVersion:1
  });
  const clip=result.project.tracks[0].clips[0];
  assert.equal(clip.assetId,'candidate-b-selected');
  assert.equal(clip.startSec,12);
  assert.equal(clip.durationSec,5);
  assert.equal(result.receipt.preserved.downstreamClipTiming,true);
});

test('cannot inject an artifact that did not win the recorded tournament',()=>{
  const project=makeTimelineProject({
    id:'week',title:'Week',aspectRatio:'16:9',
    assets:[{
      id:'placeholder',path:'/tmp/p.mp4',digest:'p'.repeat(64),kind:'video',
      sourceRefs:['placeholder']
    }],
    tracks:[{id:'picture',kind:'video',name:'Picture',clips:[{
      id:'shot',trackId:'picture',assetId:'placeholder',startSec:0,durationSec:5
    }]}]
  });
  const selection:ShotSelectionReceipt={
    schema:'evercraft.fallen.shot-selection-receipt.v1',
    needId:'need-1',
    candidateId:'invented',
    artifactDigest:'z'.repeat(64),
    creativeGenomeDigest:'g'.repeat(64),
    tournamentReceiptDigest:'t'.repeat(64),
    selectedAt:'2026-09-28T00:00:00Z'
  };
  assert.throws(()=>applySelectedExecutionToTimeline({
    project,clipId:'shot',execution,selection,expectedVersion:1
  }),/timeline_ingest_selected_artifact_missing/);
});
