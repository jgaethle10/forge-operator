import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {verifyDocumentarySources,SOURCE_PROOF_SCHEMA} from './documentary-source-proof.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-source-proof-'));
const video=path.join(root,'synthetic-not-camera.mp4');
const rendered=spawnSync('ffmpeg',['-y','-v','error','-f','lavfi','-i',
  'testsrc2=size=160x90:rate=24','-t','6','-c:v','libx264','-preset','ultrafast',
  '-pix_fmt','yuv420p',video],{encoding:'utf8',timeout:30000});
if(rendered.status!==0)throw new Error('fixture_render_failed:'+rendered.stderr);
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function manifest(){
  return {sources:[{id:'source-a',kind:'original_camera',path:video,sha256:hash(video),
    authorization:{confirmed:true,scope:'documentary_postproduction',
      authorized_by:'synthetic-fixture-only',confirmed_at:'2026-01-01T00:00:00Z'},
    rightsReviewRef:'synthetic-test-rights',privacyReviewRef:'synthetic-test-privacy',
    sourceOriginRef:'synthetic-test-origin'}],
    shots:[{id:'opening',type:'footage',sourceId:'source-a',sourceInSec:1.1,durationSec:2.5}]};
}
const run=m=>verifyDocumentarySources(m,{additionalRoots:[root]});

test('checks real encoded bytes and trim ranges but grants no publication authority',()=>{
  const r=run(manifest());
  assert.equal(r.schema,SOURCE_PROOF_SCHEMA);
  assert.equal(r.status,'verified_for_private_edit_input');
  assert.equal(r.checkedSources.length,1);
  assert.equal(r.checkedSources[0].sha256,hash(video));
  assert.equal(r.verifiedShotFootageSeconds,2.5);
  assert.equal(r.boundaries.noProofThoseSourcePixelsAppearInFinishedMaster,true);
  assert.equal(r.boundaries.publicationAuthorityGranted,false);
});
test('made-up source digest is rejected even with excellent declared rights',()=>{
  const m=manifest();m.sources[0].sha256='a'.repeat(64);
  assert.equal(run(m).status,'blocked');
  assert.ok(run(m).blockers.includes('source_hash_mismatch:source-a'));
});
test('source segment cannot extend past duration of actual video',()=>{
  const m=manifest();m.shots[0].sourceInSec=5;m.shots[0].durationSec=2;
  const r=run(m);assert.equal(r.status,'blocked');
  assert.ok(r.blockers.includes('shot_trim_outside_source:opening'));
});
test('outside media directory and symlink aliases are rejected',()=>{
  const m=manifest();
  const outside=fs.mkdtempSync(path.join(os.tmpdir(),'documentary-outside-'));
  const copy=path.join(outside,'outside.mp4');fs.copyFileSync(video,copy);
  m.sources[0].path=copy;
  assert.ok(run(m).blockers.includes('source_outside_admitted_roots:source-a'));
  const linked=path.join(root,'symlink.mp4');
  fs.symlinkSync(video,linked);m.sources[0].path=linked;
  assert.ok(run(m).blockers.includes('source_symlink_rejected:source-a'));
});
test('declared source authorization or rights references cannot be omitted',()=>{
  const m=manifest();
  m.sources[0].authorization.confirmed=false;
  m.sources[0].rightsReviewRef='';
  const r=run(m);
  assert.equal(r.status,'blocked');
  assert.ok(r.blockers.includes('source_authorization_declaration_missing:source-a'));
  assert.ok(r.blockers.includes('source_review_refs_missing:source-a'));
});
test('renaming an audio-only source as a camera file cannot pass ffprobe',()=>{
  const audio=path.join(root,'fake-camera.mp4');
  const process=spawnSync('ffmpeg',['-y','-v','error','-f','lavfi','-i',
    'sine=frequency=440:sample_rate=44100','-t','2','-c:a','aac',
    audio],{encoding:'utf8',timeout:15000});
  if(process.status!==0)throw new Error('audio_fixture_failed');
  const m=manifest();m.sources[0].path=audio;m.sources[0].sha256=hash(audio);
  const r=run(m);
  assert.equal(r.status,'blocked');
  assert.ok(r.blockers.includes('source_unverifiable:source-a'));
});
test('a nonexistent video cannot be claimed as footage',()=>{
  const m=manifest();m.sources[0].path=path.join(root,'missing.mp4');
  assert.ok(run(m).blockers.includes('source_missing:source-a'));
});
test('claimed source not referenced by an actual shot is not a successful proof',()=>{
  const m=manifest();m.shots=[];
  assert.ok(run(m).blockers.includes('verified_video_not_referenced_in_edit'));
});
