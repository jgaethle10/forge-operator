import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { assessDocumentaryMaster, inspectDocumentaryMaster, SCHEMA } from './documentary-master-preflight.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-doc-master-'));
const video=path.join(root,'synthetic-only.mp4');
const render=spawnSync('ffmpeg',['-y','-hide_banner','-loglevel','error',
  '-f','lavfi','-i','testsrc2=size=1280x720:rate=24',
  '-f','lavfi','-i','sine=frequency=173:sample_rate=48000',
  '-t','45','-vf','format=yuv420p','-af','loudnorm=I=-16:TP=-1.5:LRA=7',
  '-c:v','libx264','-preset','ultrafast','-crf','33','-c:a','aac','-b:a','128k','-shortest',video],
  {encoding:'utf8',timeout:120000});
if(render.status!==0)throw new Error('synthetic media render failed: '+render.stderr);
const actual=inspectDocumentaryMaster(video);
const specimen=()=>({schema:SCHEMA,classification:'internal_spec',declaredSyntheticOrFirstParty:true,
  expectedSha256:actual.masterSha256});
test('45-second real encoded specimen is technically verified as internal-only',()=>{
  assert.equal(actual.durationSec,45);
  assert.equal(actual.videoCodec,'h264');
  assert.equal(actual.audioCodec,'aac');
  assert.equal(actual.width,1280);assert.equal(actual.height,720);
  const out=assessDocumentaryMaster(specimen(),actual);
  assert.equal(out.status,'internal_spec_verified');
  assert.deepEqual(out.reasons,[]);
  assert.equal(out.boundaries.clientApprovalGranted,false);
  assert.equal(out.boundaries.publicationAuthorityGranted,false);
});
test('changed bytes break exact master digest even when all codecs pass',()=>{
  const s=specimen();s.expectedSha256='b'.repeat(64);
  const r=assessDocumentaryMaster(s,actual);
  assert.equal(r.status,'blocked');assert.ok(r.reasons.includes('master_digest_mismatch'));
});
test('low resolution film can pass an internal proof but not client preview',()=>{
  const s=specimen();s.classification='authorized_client_preview';
  const r=assessDocumentaryMaster(s,actual);
  assert.equal(r.status,'blocked');assert.ok(r.reasons.includes('short_edge_too_small'));
});
test('client readiness cannot bypass editorial, rights and human playback gates',()=>{
  const s=specimen();s.classification='authorized_client_preview';
  const pretend1080={...actual,width:1920,height:1080};
  const r=assessDocumentaryMaster(s,pretend1080);
  for(const reason of ['private_intake_receipt_missing','editorial_review_missing',
    'human_playback_review_missing','independent_rights_verification_missing','private_preview_consent_missing'])
    assert.ok(r.reasons.includes(reason));
});
test('loudness or peak overshoot blocks even a synthetic-only technical proof',()=>{
  const r=assessDocumentaryMaster(specimen(),{...actual,integratedLufs:-23,truePeakDbfs:0});
  assert.equal(r.status,'blocked');assert.ok(r.reasons.includes('audio_loudness_outside_gate'));
  assert.ok(r.reasons.includes('true_peak_above_gate'));
});
test('missing technical details and synthetic source declaration fail closed',()=>{
  const s=specimen();s.declaredSyntheticOrFirstParty=false;
  const r=assessDocumentaryMaster(s,{...actual,audioStreamCount:0,videoCodec:null});
  assert.equal(r.status,'blocked');
  assert.ok(r.reasons.includes('internal_source_declaration_missing'));
  assert.ok(r.reasons.includes('stream_counts_invalid'));
  assert.ok(r.reasons.includes('codecs_invalid'));
});
