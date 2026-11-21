import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { compileGovernedFallenHandoff, type GovernedFallenHandoff } from './fallen-studio-handoff.js';
import { buildTimelineExportPlan } from '../media-studio/timeline-export.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const source=JSON.parse(fs.readFileSync(path.join(here,'campaigns/systemia-university-owned-handoff.v1.json'),'utf8')) as GovernedFallenHandoff;
const clone=()=>JSON.parse(JSON.stringify(source)) as GovernedFallenHandoff;

test('Systemia University compiles to real editable Fallen picture, dialogue, music, effects and captions',()=>{
  const {bundle,receipt}=compileGovernedFallenHandoff(clone());
  assert.equal(receipt.durationSec,30);
  assert.equal(receipt.frameRate,30);
  assert.equal(receipt.aspectRatio,'16:9');
  assert.equal(bundle.project.schema,'evercraft.fallen.timeline.v1');
  assert.deepEqual(bundle.project.tracks.map(track=>track.kind),['video','voice','music','sfx']);
  assert.equal(bundle.project.tracks.find(track=>track.kind==='video')?.clips.length,7);
  assert.equal(bundle.project.tracks.find(track=>track.kind==='voice')?.clips.length,7);
  assert.equal(bundle.project.tracks.find(track=>track.kind==='music')?.clips.length,1);
  assert.equal(bundle.project.tracks.find(track=>track.kind==='sfx')?.clips.length,3);
  assert.equal(bundle.captions.length,7);
  assert.equal(receipt.productionNeedCount,18);
  assert.equal(receipt.pendingPictureCount,7);
  assert.equal(receipt.pendingVoiceCount,7);
  assert.equal(receipt.pendingMusicCount,1);
  assert.equal(receipt.pendingSfxCount,3);
});

test('production is explicitly blocked until real licensed assets and voice are admitted',()=>{
  const {bundle,receipt}=compileGovernedFallenHandoff(clone());
  assert.equal(receipt.exportAllowed,false);
  assert.equal(receipt.paidGenerationAuthority,false);
  assert.equal(receipt.publicationAuthority,false);
  assert.equal(receipt.verifiedLiveProductCapture,false);
  assert.equal(receipt.verifiedEnrollment,false);
  assert.equal(bundle.boundaries.publicationAuthorityGranted,false);
  assert.equal(bundle.boundaries.paidGenerationAuthorityGranted,false);
  assert.ok(bundle.project.assets.every(asset=>asset.path.startsWith('pending://production/')));
  assert.throws(()=>buildTimelineExportPlan({project:bundle.project,outputPath:'/tmp/university-unverified.mp4'}),/timeline_export_pending_asset/);
});

test('script preserves the important consent and accountability moments',()=>{
  const {bundle}=compileGovernedFallenHandoff(clone());
  assert.deepEqual(bundle.script.map(line=>line.speakerId),['ai-agent','human-owner','ai-agent','human-owner','ai-agent','human-owner','ai-agent']);
  assert.ok(bundle.script.some(line=>/I already sent it/.test(line.text)));
  assert.ok(bundle.script.some(line=>/I said draft/.test(line.text)));
  assert.ok(bundle.project.tracks.find(track=>track.kind==='video')!.clips.some(clip=>/NOT THE RESPONSIBILITY/.test(clip.label||'')));
});

test('fails closed when creative duration, subtitles or voices drift',()=>{
  const tooLong=clone();
  tooLong.studioPlan.scenes[0].durationSec=4;
  assert.throws(()=>compileGovernedFallenHandoff(tooLong),/handoff_duration_not_30/);
  const noCaptions=clone();
  noCaptions.studioPlan.captions={enabled:false};
  assert.throws(()=>compileGovernedFallenHandoff(noCaptions),/handoff_captions_required/);
  const noHuman=clone();
  for(const scene of noHuman.studioPlan.scenes) scene.narration!.speakerId='ai-agent';
  assert.throws(()=>compileGovernedFallenHandoff(noHuman),/handoff_two_actor_script_required/);
});

test('rejects unreviewed source assets and invented voice cast',()=>{
  const unverifiedAsset=clone();
  unverifiedAsset.studioPlan.sourceAssets.push({id:'fake',kind:'video',rights:'owned',path:'/tmp/fake.mp4',digest:'1'.repeat(64),sourceRefs:['invented']});
  assert.throws(()=>compileGovernedFallenHandoff(unverifiedAsset),/handoff_source_assets_need_independent_review/);
  const inventedVoice=clone();
  inventedVoice.studioPlan.scenes[0].narration!.voiceProfileId='unchecked-celebrity-voice';
  assert.throws(()=>compileGovernedFallenHandoff(inventedVoice),/handoff_uncast_voices_must_remain_pending/);
});

test('refuses a shortcut into public launch or false product truth',()=>{
  const unauthorized=clone();
  (unauthorized.truth as {publicationAuthority:boolean}).publicationAuthority=true;
  assert.throws(()=>compileGovernedFallenHandoff(unauthorized),/handoff_publish_authority_forbidden/);
  const fabricated=clone();
  (fabricated.truth as {realProductScreen:string}).realProductScreen='verified';
  assert.throws(()=>compileGovernedFallenHandoff(fabricated),/handoff_product_claim_not_cleared/);
});
