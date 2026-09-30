import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { compileStudioDraft, type StudioDraftPlan } from './studio-create.js';
import { captionsToSrt, resolveStudioDraft } from './studio-resolve.js';
import type { StudioResolutionItem } from './studio-resolve.js';

function draft(){
  const plan:StudioDraftPlan={
    schema:'evercraft.fallen.studio-draft-plan.v1',
    id:'resolve-test',
    title:'Resolve Test',
    prompt:'A short narrated product proof.',
    aspectRatio:'16:9',
    continuityDigest:'continuity',
    sourceAssets:[{
      id:'real-shot',
      path:'/tmp/real-shot.mp4',
      kind:'video',
      rights:'owned',
      digest:'1'.repeat(64),
      sourceRefs:['test:real-shot'],
    }],
    scenes:[{
      id:'scene-a',
      durationSec:3,
      visual:{assetId:'real-shot',sourceRefs:['test:real-shot']},
      narration:{text:'Proof should survive the handoff.',language:'en'},
    }],
    captions:{enabled:true},
  };
  return compileStudioDraft(plan);
}

function speechResolution():StudioResolutionItem{
  return {
    needId:'resolve-test-scene-a-speech',
    route:{
      needId:'resolve-test-scene-a-speech',
      status:'routed',
      departmentId:'voice-a',
      departmentName:'Voice A',
      score:450,
      reason:'verified route',
    },
    artifact:{
      path:'/tmp/resolved-voice.mp3',
      digest:'2'.repeat(64),
      kind:'audio',
      durationSec:3,
    },
    receipt:{
      schema:'evercraft.fallen.production-receipt.v1',
      needId:'resolve-test-scene-a-speech',
      departmentId:'voice-a',
      continuityDigest:'continuity',
      artifactDigest:'2'.repeat(64),
      commercialRights:'allowed',
      provenance:'complete',
      durationSec:3,
      providerModel:'test-tts',
      providerRequestId:'tts-1',
      generatedAt:'2026-09-29T00:00:00Z',
    },
    sourceRefs:['provider:test-tts'],
  };
}

test('caption cues materialize into deterministic SRT timing',()=>{
  const srt=captionsToSrt([
    {id:'b',startSec:1.25,endSec:2.5,text:'Second line'},
    {id:'a',startSec:0,endSec:1,text:'First line'},
  ]);
  assert.match(srt,/1\n00:00:00,000 --> 00:00:01,000\nFirst line/);
  assert.match(srt,/2\n00:00:01,250 --> 00:00:02,500\nSecond line/);
});

test('accepted speech replaces its pending timeline clip and materializes captions',()=>{
  const captionPath='/tmp/fallen-studio-resolve-test.srt';
  fs.rmSync(captionPath,{force:true});
  const result=resolveStudioDraft({
    bundle:draft(),
    resolutions:[speechResolution()],
    captionOutputPath:captionPath,
  });
  assert.equal(result.status,'ready_for_export');
  assert.deepEqual(result.remainingNeedIds,[]);
  assert.equal(result.admissions[0].status,'accepted');
  assert.equal(result.mutationReceipts.length,1);
  assert.ok(fs.existsSync(captionPath));
  const voice=result.bundle.project.tracks.find(track=>track.kind==='voice')!;
  assert.match(voice.clips[0].assetId,/^resolved-resolve-test-scene-a-speech-/);
  const captions=result.bundle.project.tracks.find(track=>track.kind==='captions')!;
  assert.equal(captions.clips[0].startSec,0);
  assert.ok(result.captionAssetId);
});

test('visual production cannot bypass the Shot Tournament selection receipt',()=>{
  const bundle=draft();
  bundle.productionNeeds.push({
    id:'resolve-test-generated-visual',
    kind:'video',
    prompt:'Generated proof shot',
    durationSec:3,
    aspectRatio:'16:9',
    continuityDigest:'continuity',
    requires:['commercial_rights','provenance_receipt','timing_control'],
    status:'planned',
  });
  bundle.project.assets.push({
    id:'asset-resolve-test-generated-visual',
    path:'pending://production/resolve-test-generated-visual',
    digest:'3'.repeat(64),
    kind:'video',
    sourceRefs:['production-need:resolve-test-generated-visual'],
  });
  bundle.project.tracks[0].clips[0].assetId='asset-resolve-test-generated-visual';

  const item:StudioResolutionItem={
    needId:'resolve-test-generated-visual',
    route:{
      needId:'resolve-test-generated-visual',
      status:'routed',
      departmentId:'video-a',
      reason:'verified route',
    },
    artifact:{
      path:'/tmp/generated.mp4',
      digest:'4'.repeat(64),
      kind:'video',
      durationSec:3,
      aspectRatio:'16:9',
    },
    receipt:{
      schema:'evercraft.fallen.production-receipt.v1',
      needId:'resolve-test-generated-visual',
      departmentId:'video-a',
      continuityDigest:'continuity',
      artifactDigest:'4'.repeat(64),
      commercialRights:'allowed',
      provenance:'complete',
      durationSec:3,
      generatedAt:'2026-09-29T00:00:00Z',
    },
    sourceRefs:['provider:test-video'],
  };

  assert.throws(
    ()=>resolveStudioDraft({bundle,resolutions:[item],captionOutputPath:'/tmp/x.srt'}),
    /studio_resolution_visual_selection_missing:resolve-test-generated-visual/
  );
});

test('rejected production does not mutate the timeline',()=>{
  const item=speechResolution();
  item.receipt.commercialRights='unknown';
  const result=resolveStudioDraft({bundle:draft(),resolutions:[item],captionOutputPath:'/tmp/rejected.srt'});
  assert.equal(result.status,'blocked');
  assert.equal(result.admissions[0].status,'rejected');
  assert.equal(result.mutationReceipts.length,0);
  assert.equal(result.remainingNeedIds[0],'resolve-test-scene-a-speech');
});
