import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  admitContinuityBoundary,
  prepareContinuityBoundary,
  type BoundaryContinuityMetric,
  type BoundaryVisualReceipt,
} from './continuity-boundary.js';
import type { ShotCandidate } from './shot-tournament.js';

function run(args:string[]){
  const result=spawnSync('ffmpeg',args,{encoding:'utf8'});
  if(result.error) throw result.error;
  if(result.status!==0) throw new Error(result.stderr||'ffmpeg failed');
}

function sha(file:string){
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function candidate(id:string,shotId:string,file:string):ShotCandidate{
  return {
    id,shotId,artifactPath:file,artifactDigest:sha(file),kind:'video',durationSec:1,
    aspectRatio:'16:9',sourceState:'generated_visualization',provenance:'complete',
    syntheticLabelPresent:true,subjectIds:['eli','fox'],observations:[],
  };
}

function receipts(packet:ReturnType<typeof prepareContinuityBoundary>,score=1):BoundaryVisualReceipt[]{
  return packet.requiredMetrics.map(metric=>({
    schema:'evercraft.fallen.boundary-visual-receipt.v1',
    packetDigest:packet.packetDigest,
    metric,
    verifierId:'visual-continuity-verifier-v1',
    verifierState:'verified',
    score,
    threshold:.8,
    previousArtifactDigest:packet.previous.artifactDigest,
    currentArtifactDigest:packet.current.artifactDigest,
    previousFrameSha256:packet.previous.signature.sha256,
    currentFrameSha256:packet.current.signature.sha256,
    entityIds:['eli','fox'],
    findings:[],
  }));
}

test('binds exact prior-end and next-start frames before accepting continuity evidence',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-boundary-'));
  const a=path.join(root,'a.mp4');
  const b=path.join(root,'b.mp4');
  run(['-y','-v','error','-f','lavfi','-i','color=c=#774411:s=640x360:r=30','-t','1','-c:v','libx264','-pix_fmt','yuv420p',a]);
  run(['-y','-v','error','-f','lavfi','-i','color=c=#794613:s=640x360:r=30','-t','1','-c:v','libx264','-pix_fmt','yuv420p',b]);

  const packet=prepareContinuityBoundary({
    id:'bridge-cut-1',
    continuityDigest:'c'.repeat(64),
    previous:candidate('a','shot-a',a),
    current:candidate('b','shot-b',b),
    entityIds:['eli','fox'],
    outputDir:root,
  });
  assert.ok(fs.existsSync(packet.previous.framePath));
  assert.ok(fs.existsSync(packet.current.framePath));
  assert.equal(packet.previous.signature.sha256.length,64);
  assert.equal(packet.current.signature.sha256.length,64);
  assert.equal(packet.packetDigest.length,64);

  const admission=admitContinuityBoundary({packet,receipts:receipts(packet)});
  assert.equal(admission.status,'accepted');
  assert.equal(admission.verifiedMetrics.length,7);
  assert.equal(admission.boundaries.localSimilarityIsNotIdentityProof,true);
});

test('a receipt for the wrong boundary frame cannot launder continuity',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-boundary-wrong-'));
  const a=path.join(root,'a.mp4');
  const b=path.join(root,'b.mp4');
  run(['-y','-v','error','-f','lavfi','-i','testsrc2=size=640x360:rate=30','-t','1','-c:v','libx264','-pix_fmt','yuv420p',a]);
  run(['-y','-v','error','-f','lavfi','-i','testsrc2=size=640x360:rate=30','-t','1','-c:v','libx264','-pix_fmt','yuv420p',b]);
  const packet=prepareContinuityBoundary({
    id:'boundary',continuityDigest:'c'.repeat(64),
    previous:candidate('a','a',a),current:candidate('b','b',b),entityIds:['eli'],
    requiredMetrics:['identity'],
    outputDir:root,
  });
  const evidence=receipts(packet).slice(0,1);
  evidence[0].currentFrameSha256='0'.repeat(64);
  const admission=admitContinuityBoundary({packet,receipts:evidence});
  assert.equal(admission.status,'rejected');
  assert.ok(admission.reasons.includes('receipt_boundary_evidence_mismatch:identity'));
});

test('missing or weak required visual metrics fail closed',()=>{
  const packet={
    schema:'evercraft.fallen.continuity-boundary-packet.v1' as const,
    id:'synthetic',
    continuityDigest:'c',
    previous:{
      artifactDigest:'a',candidateId:'a',shotId:'a',timestampSec:.9,framePath:'/tmp/a.jpg',
      signature:{sha256:'1'.repeat(64),perceptualHash:'0'.repeat(16),averageRgb:[.2,.2,.2] as [number,number,number],luminance:.2,edgeEnergy:.1}
    },
    current:{
      artifactDigest:'b',candidateId:'b',shotId:'b',timestampSec:.05,framePath:'/tmp/b.jpg',
      signature:{sha256:'2'.repeat(64),perceptualHash:'0'.repeat(16),averageRgb:[.2,.2,.2] as [number,number,number],luminance:.2,edgeEnergy:.1}
    },
    entityIds:['eli'],
    requiredMetrics:['identity','action_phase'] as BoundaryContinuityMetric[],
    localComparison:{perceptualDistance:0,colorDistance:0,luminanceDelta:0,edgeEnergyDelta:0},
    packetDigest:'p'.repeat(64),
    createdAt:new Date().toISOString(),
  };
  const identity:BoundaryVisualReceipt={
    schema:'evercraft.fallen.boundary-visual-receipt.v1',
    packetDigest:packet.packetDigest,metric:'identity',verifierId:'v',verifierState:'verified',
    score:.7,threshold:.8,previousArtifactDigest:'a',currentArtifactDigest:'b',
    previousFrameSha256:'1'.repeat(64),currentFrameSha256:'2'.repeat(64),entityIds:['eli']
  };
  const admission=admitContinuityBoundary({packet,receipts:[identity]});
  assert.equal(admission.status,'rejected');
  assert.ok(admission.reasons.includes('continuity_metric_failed:identity'));
  assert.ok(admission.reasons.includes('required_continuity_metric_missing:action_phase'));
});

test('match-cut policy can reject an objectively extreme boundary jump',()=>{
  const packet={
    schema:'evercraft.fallen.continuity-boundary-packet.v1' as const,
    id:'synthetic',continuityDigest:'c',
    previous:{artifactDigest:'a',candidateId:'a',shotId:'a',timestampSec:.9,framePath:'/tmp/a.jpg',signature:{sha256:'1'.repeat(64),perceptualHash:'0'.repeat(16),averageRgb:[0,0,0] as [number,number,number],luminance:0,edgeEnergy:0}},
    current:{artifactDigest:'b',candidateId:'b',shotId:'b',timestampSec:.05,framePath:'/tmp/b.jpg',signature:{sha256:'2'.repeat(64),perceptualHash:'f'.repeat(16),averageRgb:[1,1,1] as [number,number,number],luminance:1,edgeEnergy:1}},
    entityIds:[],requiredMetrics:[] as BoundaryContinuityMetric[],
    localComparison:{perceptualDistance:1,colorDistance:1,luminanceDelta:1,edgeEnergyDelta:1},
    packetDigest:'p'.repeat(64),createdAt:new Date().toISOString(),
  };
  const admission=admitContinuityBoundary({
    packet,receipts:[],policy:{requiredMetrics:[],matchCutExpected:true}
  });
  assert.equal(admission.status,'rejected');
  assert.ok(admission.reasons.includes('match_cut_perceptual_jump_excessive'));
  assert.ok(admission.reasons.includes('match_cut_color_jump_excessive'));
  assert.ok(admission.reasons.includes('match_cut_luminance_jump_excessive'));
});
