import assert from 'node:assert/strict';
import test from 'node:test';
import { compileStudioDraft, type StudioDraftPlan } from './studio-create.js';
import { buildTimelineExportPlan } from './timeline-export.js';

function plan():StudioDraftPlan{
  return {
    schema:'evercraft.fallen.studio-draft-plan.v1',
    id:'week-in-motion-draft',
    title:'Week in Motion',
    prompt:'Build a cinematic two-scene update with narration and proof-driven visuals.',
    aspectRatio:'16:9',
    fps:30,
    continuityDigest:'continuity-week-1',
    sourceAssets:[
      {
        id:'real-opening',
        path:'/tmp/real-opening.mp4',
        kind:'video',
        durationSec:4,
        rights:'owned',
        digest:'1'.repeat(64),
        sourceRefs:['test:real-opening'],
      },
    ],
    scenes:[
      {
        id:'opening',
        durationSec:4,
        visual:{assetId:'real-opening',sourceRefs:['source:real-opening']},
        narration:{
          text:'This week, the system moved from ideas into working infrastructure.',
          speakerId:'host',
          voiceProfileId:'host-voice-v1',
          language:'en',
        },
        sfx:[{id:'hit',prompt:'subtle cinematic impact',offsetSec:.2,durationSec:.8,volume:.5}],
      },
      {
        id:'proof',
        durationSec:5,
        visual:{
          prompt:'A cinematic proof-room shot showing verified receipts and live system output.',
          sourceRefs:['brief:week-in-motion'],
        },
        narration:{
          text:'The receipts matter because every claim has to survive the proof layer.',
          speakerId:'host',
          voiceProfileId:'host-voice-v1',
          language:'en',
        },
      },
    ],
    music:{prompt:'restrained cinematic technology score with no vocals',volume:.15},
    captions:{enabled:true,style:'documentary'},
  };
}

test('compiles one Studio plan into reusable tracks, script, captions and production needs',()=>{
  const bundle=compileStudioDraft(plan());
  assert.equal(bundle.schema,'evercraft.fallen.studio-draft-bundle.v1');
  assert.equal(bundle.project.tracks.find(track=>track.kind==='video')?.clips.length,2);
  assert.equal(bundle.project.tracks.find(track=>track.kind==='voice')?.clips.length,2);
  assert.equal(bundle.project.tracks.find(track=>track.kind==='music')?.clips.length,1);
  assert.equal(bundle.project.tracks.find(track=>track.kind==='sfx')?.clips.length,1);
  assert.equal(bundle.script.length,2);
  assert.equal(bundle.captions.length,2);

  const kinds=bundle.productionNeeds.map(need=>need.kind);
  assert.deepEqual(kinds,['speech','sfx','video','speech','music']);
  assert.equal(bundle.productionNeeds.filter(need=>need.kind==='video').length,1);
  assert.ok(bundle.productionNeeds.filter(need=>need.kind==='speech').every(need=>need.requires.includes('voice_profile')));
  assert.equal(bundle.boundaries.paidGenerationAuthorityGranted,false);
  assert.equal(bundle.boundaries.publicationAuthorityGranted,false);
});

test('source footage is reused instead of unnecessarily generating a replacement',()=>{
  const bundle=compileStudioDraft(plan());
  const opening=bundle.project.tracks.find(track=>track.kind==='video')!.clips[0];
  assert.equal(opening.assetId,'real-opening');
  assert.equal(bundle.project.assets.find(asset=>asset.id==='real-opening')?.path,'/tmp/real-opening.mp4');
});

test('unresolved generated assets keep export fail-closed',()=>{
  const bundle=compileStudioDraft(plan());
  assert.throws(
    ()=>buildTimelineExportPlan({project:bundle.project,outputPath:'/tmp/not-yet.mp4'}),
    /timeline_export_pending_asset/
  );
});

test('missing source asset references are rejected',()=>{
  const p=plan();
  p.scenes[0].visual.assetId='does-not-exist';
  assert.throws(()=>compileStudioDraft(p),/studio_draft_source_asset_missing:does-not-exist/);
});

test('speech without a locked voice remains routable without inventing a voice-profile requirement',()=>{
  const p=plan();
  delete p.scenes[0].narration!.voiceProfileId;
  const bundle=compileStudioDraft(p);
  const need=bundle.productionNeeds.find(item=>item.id.endsWith('opening-speech'))!;
  assert.equal(need.kind,'speech');
  assert.equal(need.requires.includes('voice_profile'),false);
});


test('source media must carry a real digest and lineage',()=>{
  const p=plan();
  p.sourceAssets[0].digest='not-a-digest';
  assert.throws(()=>compileStudioDraft(p),/studio_draft_source_digest_invalid:real-opening/);

  const q=plan();
  q.sourceAssets[0].sourceRefs=[];
  assert.throws(()=>compileStudioDraft(q),/studio_draft_source_refs_missing:real-opening/);
});

test('captured microphone is an explicitly admitted, digest-bound, frame-matched source',()=>{
 const p=plan();
 p.scenes[0].visual.capturedAudio={rightsRef:'reviewed-source-microphone:rights-receipt-42',volume:.85};
 p.scenes[0].visual.trimStartSec=0;
 const bundle=compileStudioDraft(p);
 const captured=bundle.project.tracks.find(track=>track.kind==='sfx')!.clips.find(clip=>clip.id==='opening-captured-audio');
 const picture=bundle.project.tracks.find(track=>track.kind==='video')!.clips[0];
 assert.ok(captured);
 assert.equal(captured.assetId,'real-opening');
 assert.equal(captured.startSec,picture.startSec);
 assert.equal(captured.durationSec,picture.durationSec);
 assert.equal(captured.trimStartSec,picture.trimStartSec);
 assert.equal(captured.volume,.85);
 assert.equal(bundle.productionNeeds.some(need=>need.id.includes('captured-audio')),false);
 assert.equal(bundle.boundaries.publicationAuthorityGranted,false);
});
test('capture audio fails closed for missing, synthetic or unlicensed picture',()=>{
 const p=plan();p.scenes[1].visual.capturedAudio={rightsRef:'clearance-id'};
 assert.throws(()=>compileStudioDraft(p),/studio_draft_captured_audio_requires_source:proof/);
 const q=plan();q.scenes[0].visual.capturedAudio={rightsRef:'clearance-id'};q.sourceAssets[0].rights='unknown';
 assert.throws(()=>compileStudioDraft(q),/studio_draft_captured_audio_rights_not_admitted:opening/);
 const z=plan();z.scenes[0].visual.capturedAudio={rightsRef:'clearance-id'};z.sourceAssets[0].evidenceState='synthetic_visualization';
 assert.throws(()=>compileStudioDraft(z),/studio_draft_captured_audio_not_observed:opening/);
});
test('source sound cannot be admitted without a rights receipt or from a still',()=>{
 const p=plan();p.scenes[0].visual.capturedAudio={rightsRef:' '};
 assert.throws(()=>compileStudioDraft(p),/studio_draft_captured_audio_rights_ref_missing:opening/);
 const q=plan();q.scenes[0].visual.capturedAudio={rightsRef:'receipt'};q.sourceAssets[0].kind='image';
 assert.throws(()=>compileStudioDraft(q),/studio_draft_captured_audio_requires_video:opening/);
});
test('picture and source sound trims must be bounded and may not diverge',()=>{
 const p=plan();p.scenes[0].visual.capturedAudio={rightsRef:'receipt'};
 p.scenes[0].durationSec=2.5;p.scenes[0].visual.trimStartSec=1;
 const bundle=compileStudioDraft(p);
 const picture=bundle.project.tracks.find(t=>t.kind==='video')!.clips[0];
 const microphone=bundle.project.tracks.find(t=>t.kind==='sfx')!.clips.find(t=>t.id==='opening-captured-audio')!;
 assert.equal(picture.trimStartSec,1);
 assert.equal(microphone.trimStartSec,1);
 const q=plan();q.scenes[0].visual.capturedAudio={rightsRef:'receipt'};q.scenes[0].visual.trimStartSec=2;
 assert.throws(()=>compileStudioDraft(q),/studio_draft_source_trim_exceeds_duration:opening/);
 const r=plan();r.scenes[0].visual.trimStartSec=-1;
 assert.throws(()=>compileStudioDraft(r),/studio_draft_source_trim_invalid:opening/);
});
