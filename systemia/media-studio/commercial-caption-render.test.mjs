// Real subtitle placement proof. Checks visible ink pixels of rendered black-background footage.
// The fixture proves FFmpeg geometry only, not artistic taste, legibility or platform UI coverage.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {makeTimelineProject} from './timeline.ts';
import {buildTimelineExportPlan} from './timeline-export.ts';

const dimensions={
  '9:16':{w:1080,h:1920,yMin:0.70,yMax:0.85},
  '1:1':{w:1080,h:1080,yMin:0.78,yMax:0.92},
  '16:9':{w:1920,h:1080,yMin:0.80,yMax:0.95}
};
function renderCaptionFrame(aspectRatio,srt){
  const {w,h}=dimensions[aspectRatio];
  const project=makeTimelineProject({
    id:'caption-frame-proof',title:'CI safe social subtitle image',
    aspectRatio,fps:30,assets:[{
      id:'captions',path:srt,digest:'0'.repeat(64),kind:'captions',sourceRefs:['synthetic-test']
    }],
    tracks:[{id:'captions',kind:'captions',name:'Captions',clips:[{
      id:'caption-clip',trackId:'captions',assetId:'captions',startSec:0,durationSec:1
    }]}]
  });
  project.captionStyle='commercial_safe';
  const plan=buildTimelineExportPlan({project,outputPath:path.join(path.dirname(srt),'fake.mp4')});
  const filter=plan.ffmpegArgs[plan.ffmpegArgs.indexOf('-filter_complex')+1];
  const match=filter.match(/subtitles=filename='[^']+':force_style='[^']+'/);
  assert.ok(match,'commercial subtitle filter must be present');
  const r=spawnSync('ffmpeg',['-nostdin','-hide_banner','-v','error',
    '-f','lavfi','-i','color=c=black:s='+w+'x'+h+':r=1:d=1',
    '-vf',match[0],'-frames:v','1','-pix_fmt','gray','-f','rawvideo','pipe:1'],
    {maxBuffer:w*h*2});
  if(r.error||r.status!==0)
    throw new Error('caption_frame_ffmpeg_failed:'+String(r.error?.message||r.stderr));
  assert.equal(r.stdout.length,w*h,'raw grayscale frame must be exact size');
  let minY=h,maxY=-1,minX=w,maxX=-1,count=0;
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      if(r.stdout[y*w+x]>70){
        minY=Math.min(minY,y);maxY=Math.max(maxY,y);
        minX=Math.min(minX,x);maxX=Math.max(maxX,x);count++;
      }
    }
  }
  return {w,h,minY,maxY,minX,maxX,count};
}
test('final drawn subtitle pixels stay in social-review bands in all three shapes',{timeout:30000},t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-social-caption-layout-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const srt=path.join(dir,'captions.srt');
  fs.writeFileSync(srt,'1\n00:00:00,000 --> 00:00:01,000\nHome should feel like home.\n');
  for(const ratio of ['9:16','1:1','16:9']){
    const {w,h,minY,maxY,minX,maxX,count}=renderCaptionFrame(ratio,srt);
    assert.ok(count>2000,ratio+' must actually render visible caption ink');
    assert.ok(minY/h>dimensions[ratio].yMin,ratio+' starts within safe review band');
    assert.ok(maxY/h<dimensions[ratio].yMax,ratio+' ends within safe review band');
    assert.ok(minX/w>.03&&maxX/w<.97,ratio+' must not touch screen edges');
  }
});
