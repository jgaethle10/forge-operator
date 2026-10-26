import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {sampleEmptyGrayCanvasFraction} from './capture-studio-real-ui-footage.mjs';
function fixture(color){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-frame-qa-'));
 const file=path.join(dir,'frame.mp4');
 const cmd=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y',
 '-f','lavfi','-i',`color=c=${color}:s=1080x1920:d=3:r=2`,
 '-c:v','libx264','-preset','ultrafast','-crf','16',file],{encoding:'utf8'});
 if(cmd.status!==0)throw Error('ffmpeg_fixture_failed:'+cmd.stderr);
 return {dir,file};
}
test('neutral gray CSS/video canvas artifact must fail occupancy gate',()=>{
 const v=fixture('gray');
 try{assert.ok(sampleEmptyGrayCanvasFraction(v.file,2)>0.90);}
 finally{fs.rmSync(v.dir,{recursive:true,force:true});}
});
test('actual dark imagery is not incorrectly classified as chromium gray canvas',()=>{
 const v=fixture('black');
 try{assert.ok(sampleEmptyGrayCanvasFraction(v.file,2)<0.01);}
 finally{fs.rmSync(v.dir,{recursive:true,force:true});}
});
test('source recorder uses real CSS-sized browser capture and only then upscales',()=>{
 const src=fs.readFileSync(new URL('./capture-studio-real-ui-footage.mjs',import.meta.url),'utf8');
 assert.match(src,/recordVideo:\{dir:capture,size:\{width:360,height:640\}\}/);
 assert.match(src,/scale=1080:1920:flags=lanczos/);
 assert.match(src,/if\(emptyGrayCanvasFraction>0\.10\)/);
});
