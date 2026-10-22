import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  exportWorldEngineSequence
} from './export-world-engine-sequence.js';
import {verifyVisualFrameContract} from '../../systemia/world-engine/visual.js';

const sha=(value:string|Buffer)=>crypto.createHash('sha256').update(value).digest('hex');

function temp(t:{after:(fn:()=>void)=>void}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-native-worldframe-'));
  t.after(()=>fs.rmSync(dir,{force:true,recursive:true}));
  return dir;
}

test('real EvercraftWorldRuntime emits canonical frames, snapshot receipts and an encode manifest',t=>{
  const dir=temp(t);
  const result=exportWorldEngineSequence({outputDir:dir,frames:4,fps:30});
  assert.equal(result.receipt.engineWasExecutedInThisProcess,true);
  assert.equal(result.receipt.customerFootage,false);
  assert.equal(result.receipt.framesEncodedByPhotonForge,false);
  assert.equal(result.receipt.publicationAuthority,false);
  assert.equal(result.receipt.frames.length,4);
  assert.equal(result.receipt.worldDefinitionDigest.length,64);
  assert.equal(result.manifest.framePaths.length,4);
  assert.equal(result.manifest.fps,30);
  assert.equal(new Set(result.receipt.frames.map(f=>f.digest)).size,4);
  const snapshotDigests=new Set(result.receipt.frames.map(f=>f.snapshotDigest));
  assert.equal(snapshotDigests.size,4);
  for(let i=0;i<4;i++){
    const meta=result.receipt.frames[i];
    const source=fs.readFileSync(path.join(dir,meta.path));
    const frame=JSON.parse(source.toString('utf8'));
    assert.equal(meta.sha256,sha(source));
    assert.equal(meta.digest,frame.digest);
    assert.equal(frame.worldId,result.receipt.worldId);
    assert.equal(frame.tick,i);
    assert.ok(Math.abs(frame.timeSec-i/30)<1e-9);
    assert.equal(frame.renderables.length,3);
    assert.equal(frame.camera.cameraId,'camera');
    assert.equal(verifyVisualFrameContract(frame),true);
  }
  assert.equal(sha(fs.readFileSync(path.join(dir,'geometry.json'))),result.receipt.geometrySha256);
  assert.equal(sha(fs.readFileSync(path.join(dir,'sequence.json'))),result.receipt.sequenceManifestSha256);
});

test('the same Evercraft World Engine inputs yield identical physical source bytes',t=>{
  const root=temp(t);
  const a=exportWorldEngineSequence({outputDir:path.join(root,'a'),frames:3,fps:30});
  const b=exportWorldEngineSequence({outputDir:path.join(root,'b'),frames:3,fps:30});
  assert.deepEqual(a.receipt.frames,b.receipt.frames);
  assert.equal(a.receipt.worldDefinitionDigest,b.receipt.worldDefinitionDigest);
  assert.equal(a.receipt.geometrySha256,b.receipt.geometrySha256);
  assert.equal(a.receipt.sequenceManifestSha256,b.receipt.sequenceManifestSha256);
});

test('producer rejects unsupported cadence and unreasonable frame counts',t=>{
  const dir=temp(t);
  assert.throws(()=>exportWorldEngineSequence({outputDir:dir,frames:3,fps:12}),/fps_invalid/);
  assert.throws(()=>exportWorldEngineSequence({outputDir:dir,frames:121,fps:30}),/frames_invalid/);
  assert.throws(()=>exportWorldEngineSequence({outputDir:dir,frames:1,fps:30}),/frames_invalid/);
});
