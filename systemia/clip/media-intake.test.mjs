import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  inspectClipMediaPackage,
  stageClipMediaIntake,
  verifyClipMediaManifest,
} from './media-intake.mjs';

const digest=(file)=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'clip-native-intake-'));
  const media=path.join(root,'master.mp4');
  const captions=path.join(root,'captions.srt');
  fs.writeFileSync(media,Buffer.from('verified-video-bytes'));
  fs.writeFileSync(captions,'1\n00:00:00,000 --> 00:00:01,000\nHELLO\n');
  const mediaSha=digest(media);
  const captionSha=digest(captions);
  const render=path.join(root,'render.json');
  const qc=path.join(root,'qc.json');
  fs.writeFileSync(render,JSON.stringify({
    schema:'evercraft.fallen.timeline-export-receipt.v1',
    projectId:'project-1',
    projectVersion:3,
    sha256:mediaSha,
    publicationAuthorityGranted:false,
  }));
  fs.writeFileSync(qc,JSON.stringify({
    schema:'evercraft.fallen.master-qc-receipt.v1',
    status:'accepted',
    sha256:mediaSha,
    boundaries:{publicationAuthorityGranted:false},
  }));
  const manifest={
    schema:'evercraft.clip.media-intake.v1',
    deliveryId:'delivery-1',
    sourceApp:'fallen',
    sourceProjectId:'project-1',
    sourceProjectVersion:3,
    state:'ready_for_clip_intake',
    media:{
      path:media,
      sha256:mediaSha,
      sizeBytes:fs.statSync(media).size,
      width:1920,
      height:1080,
      fps:30,
      durationSec:1,
      videoCodec:'h264',
      audioCodec:'aac',
    },
    captions:[{
      assetId:'caption-a',
      path:captions,
      sha256:captionSha,
      sourceRefs:['script:1'],
    }],
    metadata:{title:'Proof',tags:['clip']},
    destinations:['youtube','linkedin'],
    provenance:{
      inputAssetIds:['video','audio','caption-a'],
      sourceRefs:['source:proof'],
      continuityDigests:['continuity'],
      renderReceiptPath:render,
      masterQcReceiptPath:qc,
    },
    boundaries:{
      publicationAuthorityGranted:false,
      platformCredentialsConsumed:false,
      platformPublishStateAsserted:false,
      downstreamClipGateRequired:true,
    },
    createdAt:'2026-09-30T00:00:00Z',
  };
  return {root,manifest,media,captions,qc,render};
}

test('valid Fallen delivery package stages into the first-party Clip queue',()=>{
  const {root,manifest}=fixture();
  assert.equal(verifyClipMediaManifest(manifest).status,'accepted');
  assert.equal(inspectClipMediaPackage(manifest).status,'accepted');
  const queue=path.join(root,'queue');
  const receipt=stageClipMediaIntake({manifest,queueDir:queue});
  assert.equal(receipt.schema,'evercraft.clip.intake-receipt.v1');
  assert.equal(receipt.status,'staged');
  assert.equal(receipt.boundaries.firstPartyQueue,true);
  assert.equal(receipt.boundaries.inputBytesReverified,true);
  assert.equal(receipt.boundaries.masterQcRequired,true);
  assert.equal(receipt.boundaries.publicationAuthorityGranted,false);
  assert.equal(fs.existsSync(receipt.stagedMediaPath),true);
  assert.equal(digest(receipt.stagedMediaPath),manifest.media.sha256);
  assert.equal(receipt.stagedCaptionPaths.length,1);
});

test('same delivery is idempotent and does not duplicate staged media',()=>{
  const {root,manifest}=fixture();
  const queue=path.join(root,'queue');
  const first=stageClipMediaIntake({manifest,queueDir:queue});
  const second=stageClipMediaIntake({manifest,queueDir:queue});
  assert.equal(second.manifestDigest,first.manifestDigest);
  assert.equal(second.stagedMediaPath,first.stagedMediaPath);
  assert.equal(second.stagedAt,first.stagedAt);
});

test('tampered media bytes are rejected before entering the queue',()=>{
  const {root,manifest,media}=fixture();
  fs.appendFileSync(media,'tamper');
  assert.throws(
    ()=>stageClipMediaIntake({manifest,queueDir:path.join(root,'queue')}),
    /clip_media_digest_mismatch/
  );
});

test('master QC rejection blocks intake even when the video digest matches',()=>{
  const {root,manifest,qc}=fixture();
  const row=JSON.parse(fs.readFileSync(qc,'utf8'));
  row.status='rejected';
  fs.writeFileSync(qc,JSON.stringify(row));
  const inspection=inspectClipMediaPackage(manifest);
  assert.equal(inspection.status,'rejected');
  assert.ok(inspection.reasons.includes('master_qc_not_accepted'));
});

test('staging the same delivery id with a different manifest fails closed',()=>{
  const {root,manifest}=fixture();
  const queue=path.join(root,'queue');
  stageClipMediaIntake({manifest,queueDir:queue});
  const changed=JSON.parse(JSON.stringify(manifest));
  changed.destinations=['youtube'];
  assert.throws(
    ()=>stageClipMediaIntake({manifest:changed,queueDir:queue}),
    /clip_intake_idempotency_conflict/
  );
});


test('distributed phenomenon master stages after frame-verified render and master QC',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'clip-distributed-intake-'));
  const media=path.join(root,'phenomenon.mp4');
  fs.writeFileSync(media,Buffer.from('distributed-phenomenon-video'));
  const mediaSha=digest(media);
  const render=path.join(root,'render.json');
  const qc=path.join(root,'qc.json');
  fs.writeFileSync(render,JSON.stringify({
    schema:'evercraft.fallen.distributed-render-receipt.v1',
    plan_id:'spectacle-plan-1',
    stage_id:'spectacle-stage-1',
    stage_digest:'a'.repeat(64),
    total_frames:48,
    fps:12,
    shard_count:4,
    workers:['worker-a','worker-b'],
    frame_set_sha256:'b'.repeat(64),
    output_path:media,
    output_bytes:fs.statSync(media).size,
    output_sha256:mediaSha,
    boundaries:{
      every_frame_materialized:true,
      every_frame_sha256_verified:true,
      no_gap_no_duplicate_gate:true,
      worker_artifact_paths_not_trusted:true,
      publication_authority:false,
    }
  }));
  fs.writeFileSync(qc,JSON.stringify({
    schema:'evercraft.fallen.master-qc-receipt.v1',
    status:'accepted',
    sha256:mediaSha,
    boundaries:{publicationAuthorityGranted:false},
  }));
  const manifest={
    schema:'evercraft.clip.media-intake.v1',
    deliveryId:'spectacle-delivery-1',
    sourceApp:'fallen',
    sourceProjectId:'spectacle-stage-1',
    sourceProjectVersion:1,
    state:'ready_for_clip_intake',
    media:{
      path:media,
      sha256:mediaSha,
      sizeBytes:fs.statSync(media).size,
      width:1080,
      height:1920,
      fps:12,
      durationSec:4,
      videoCodec:'h264',
    },
    captions:[],
    metadata:{title:'Phenomenon proof',tags:['evercraft','worldstate']},
    destinations:['youtube','instagram','facebook','tiktok'],
    provenance:{
      inputAssetIds:[],
      sourceRefs:['source:physical-world-proof'],
      continuityDigests:['spectacle:proof'],
      renderReceiptPath:render,
      masterQcReceiptPath:qc,
    },
    boundaries:{
      publicationAuthorityGranted:false,
      platformCredentialsConsumed:false,
      platformPublishStateAsserted:false,
      downstreamClipGateRequired:true,
    },
    createdAt:'2026-10-01T00:00:00Z',
  };
  const inspection=inspectClipMediaPackage(manifest);
  assert.equal(inspection.status,'accepted');
  const receipt=stageClipMediaIntake({manifest,queueDir:path.join(root,'queue')});
  assert.equal(receipt.status,'staged');
  assert.equal(receipt.boundaries.publicationAuthorityGranted,false);
});
