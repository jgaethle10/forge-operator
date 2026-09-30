import assert from 'node:assert/strict';
import test from 'node:test';
import { makeTimelineProject } from './timeline.js';
import { buildTimelineExportPlan } from './timeline-export.js';

function readyProject(){
  return makeTimelineProject({
    id:'studio-export-test',
    title:'Studio export test',
    aspectRatio:'16:9',
    fps:30,
    assets:[
      {id:'video-a',path:'/tmp/video-a.mp4',digest:'a'.repeat(64),kind:'video',sourceRefs:['test:video']},
      {id:'logo',path:'/tmp/logo.png',digest:'b'.repeat(64),kind:'image',sourceRefs:['test:logo']},
      {id:'voice',path:'/tmp/voice.wav',digest:'c'.repeat(64),kind:'audio',sourceRefs:['test:voice']},
      {id:'music',path:'/tmp/music.wav',digest:'d'.repeat(64),kind:'audio',sourceRefs:['test:music']},
      {id:'captions',path:'/tmp/captions.srt',digest:'e'.repeat(64),kind:'captions',sourceRefs:['test:captions']},
    ],
    tracks:[
      {id:'picture',kind:'video',name:'Picture',clips:[
        {id:'shot-a',trackId:'picture',assetId:'video-a',startSec:0,durationSec:5},
      ]},
      {id:'graphics',kind:'overlay',name:'Graphics',clips:[
        {id:'logo-clip',trackId:'graphics',assetId:'logo',startSec:1,durationSec:3,x:24,y:24,scale:.5,opacity:.9},
      ]},
      {id:'voice',kind:'voice',name:'Voice',clips:[
        {id:'voice-clip',trackId:'voice',assetId:'voice',startSec:.5,durationSec:4,volume:1},
      ]},
      {id:'music',kind:'music',name:'Music',clips:[
        {id:'music-clip',trackId:'music',assetId:'music',startSec:0,durationSec:5,volume:.25},
      ]},
      {id:'captions',kind:'captions',name:'Captions',clips:[
        {id:'caption-clip',trackId:'captions',assetId:'captions',startSec:0,durationSec:5},
      ]},
    ],
  });
}

test('builds one deterministic mp4 export from video, overlay, audio and captions',()=>{
  const plan=buildTimelineExportPlan({project:readyProject(),outputPath:'/tmp/final.mp4'});
  assert.equal(plan.schema,'evercraft.fallen.timeline-export-plan.v1');
  assert.equal(plan.width,1920);
  assert.equal(plan.height,1080);
  assert.equal(plan.durationSec,5);
  assert.deepEqual(plan.visualClipIds,['shot-a','logo-clip']);
  assert.deepEqual(plan.audioClipIds,['voice-clip','music-clip']);
  assert.deepEqual(plan.captionClipIds,['caption-clip']);
  assert.equal(plan.boundaries.publicationAuthorityGranted,false);
  assert.equal(plan.boundaries.roleAwareAudioBuses,true);
  assert.equal(plan.boundaries.dialogueAwareMusicDucking,true);
  assert.equal(plan.audioMaster.targetLufs,-14);
  assert.equal(plan.audioMaster.truePeakDb,-1);

  const filterIndex=plan.ffmpegArgs.indexOf('-filter_complex');
  assert.ok(filterIndex>=0);
  const filter=plan.ffmpegArgs[filterIndex+1];
  assert.match(filter,/overlay=/);
  assert.match(filter,/amix=inputs=2/);
  assert.match(filter,/sidechaincompress=threshold=0\.05:ratio=8:attack=20:release=350/);
  assert.match(filter,/loudnorm=I=-14:TP=-1:LRA=11:linear=true/);
  assert.match(filter,/alimiter=limit=0\.891251/);
  assert.match(filter,/subtitles=filename=/);
  assert.ok(plan.ffmpegArgs.includes('+faststart'));
  assert.ok(plan.ffmpegArgs.includes('libx264'));
  assert.ok(plan.ffmpegArgs.includes('aac'));
});

test('rejects unresolved generation placeholders instead of exporting fake readiness',()=>{
  const project=readyProject();
  project.assets.push({
    id:'pending-shot',
    path:'pending://generation/shot-2',
    digest:'f'.repeat(64),
    kind:'video',
    sourceRefs:['need:shot-2'],
  });
  project.tracks[0].clips.push({
    id:'pending-clip',
    trackId:'picture',
    assetId:'pending-shot',
    startSec:5,
    durationSec:3,
  });
  assert.throws(
    ()=>buildTimelineExportPlan({project,outputPath:'/tmp/nope.mp4'}),
    /timeline_export_pending_asset:pending-shot/
  );
});

test('caption files describe full-timeline timing and therefore start at zero',()=>{
  const project=readyProject();
  project.tracks.find(track=>track.kind==='captions')!.clips[0].startSec=2;
  assert.throws(
    ()=>buildTimelineExportPlan({project,outputPath:'/tmp/nope.mp4'}),
    /timeline_export_caption_must_start_zero:caption-clip/
  );
});

test('visual-only projects export without inventing an audio stream',()=>{
  const project=readyProject();
  project.tracks=project.tracks.filter(track=>track.kind==='video'||track.kind==='overlay');
  const plan=buildTimelineExportPlan({project,outputPath:'/tmp/silent.mp4'});
  assert.ok(plan.ffmpegArgs.includes('-an'));
  assert.equal(plan.audioClipIds.length,0);
});


test('respects a bounded custom audio master policy',()=>{
  const project=readyProject();
  project.audioMaster={
    targetLufs:-16,
    truePeakDb:-1.5,
    lra:9,
    dialogueDucking:true,
    duckThreshold:.08,
    duckRatio:6,
    attackMs:30,
    releaseMs:420,
    sampleRate:44100,
  };
  const plan=buildTimelineExportPlan({project,outputPath:'/tmp/custom-master.mp4'});
  const filter=plan.ffmpegArgs[plan.ffmpegArgs.indexOf('-filter_complex')+1];
  assert.equal(plan.audioMaster.targetLufs,-16);
  assert.equal(plan.audioMaster.truePeakDb,-1.5);
  assert.equal(plan.audioMaster.sampleRate,44100);
  assert.match(filter,/aresample=44100/);
  assert.match(filter,/sidechaincompress=threshold=0\.08:ratio=6:attack=30:release=420/);
  assert.match(filter,/loudnorm=I=-16:TP=-1\.5:LRA=9:linear=true/);
});
