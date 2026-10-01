import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { makeTimelineProject } from './timeline.js';
import { renderTimelineExport } from './timeline-export.js';

function run(binary:string,args:string[]){
  const result=spawnSync(binary,args,{encoding:'utf8'});
  if(result.error) throw result.error;
  if(result.status!==0) throw new Error(result.stderr||binary+' failed');
  return result.stdout;
}

function sha(file:string){
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('renders a real role-aware mastered MP4 with dialogue and music',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-audio-master-'));
  const video=path.join(dir,'picture.mp4');
  const voice=path.join(dir,'voice.wav');
  const music=path.join(dir,'music.wav');
  const out=path.join(dir,'master.mp4');

  run('ffmpeg',[
    '-y','-v','error',
    '-f','lavfi','-i','testsrc2=size=640x360:rate=30',
    '-t','2',
    '-c:v','libx264','-pix_fmt','yuv420p',
    video,
  ]);
  run('ffmpeg',[
    '-y','-v','error',
    '-f','lavfi','-i','sine=frequency=440:sample_rate=48000',
    '-t','2',
    '-c:a','pcm_s16le',
    voice,
  ]);
  run('ffmpeg',[
    '-y','-v','error',
    '-f','lavfi','-i','sine=frequency=110:sample_rate=44100',
    '-t','2',
    '-c:a','pcm_s16le',
    music,
  ]);

  const project=makeTimelineProject({
    id:'audio-master-integration',
    title:'Audio master integration',
    aspectRatio:'16:9',
    fps:30,
    audioMaster:{targetLufs:-14,truePeakDb:-1,lra:11,dialogueDucking:true},
    assets:[
      {id:'picture',path:video,digest:sha(video),kind:'video',sourceRefs:['test:picture']},
      {id:'voice',path:voice,digest:sha(voice),kind:'audio',sourceRefs:['test:voice']},
      {id:'music',path:music,digest:sha(music),kind:'audio',sourceRefs:['test:music']},
    ],
    tracks:[
      {id:'picture',kind:'video',name:'Picture',clips:[
        {id:'picture-clip',trackId:'picture',assetId:'picture',startSec:0,durationSec:2},
      ]},
      {id:'voice',kind:'voice',name:'Voice',clips:[
        {id:'voice-clip',trackId:'voice',assetId:'voice',startSec:.25,durationSec:1.5,volume:.9},
      ]},
      {id:'music',kind:'music',name:'Music',clips:[
        {id:'music-clip',trackId:'music',assetId:'music',startSec:0,durationSec:2,volume:.4},
      ]},
    ],
  });

  const receipt=renderTimelineExport({project,outputPath:out});
  assert.equal(receipt.videoCodec,'h264');
  assert.equal(receipt.audioCodec,'aac');
  assert.equal(receipt.audioMaster.targetLufs,-14);
  assert.equal(receipt.audioMaster.truePeakDb,-1);
  assert.ok(fs.statSync(out).size>1000);

  const probe=JSON.parse(run('ffprobe',[
    '-v','error',
    '-show_entries','stream=codec_type,codec_name,sample_rate',
    '-of','json',
    out,
  ])) as {streams:Array<{codec_type:string;codec_name:string;sample_rate?:string}>};
  const audio=probe.streams.find(stream=>stream.codec_type==='audio');
  assert.equal(audio?.codec_name,'aac');
  assert.equal(audio?.sample_rate,'48000');
});
