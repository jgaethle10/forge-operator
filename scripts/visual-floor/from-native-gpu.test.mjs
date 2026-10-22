import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {buildNativeFloorJobpack} from './from-native-gpu.mjs';
import {probeVideo} from './visual-floor.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-native-floor-fixture-'));
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));
const videoPath=path.join(root,'synthetic-contract-test.mp4');
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',
  '-f','lavfi','-i','testsrc2=size=640x360:rate=24:duration=4',
  '-an','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',videoPath],{timeout:30000});
const video=probeVideo(videoPath);
const sha='a'.repeat(64),shaB='b'.repeat(64);
const baseReceipt={
  schema:'evercraft.world-engine.cinematic-pixel-proof.v1',
  kind:'synthetic_internal_canary',
  sceneType:'original_3d_synthetic_data_constellation',
  worldDigest:sha,shaderSha256:'sha256:'+shaB,shadowShaderSha256:sha,
  firstFramePlanDigest:sha,lastFramePlanDigest:shaB,
  exactGpuReadbackFrames:96,uniqueRawFrameDigests:96,
  hardwareExecutionClaim:false,renderProfile:'contract-test-not-an-actual-gpu-run',
  output:{sha256:video.sha256,codec:'h264',width:640,height:360,
    fps:24,durationSec:4,audioCodec:null},
  dataConstellation:{nodeCount:75,linkCount:100,publicationAuthority:false,
    sourceNativeWebGpuScene:true,shaderFrameReadbackRequired:true},
  visualReviewState:'unreviewed',paidProductionReady:false,publicationAuthority:false
};
const receiptPath=path.join(root,'receipt.json');
function build(r=baseReceipt){
 fs.writeFileSync(receiptPath,JSON.stringify(r));
 return buildNativeFloorJobpack({videoPath,receiptPath});
}
test('Producer-file contract translates into authentic Visual Floor exact-shot work orders, NOT GPU authentication',()=>{
  const j=build();
  assert.equal(j.schema,'evercraft.graphics-command.production-jobpack.v1');
  assert.equal(j.frameCount,96);
  assert.deepEqual(j.shots.map(s=>[s.startFrame,s.frameCount]),[[0,32],[32,32],[64,32]]);
  assert.equal(j.visualFloor.workOrder.schema,'evercraft.visual-floor.work-order.v1');
  assert.equal(j.visualFloor.workOrder.digest.length,64);
  assert.equal(j.nativeEvidence.sourceMovieSha256,video.sha256);
  assert.equal(j.nativeEvidence.hardwareGpuVerified,false);
  assert.equal(j.nativeEvidence.source,'producer_supplied_receipt_not_independently_signed');
  assert.equal(j.visualFloor.publicationAuthority,false);
  assert.equal(j.customerReady,false);
});
test('Altered movie identity and fabricated hardware-gpu assertions fail closed',()=>{
  assert.throws(()=>build({...baseReceipt,output:{...baseReceipt.output,sha256:sha}}),/native_floor_video_receipt_mismatch/);
  assert.throws(()=>build({...baseReceipt,hardwareExecutionClaim:true}),/native_floor_frame_readback_invalid/);
});
test('Missing GPU frame identity, scene claim or signed-looking creative approval fails closed',()=>{
  assert.throws(()=>build({...baseReceipt,exactGpuReadbackFrames:95}),/native_floor_frame_readback_invalid/);
  assert.throws(()=>build({...baseReceipt,sceneType:'procedural_industrial_rotor'}),/native_floor_native_receipt_identity_invalid/);
  assert.throws(()=>build({...baseReceipt,publicationAuthority:true}),/native_floor_native_receipt_identity_invalid/);
});
test('Missing and malformed source checks block admission before any dailies are generated',()=>{
  assert.throws(()=>build({...baseReceipt,worldDigest:'1234'}),/native_floor_native_lineage_invalid/);
  assert.throws(()=>build({...baseReceipt,dataConstellation:{...baseReceipt.dataConstellation,nodeCount:0}}),/native_floor_scene_evidence_invalid/);
});

test('Canary contract packet can be decoded into actual three-shot visual dailies',()=>{
  const jobpackPath=path.join(root,'native-jobpack.json'),out=path.join(root,'boards');
  fs.writeFileSync(jobpackPath,JSON.stringify(build()));
  execFileSync('python3',['scripts/visual-floor/shot-dailies.py',
    '--video',videoPath,'--jobpack',jobpackPath,'--out',out],{timeout:30000});
  const receipt=JSON.parse(fs.readFileSync(path.join(out,'shot-dailies.json'),'utf8'));
  assert.equal(receipt.video.frameCount,96);
  assert.equal(receipt.shots.length,3);
  assert.equal(receipt.publicationAuthority,false);
  assert.ok(fs.statSync(path.join(out,'shot-dailies.jpg')).size>10000);
});
