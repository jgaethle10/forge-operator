import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  admitDialogueSync,
  bestActivityAlignment,
  prepareDialogueSyncPacket,
  type DialogueSyncPacket,
  type VisualDialogueSyncReceipt,
} from './dialogue-sync-gate.js';
import type { IdentityEvidence } from './types.js';

function run(args:string[]){
  const result=spawnSync('ffmpeg',args,{encoding:'utf8'});
  if(result.error) throw result.error;
  if(result.status!==0) throw new Error(result.stderr||'ffmpeg failed');
}

function sha(file:string){
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('activity alignment recovers a known mouth delay',()=>{
  const audio=[0,0,.2,.8,1,.7,.2,0,0,0];
  const mouth=[0,0,0,.2,.8,1,.7,.2,0,0];
  const result=bestActivityAlignment({audioActivity:audio,mouthActivity:mouth,sampleStepMs:100,maxOffsetMs:400});
  assert.equal(result.bestOffsetMs,100);
  assert.ok(result.bestCorrelation>.95);
});

test('builds an exact-digest dialogue sync packet from real video/audio and mouth-track frames',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-dialogue-sync-'));
  const source=path.join(root,'source.mp4');
  const synced=path.join(root,'synced.mp4');
  const audio=path.join(root,'dialogue.wav');
  run(['-y','-v','error','-f','lavfi','-i','testsrc2=size=640x360:rate=30','-t','1.2','-c:v','libx264','-pix_fmt','yuv420p',source]);
  run(['-y','-v','error','-f','lavfi','-i','testsrc2=size=640x360:rate=30','-t','1.2','-c:v','libx264','-pix_fmt','yuv420p',synced]);
  run(['-y','-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','1.0','-c:a','pcm_s16le',audio]);

  const mouthTrack=Array.from({length:10},(_,index)=>({
    timestampSec:.1+index*.1,
    region:{x:.35,y:.4,width:.3,height:.2}
  }));
  const packet=prepareDialogueSyncPacket({
    schema:'evercraft.fallen.dialogue-sync-request.v1',
    id:'eli-line-1',speakerId:'eli',
    sourceVideoPath:source,sourceVideoSha256:sha(source),
    syncedVideoPath:synced,syncedVideoSha256:sha(synced),
    dialogueAudioPath:audio,dialogueAudioSha256:sha(audio),
    mouthTrack,mouthTrackEvidenceRefs:['tracker:eli-face-v1'],
    identityEvidence:[]
  });
  assert.equal(packet.samples.length,10);
  assert.equal(packet.sourceVideoSha256,sha(source));
  assert.equal(packet.syncedVideoSha256,sha(synced));
  assert.equal(packet.boundaries.localActivityIsNotPhonemeProof,true);
  assert.equal(packet.packetDigest.length,64);
});

function acceptedPacket():DialogueSyncPacket{
  return {
    schema:'evercraft.fallen.dialogue-sync-packet.v1',
    id:'line',speakerId:'eli',
    sourceVideoSha256:'a'.repeat(64),syncedVideoSha256:'b'.repeat(64),dialogueAudioSha256:'c'.repeat(64),
    duration:{sourceVideoSec:4,syncedVideoSec:4,dialogueAudioSec:3.6},
    samples:Array.from({length:8},(_,index)=>({
      timestampSec:index*.4,frameSha256:String(index).padStart(64,'0'),mouthCropSha256:'d'.repeat(64),
      audioActivity:index%2?1:.1,mouthActivity:index%2?.9:.1
    })),
    alignment:{zeroLagCorrelation:.88,bestCorrelation:.92,bestOffsetMs:60,audioActiveFraction:.5,mouthActiveFraction:.5},
    mouthTrackEvidenceRefs:['tracker:verified'],
    packetDigest:'p'.repeat(64),
    boundaries:{
      exactMediaDigestsBound:true,objectiveActivityAlignmentMeasured:true,
      localActivityIsNotPhonemeProof:true,verifiedVisualSyncReceiptRequired:true,
      postSyncIdentityEvidenceRequired:true,publicationAuthorityGranted:false
    },
    createdAt:'2026-09-30T00:00:00Z'
  };
}

function identity(packet:DialogueSyncPacket):IdentityEvidence[]{
  return [{
    entityId:'eli',verifierId:'identity-v',verifierState:'verified',
    score:.95,threshold:.86,referenceAssetIds:['eli-ref'],candidateDigest:packet.syncedVideoSha256
  }];
}

function visual(packet:DialogueSyncPacket):VisualDialogueSyncReceipt{
  return {
    schema:'evercraft.fallen.visual-dialogue-sync-receipt.v1',
    packetDigest:packet.packetDigest,speakerId:'eli',
    syncedVideoSha256:packet.syncedVideoSha256,dialogueAudioSha256:packet.dialogueAudioSha256,
    verifierId:'visual-sync-v',verifierState:'verified',
    phonemeMouthScore:.91,nonSpeakingMouthStabilityScore:.9,identityPreservationScore:.94,
    threshold:.82,sampledFrameSha256s:packet.samples.map(sample=>sample.frameSha256)
  };
}

test('accepts only when objective alignment, visual sync and post-sync identity all pass',()=>{
  const packet=acceptedPacket();
  const admission=admitDialogueSync({
    packet,visualReceipt:visual(packet),identityEvidence:identity(packet)
  });
  assert.equal(admission.status,'accepted');
  assert.equal(admission.identityScore,.95);
  assert.equal(admission.visualSyncScore,.91);
  assert.equal(admission.boundaries.providerSuccessIsNotAdmission,true);
});

test('provider output with good timing but missing post-sync identity evidence is rejected',()=>{
  const packet=acceptedPacket();
  const admission=admitDialogueSync({
    packet,visualReceipt:visual(packet),identityEvidence:[]
  });
  assert.equal(admission.status,'rejected');
  assert.ok(admission.reasons.includes('post_sync_identity_evidence_missing_or_failed'));
});

test('visual sync receipt for the wrong sampled frames cannot be reused',()=>{
  const packet=acceptedPacket();
  const receipt=visual(packet);
  receipt.sampledFrameSha256s=['x'.repeat(64)];
  const admission=admitDialogueSync({
    packet,visualReceipt:receipt,identityEvidence:identity(packet)
  });
  assert.equal(admission.status,'rejected');
  assert.ok(admission.reasons.includes('dialogue_sync_receipt_frame_coverage_missing'));
});

test('objective audio-mouth timing offset can fail even if visual verifier likes the result',()=>{
  const packet=acceptedPacket();
  packet.alignment.bestOffsetMs=320;
  const admission=admitDialogueSync({
    packet,visualReceipt:visual(packet),identityEvidence:identity(packet)
  });
  assert.equal(admission.status,'rejected');
  assert.ok(admission.reasons.includes('av_activity_offset_too_large'));
});
