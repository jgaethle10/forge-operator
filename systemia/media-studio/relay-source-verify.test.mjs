import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {verifyRelayFloorSource} from './relay-source-verify.mjs';
function make(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-floor-video-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const run=args=>{
    const r=spawnSync('ffmpeg',['-nostdin','-v','error',...args],{timeout:20000});
    assert.equal(r.status,0,String(r.stderr));
  };
  return {dir,run};
}
test('forged MP4 extension and fake bytes fail',t=>{
  const {dir}=make(t),p=path.join(dir,'fake.mp4');fs.writeFileSync(p,'test-content');
  assert.throws(()=>verifyRelayFloorSource({id:'fake',path:p},{requiredDurationSec:2}),/media_probe_failed/);
});
test('encoded unchanging still cannot pass as physical video',t=>{
  const {dir,run}=make(t),p=path.join(dir,'static.mp4');
  run(['-f','lavfi','-i','color=c=blue:s=640x360:r=24:d=2','-pix_fmt','yuv420p','-c:v','libx264',p]);
  assert.throws(()=>verifyRelayFloorSource({id:'still',path:p},{requiredDurationSec:1.5}),/nearly_static_video/);
});
test('changing decoded frames yield technical proof, not authenticity proof',t=>{
  const {dir,run}=make(t),p=path.join(dir,'motion.mp4');
  run(['-f','lavfi','-i','testsrc2=size=640x360:rate=24:duration=2','-pix_fmt','yuv420p','-c:v','libx264',p]);
  const q=verifyRelayFloorSource({id:'motion',path:p},{requiredDurationSec:1.5});
  assert.equal(q.actualVideo,true);assert.equal(q.authenticityNotEstablished,true);
  assert.ok(q.maxChangedPixelRatio>=.015);
});
test('a moving but muted video is not a filmed dialogue source',t=>{
  const {dir,run}=make(t),p=path.join(dir,'mute.mp4');
  run(['-f','lavfi','-i','testsrc2=size=640x360:rate=24:duration=2',
    '-pix_fmt','yuv420p','-c:v','libx264',p]);
  assert.throws(()=>verifyRelayFloorSource({id:'mute',path:p},{requiredDurationSec:1,requiresAudio:true}),/live_dialogue_audio_stream_missing/);
});
test('video with embedded sound clears only technical-stream verification',t=>{
  const {dir,run}=make(t),p=path.join(dir,'av.mp4');
  run(['-f','lavfi','-i','testsrc2=size=640x360:rate=24:duration=2',
    '-f','lavfi','-i','sine=frequency=400:sample_rate=48000:duration=2',
    '-shortest','-pix_fmt','yuv420p','-c:v','libx264','-c:a','aac',p]);
  const q=verifyRelayFloorSource({id:'av',path:p},{requiredDurationSec:1,requiresAudio:true});
  assert.equal(q.hasEmbeddedAudio,true);
  assert.equal(q.authenticityNotEstablished,true);
});
test('rejects footage shorter than planned shot duration',t=>{
  const {dir,run}=make(t),p=path.join(dir,'short.mp4');
  run(['-f','lavfi','-i','testsrc2=size=640x360:rate=24:duration=1','-pix_fmt','yuv420p','-c:v','libx264',p]);
  assert.throws(()=>verifyRelayFloorSource({id:'short',path:p},{requiredDurationSec:5}),/source_shorter_than_shot/);
});
