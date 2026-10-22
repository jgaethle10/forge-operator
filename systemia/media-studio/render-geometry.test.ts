import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { filterFor } from './render.js';
import type { ScenePlan } from './types.js';

const pushIn:ScenePlan={
  id:'photo-push',beat:'hook',assetId:'square-photo',
  sourcePath:'./square.png',mediaKind:'image',
  durationSec:.5,motion:'push_in',transition:'cut',
  intent:'cinematic push-in on a character portrait',
};

function ffmpeg(args:string[]){
  const result=spawnSync('ffmpeg',args,{encoding:'utf8'});
  if(result.error) throw result.error;
  if(result.status!==0) throw new Error(result.stderr||'ffmpeg failed');
}

test('still push-ins normalize aspect before zoompan in every delivery shape',()=>{
  for(const [width,height] of [[180,320],[320,180],[240,240]]){
    const filter=filterFor(pushIn,width,height);
    assert.ok(
      filter.indexOf('force_original_aspect_ratio=increase')<filter.indexOf('zoompan='),
      'aspect-preserving scale must happen before zoompan'
    );
    assert.match(filter,new RegExp('crop='+width*2+':'+height*2));
    assert.match(filter,/setsar=1,zoompan=/);
    assert.ok(filter.includes('s='+width+'x'+height));
  }
});

test('a square source renders to portrait with exact pixels and FPS',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-push-in-shape-'));
  try{
    const image=path.join(dir,'square.png');
    const output=path.join(dir,'portrait.mp4');
    ffmpeg([
      '-y','-v','error','-f','lavfi',
      '-i','testsrc2=size=640x640:rate=1',
      '-frames:v','1',image,
    ]);
    ffmpeg([
      '-y','-v','error','-loop','1','-i',image,
      '-vf',filterFor(pushIn,180,320),
      '-frames:v','15','-c:v','libx264','-pix_fmt','yuv420p',
      output,
    ]);
    const probe=spawnSync('ffprobe',[
      '-v','error','-select_streams','v:0',
      '-show_entries','stream=width,height,avg_frame_rate',
      '-of','json',output,
    ],{encoding:'utf8'});
    assert.equal(probe.status,0,probe.stderr);
    const video=JSON.parse(probe.stdout).streams[0];
    assert.equal(video.width,180);
    assert.equal(video.height,320);
    assert.equal(video.avg_frame_rate,'30/1');
  }finally{
    fs.rmSync(dir,{recursive:true,force:true});
  }
});


test('push-in preserves square subject proportions within a portrait canvas',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-push-in-subject-'));
  try{
    const source=path.join(dir,'subject.png');
    const output=path.join(dir,'render.mp4');
    ffmpeg([
      '-y','-v','error','-f','lavfi',
      '-i','color=c=black:s=640x640:r=1,drawbox=x=270:y=270:w=100:h=100:color=white:t=fill',
      '-frames:v','1',source,
    ]);
    ffmpeg([
      '-y','-v','error','-loop','1','-i',source,
      '-vf',filterFor(pushIn,180,320),
      '-frames:v','15','-c:v','libx264','-pix_fmt','yuv420p',
      output,
    ]);
    const pixels=spawnSync('ffmpeg',[
      '-v','error','-i',output,'-frames:v','1','-f','rawvideo',
      '-pix_fmt','gray','-',
    ],{encoding:'buffer',maxBuffer:1024*1024});
    assert.equal(pixels.status,0,String(pixels.stderr||'ffmpeg_extract_failed'));
    const buf=pixels.stdout as Buffer;
    assert.equal(buf.length,180*320);
    let minX=180,maxX=-1,minY=320,maxY=-1;
    for(let y=0;y<320;y+=1){
      for(let x=0;x<180;x+=1){
        if(buf[y*180+x]<=200) continue;
        minX=Math.min(minX,x);maxX=Math.max(maxX,x);
        minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      }
    }
    assert.ok(maxX>minX && maxY>minY,'the subject should remain visible');
    const subjectAspect=(maxX-minX+1)/(maxY-minY+1);
    assert.ok(Math.abs(subjectAspect-1)<.08,
      'a square subject cannot become an ellipse; got ratio '+subjectAspect);
  }finally{
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
