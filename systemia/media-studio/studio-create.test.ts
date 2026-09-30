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
