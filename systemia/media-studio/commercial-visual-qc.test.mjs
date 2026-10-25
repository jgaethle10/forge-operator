import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { inspectCommercialPicture,lumaActivity } from './commercial-visual-qc.mjs';

function fixture(t,source) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-picture-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=path.join(root,source+'.mp4');
  const video=source==='still'?'color=c=blue:s=320x180:r=24':'testsrc2=s=320x180:r=24';
  const result=spawnSync('ffmpeg',['-nostdin','-y','-v','error','-f','lavfi','-i',video,
    '-t','9','-c:v','mpeg4','-q:v','6',file],{encoding:'utf8'});
  if(result.status!==0)throw new Error(result.stderr);
  return file;
}
const beats=[
  {id:'hook',durationSec:3},
  {id:'show',durationSec:3},
  {id:'cta',durationSec:3},
];
test('moving picture produces an evidence-bound picture inspection',t=>{
  const file=fixture(t,'moving');
  const report=inspectCommercialPicture({filePath:file,beats});
  assert.equal(report.schema,'evercraft.fallen.commercial-visual-qc.v1');
  assert.equal(report.status,'accepted');
  assert.equal(report.segments.length,3);
  assert.equal(report.segments[0].beatId,'hook');
  assert.ok(report.segments.every(x=>x.sampleCount>=2));
  assert.match(report.masterSha256,/^[a-f0-9]{64}$/);
  assert.equal(report.boundaries.noVisualRealismOrQualityGuarantee,true);
  assert.equal(report.boundaries.publicationAuthorityGranted,false);
});
test('long motionless scenes are flagged for human review instead of certified cinematic',t=>{
  const file=fixture(t,'still');
  const report=inspectCommercialPicture({filePath:file,beats});
  assert.equal(report.status,'review_required');
  assert.ok(report.segments.every(x=>x.flags.includes('predominantly_low_motion')));
});
test('digest and mismatched storyboard timing reject misleading reports',t=>{
  const file=fixture(t,'moving');
  assert.throws(()=>inspectCommercialPicture({filePath:file,beats,expectedSha256:'f'.repeat(64)}),/visual_digest_mismatch/);
  assert.throws(()=>inspectCommercialPicture({filePath:file,beats:[...beats,{id:'extra',durationSec:2}]}),/storyboard_duration_mismatch/);
});
test('invalid frame buffers and policy cannot produce accepted evidence',t=>{
  assert.throws(()=>lumaActivity(Buffer.alloc(1),Buffer.alloc(1)),/frame_size_invalid/);
  const file=fixture(t,'moving');
  assert.throws(()=>inspectCommercialPicture({filePath:file,beats,policy:{maxStillFraction:3}}),/visual_policy_invalid/);
});
