import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {inspectDocumentarySourceConcordance} from './documentary-source-concordance.mjs';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-pixel-concordance-'));
function run(args){const r=spawnSync('ffmpeg',['-y','-v','error',...args],{encoding:'utf8',timeout:60000});
  if(r.status!==0)throw Error('test_render_failed:'+r.stderr);}
const source=path.join(dir,'synthetic-source.mp4'),master=path.join(dir,'master.mp4'),unrelated=path.join(dir,'unrelated.mp4');
run(['-f','lavfi','-i','testsrc2=size=320x180:rate=24','-t','6','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',source]);
run(['-ss','1','-i',source,'-t','4','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',master]);
run(['-f','lavfi','-i','color=c=black:size=320x180:rate=24','-t','4','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',unrelated]);
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const fixture=(file=master)=>({masterPath:file,expectedMasterSha256:sha(file),
  sources:[{id:'a',path:source,sha256:sha(source)}],
  shots:[{id:'observed',type:'footage',startSec:0,sourceInSec:1,durationSec:4,sourceId:'a'}]});

test('real FFmpeg scene copy correlates exact source frames with decoded master',()=>{
  const r=inspectDocumentarySourceConcordance(fixture());
  assert.equal(r.status,'pixel_concordance_verified_for_private_review');
  assert.equal(r.sourceMatches[0].status,'correlated');
  assert.ok(r.sourceMatches[0].correlation>=.58);
  assert.equal(r.boundaries.publicationAuthorityGranted,false);
});
test('visually unrelated film cannot be certified merely by source metadata',()=>{
  const r=inspectDocumentarySourceConcordance(fixture(unrelated));
  assert.equal(r.status,'blocked');
  assert.ok(r.blockers.includes('source_to_master_pixel_mismatch:observed'));
});
test('master hash mismatch blocks before decoding sources',()=>{
  const f=fixture();f.expectedMasterSha256='0'.repeat(64);
  assert.deepEqual(inspectDocumentarySourceConcordance(f).blockers,['master_digest_mismatch']);
});
test('missing source timing or referenced media blocks',()=>{
  const f=fixture();delete f.shots[0].sourceInSec;
  assert.ok(inspectDocumentarySourceConcordance(f).blockers.includes('source_alignment_missing:observed'));
  f.shots=[];assert.ok(inspectDocumentarySourceConcordance(f).blockers.includes('real_footage_shots_missing'));
});
test('a fabricated path cannot be confused with an observed frame',()=>{
  const f=fixture();f.sources[0].path=path.join(dir,'does-not-exist.mp4');
  assert.ok(inspectDocumentarySourceConcordance(f).blockers.includes('source_to_master_pixel_inspection_failed:observed'));
});
