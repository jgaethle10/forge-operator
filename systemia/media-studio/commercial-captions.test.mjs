import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {parseCommercialSrt,preflightCommercialCaptions} from './commercial-captions.mjs';

const healthy='1\n00:00:00,000 --> 00:00:01,500\nHome should feel like home.\n\n'+
  '2\n00:00:01,500 --> 00:00:03,000\nCome home to a haven.\n';
function source(t,value=healthy){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-captions-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const filePath=path.join(root,'captions.srt');fs.writeFileSync(filePath,value);
  return filePath;
}
test('preflights caption timing, length and source integrity without inventing human approval',t=>{
  const filePath=source(t);
  const p=preflightCommercialCaptions({filePath,aspectRatio:'9:16',durationSec:3});
  assert.equal(p.status,'text_and_timing_preflight_accepted');
  assert.equal(p.cues,2);
  assert.equal(p.humanReadabilityApproved,false);
  assert.equal(p.visualSafeAreaVerified,false);
  assert.equal(p.publicationAuthorityGranted,false);
});
test('rejects overlapped, overlong, out of program, and excessively dense vertical captions',t=>{
  const f=source(t,healthy.replace('00:00:01,500 --> 00:00:03,000',
    '00:00:01,400 --> 00:00:03,000'));
  assert.throws(()=>preflightCommercialCaptions({filePath:f,aspectRatio:'9:16',durationSec:3}),/overlapping/);
  fs.writeFileSync(f,healthy.replace('Home should feel like home.','These words are far too many to fit comfortably across this small phone'));
  assert.throws(()=>preflightCommercialCaptions({filePath:f,aspectRatio:'9:16',durationSec:3}),/line_too_long/);
  fs.writeFileSync(f,healthy.replace('00:00:01,500 --> 00:00:03,000','00:00:01,500 --> 00:00:04,000'));
  assert.throws(()=>preflightCommercialCaptions({filePath:f,aspectRatio:'9:16',durationSec:3}),/beyond_program/);
  fs.writeFileSync(f,'1\n00:00:00,000 --> 00:00:00,300\nA caption longer than you can read.\n');
  assert.throws(()=>preflightCommercialCaptions({filePath:f,aspectRatio:'9:16',durationSec:3}),/line_too_long|reading_speed_too_fast/);
});
test('rejects broken SRT ordering, unsanitized markup, too many lines and changed source bytes',t=>{
  const f=source(t);
  assert.throws(()=>preflightCommercialCaptions({filePath:f,aspectRatio:'9:16',
    durationSec:3,expectedSha256:'0'.repeat(64)}),/source_hash_mismatch/);
  fs.writeFileSync(f,healthy.replace('2\n00:00:01,500','3\n00:00:01,500'));
  assert.throws(()=>parseCommercialSrt(fs.readFileSync(f,'utf8')),/index_invalid/);
  fs.writeFileSync(f,healthy.replace('Come home to a haven.','<script>bad</script>'));
  assert.throws(()=>preflightCommercialCaptions({filePath:f,aspectRatio:'16:9',durationSec:3}),/markup/);
  fs.writeFileSync(f,healthy.replace('Come home to a haven.','Line one\nLine two\nLine three'));
  assert.throws(()=>preflightCommercialCaptions({filePath:f,aspectRatio:'16:9',durationSec:3}),/too_many_lines/);
});
test('three format policy is more restrictive for portrait without changing the SRT file',t=>{
  const f=source(t,healthy.replace('Home should feel like home.',
    'A caption that fits on landscape view.'));
  assert.equal(preflightCommercialCaptions({filePath:f,aspectRatio:'16:9',durationSec:3}).status,
    'text_and_timing_preflight_accepted');
  assert.throws(()=>preflightCommercialCaptions({filePath:f,aspectRatio:'9:16',durationSec:3}),/line_too_long/);
});
