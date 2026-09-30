import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  admitIdentityFingerprint,
  identityAdmissionToEvidence,
  prepareIdentityFingerprintPacket,
  type VisualIdentityVerifierReceipt,
} from './identity-fingerprint.js';

function run(args:string[]){
  const result=spawnSync('ffmpeg',args,{encoding:'utf8'});
  if(result.error) throw result.error;
  if(result.status!==0) throw new Error(result.stderr||'ffmpeg failed');
}

function sha(file:string){
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function fixture(root:string){
  const ref=path.join(root,'ref.png');
  const video=path.join(root,'candidate.mp4');
  run(['-y','-v','error','-f','lavfi','-i','color=c=#a06040:s=320x320','-frames:v','1',ref]);
  run([
    '-y','-v','error',
    '-f','lavfi','-i','color=c=#a36142:s=640x360:r=30',
    '-t','1','-c:v','libx264','-pix_fmt','yuv420p',video
  ]);
  return {ref,video};
}

test('binds gross appearance fingerprints to exact candidate/reference bytes and requires verified visual identity proof',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-identity-'));
  const {ref,video}=fixture(root);
  const packet=prepareIdentityFingerprintPacket({
    schema:'evercraft.fallen.identity-fingerprint-request.v1',
    id:'eli-shot-1',entityId:'eli',
    candidatePath:video,candidateSha256:sha(video),
    references:[{id:'eli-headshot',path:ref,sha256:sha(ref),sourceRefs:['canon:eli']}],
    samples:[
      {timestampSec:.2,region:{x:0,y:0,width:1,height:1}},
      {timestampSec:.5,region:{x:0,y:0,width:1,height:1}},
      {timestampSec:.8,region:{x:0,y:0,width:1,height:1}},
    ]
  });
  assert.equal(packet.samples.length,3);
  assert.equal(packet.boundaries.localFingerprintIsNotBiometricIdentityProof,true);
  assert.equal(packet.candidateSha256,sha(video));

  const receipt:VisualIdentityVerifierReceipt={
    schema:'evercraft.fallen.visual-identity-verifier-receipt.v1',
    packetDigest:packet.packetDigest,entityId:'eli',candidateSha256:packet.candidateSha256,
    referenceIds:['eli-headshot'],verifierId:'visual-verifier-1',verifierState:'verified',
    identityScore:.94,threshold:.86,
    sampledFrameSha256s:packet.samples.map(sample=>sample.frameSha256),findings:[]
  };
  const admission=admitIdentityFingerprint({
    packet,verifierReceipt:receipt,
    policy:{maxMeanDistance:1,maxSampleDistance:1}
  });
  assert.equal(admission.status,'accepted');
  const evidence=identityAdmissionToEvidence({admission,referenceAssetIds:['eli-headshot']});
  assert.equal(evidence.entityId,'eli');
  assert.equal(evidence.candidateDigest,packet.candidateSha256);
  assert.equal(evidence.verifierState,'verified');
});

test('cannot accept identity from a verifier receipt bound to different frames',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-identity-wrong-'));
  const {ref,video}=fixture(root);
  const packet=prepareIdentityFingerprintPacket({
    schema:'evercraft.fallen.identity-fingerprint-request.v1',
    id:'eli-shot-1',entityId:'eli',
    candidatePath:video,candidateSha256:sha(video),
    references:[{id:'eli-headshot',path:ref,sha256:sha(ref),sourceRefs:['canon:eli']}],
    samples:[
      {timestampSec:.2,region:{x:0,y:0,width:1,height:1}},
      {timestampSec:.7,region:{x:0,y:0,width:1,height:1}},
    ]
  });
  const receipt:VisualIdentityVerifierReceipt={
    schema:'evercraft.fallen.visual-identity-verifier-receipt.v1',
    packetDigest:packet.packetDigest,entityId:'eli',candidateSha256:packet.candidateSha256,
    referenceIds:['eli-headshot'],verifierId:'visual-verifier-1',verifierState:'verified',
    identityScore:.99,threshold:.86,
    sampledFrameSha256s:['0'.repeat(64)],findings:[]
  };
  const admission=admitIdentityFingerprint({
    packet,verifierReceipt:receipt,policy:{maxMeanDistance:1,maxSampleDistance:1}
  });
  assert.equal(admission.status,'rejected');
  assert.ok(admission.reasons.includes('identity_verifier_frame_coverage_missing'));
});

test('gross appearance drift can reject before visual verifier confidence launders it',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-identity-drift-'));
  const ref=path.join(root,'ref.png');
  const video=path.join(root,'candidate.mp4');
  run(['-y','-v','error','-f','lavfi','-i','color=c=white:s=320x320','-frames:v','1',ref]);
  run(['-y','-v','error','-f','lavfi','-i','testsrc2=size=640x360:rate=30','-t','1','-c:v','libx264','-pix_fmt','yuv420p',video]);
  const packet=prepareIdentityFingerprintPacket({
    schema:'evercraft.fallen.identity-fingerprint-request.v1',
    id:'eli-drift',entityId:'eli',candidatePath:video,candidateSha256:sha(video),
    references:[{id:'eli-ref',path:ref,sha256:sha(ref),sourceRefs:['canon:eli']}],
    samples:[
      {timestampSec:.2,region:{x:0,y:0,width:1,height:1}},
      {timestampSec:.7,region:{x:0,y:0,width:1,height:1}},
    ]
  });
  const receipt:VisualIdentityVerifierReceipt={
    schema:'evercraft.fallen.visual-identity-verifier-receipt.v1',
    packetDigest:packet.packetDigest,entityId:'eli',candidateSha256:packet.candidateSha256,
    referenceIds:['eli-ref'],verifierId:'v',verifierState:'verified',
    identityScore:1,threshold:.86,
    sampledFrameSha256s:packet.samples.map(sample=>sample.frameSha256)
  };
  const admission=admitIdentityFingerprint({
    packet,verifierReceipt:receipt,
    policy:{maxMeanDistance:.05,maxSampleDistance:.08}
  });
  assert.equal(admission.status,'rejected');
  assert.ok(admission.reasons.some(reason=>reason.startsWith('gross_appearance_')));
});

test('tampered candidate is rejected before frames are fingerprinted',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-identity-tamper-'));
  const {ref,video}=fixture(root);
  const expected=sha(video);
  fs.appendFileSync(video,Buffer.from('tamper'));
  assert.throws(()=>prepareIdentityFingerprintPacket({
    schema:'evercraft.fallen.identity-fingerprint-request.v1',
    id:'tamper',entityId:'eli',candidatePath:video,candidateSha256:expected,
    references:[{id:'ref',path:ref,sha256:sha(ref),sourceRefs:['canon:eli']}],
    samples:[
      {timestampSec:.2,region:{x:0,y:0,width:1,height:1}},
      {timestampSec:.7,region:{x:0,y:0,width:1,height:1}},
    ]
  }),/identity_candidate_digest_mismatch/);
});
