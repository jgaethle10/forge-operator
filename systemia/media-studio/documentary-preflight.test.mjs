import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectDocumentaryEvidence, inspectPortableMaster } from './documentary-preflight.mjs';

function example(){
  const digest='a'.repeat(64);
  return {schema:'evercraft.fallen.documentary-preflight-input.v1',editorialReviewerRef:'review:editor-1',
    project:{schema:'evercraft.fallen.timeline.v1',id:'nebraska',assets:[{id:'img',digest,kind:'image',evidenceState:'synthetic_visualization',sourceRefs:['generated:art']}],tracks:[{kind:'video',clips:[{id:'shot-1',assetId:'img',startSec:0,durationSec:3}]}]},
    claims:[{id:'a',text:'Example verified claim',sourceRefs:['official:example'],reviewState:'verified',reviewerRef:'human:checker'}],
    scenes:[{clipId:'shot-1',assetId:'img',assetSha256:digest,portrayal:'synthetic',disclosureText:'Illustrative AI imagery',disclosureReviewRef:'human:disclosure',rights:{status:'cleared',evidenceRef:'grant:example',usageScope:'documentary'},claimIds:['a']}],
  };
}
test('editorial pass still cannot publish or assert source verification',()=>{
  const r=inspectDocumentaryEvidence(example());
  assert.equal(r.status,'preflight_complete_human_review_required');
  assert.equal(r.boundaries.publicationAuthorityGranted,false);
  assert.equal(r.boundaries.sourceContentIndependentlyChecked,false);
});
test('blocks synthetic image incorrectly claimed as game footage',()=>{
  const x=example();x.scenes[0].portrayal='actual_event';x.scenes[0].eventDate='2026-10-17';x.scenes[0].captureDate='2026-10-17';x.scenes[0].eventRef='game:oregon';
  assert.ok(inspectDocumentaryEvidence(x).failures.some(y=>y.startsWith('synthetic_depicted_as_event')));
});
test('blocks unverifiable licensing and missing disclosure',()=>{
  const x=example();x.scenes[0].rights.status='pending';delete x.scenes[0].disclosureText;
  assert.ok(inspectDocumentaryEvidence(x).failures.some(y=>y.startsWith('rights_clearance_missing')));
  assert.ok(inspectDocumentaryEvidence(x).failures.some(y=>y.startsWith('synthetic_disclosure_unreviewed')));
});
test('blocks missing evidence for a factual claim',()=>{
  const x=example();x.claims[0].sourceRefs=[];x.claims[0].reviewState='unverified';
  assert.ok(inspectDocumentaryEvidence(x).failures.some(y=>y.startsWith('claim_source_missing')));
  assert.ok(inspectDocumentaryEvidence(x).failures.some(y=>y.startsWith('claim_human_verification_missing')));
});
test('blocks unlisted picture clip',()=>{
  const x=example();x.project.tracks[0].clips.push({id:'unlisted',assetId:'img',startSec:3,durationSec:2});
  assert.ok(inspectDocumentaryEvidence(x).failures.includes('timeline_visual_unaccounted:unlisted'));
});
test('blocks false capture date for claimed current event',()=>{
  const x=example();x.project.assets[0].evidenceState='observed';x.scenes[0].portrayal='actual_event';x.scenes[0].captureDate='2022-10-17';x.scenes[0].eventDate='2026-10-17';x.scenes[0].eventRef='event:2026';
  assert.ok(inspectDocumentaryEvidence(x).failures.some(y=>y.startsWith('event_capture_unverified')));
});
test('rejects nonexistent MP4',()=>{
  const r=inspectPortableMaster('/does/not/exist/film.mp4');assert.equal(r.status,'rejected');
});
test('valid faststart H264/AAC video decodes but makes no device-playback claim',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'film-phone-'));const mp4=path.join(dir,'test.mp4');
  try{
    const res=spawnSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=red:s=640x360:r=24:d=1.25','-f','lavfi','-i','sine=frequency=440:duration=1.25','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart','-shortest',mp4]);
    assert.equal(res.status,0,String(res.stderr));
    const r=inspectPortableMaster(mp4);
    assert.equal(r.status,'technically_accepted_device_playback_unverified',r.failures.join());
    assert.equal(r.boundaries.actualPhonePlaybackObserved,false);
    assert.equal(r.videoCodec,'h264');assert.equal(r.audioCodec,'aac');
    const altered=inspectPortableMaster(mp4,'0'.repeat(64));assert.ok(altered.failures.includes('master_sha_mismatch'));
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
