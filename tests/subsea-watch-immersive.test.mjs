import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeDive,parseInput,atTime} from '../public/subsea-watch/core.mjs';

const html=fs.readFileSync('public/subsea-watch/immersive/index.html','utf8');
const js=fs.readFileSync('public/subsea-watch/immersive/scene.mjs','utf8');
const sample=normalizeDive(JSON.parse(fs.readFileSync('public/subsea-watch/sample.json','utf8')));
const publicProbe=fs.readFileSync('scripts/probe-subsea-watch-public.mjs','utf8');

test('immersive v2 remains a real 3D WebGL renderer with owned geometry',()=>{
 assert.match(js,/getContext\('webgl'/);
 assert.match(js,/gl\.VERTEX_SHADER/);
 assert.match(js,/gl\.FRAGMENT_SHADER/);
 assert.match(js,/gl\.DEPTH_TEST/);
 assert.match(js,/gl\.TRIANGLES/);
 for(const word of ['seabed','terrain','pipe','diver','sphere','tube','perspective','lookAt'])assert.ok(js.includes(word),'missing '+word);
 assert.match(js,/draw\(meshes\.diver,move\(pos,angle\)\)/);
 assert.doesNotMatch(html,/three\.js|babylon\.js|unpkg|cdn\.jsdelivr/);
});
test('scene cannot accidentally present itself as verified or dive clearance',()=>{
 assert.match(html,/Synthetic demonstration/);
 assert.match(html,/NOT DIVE CLEARANCE/);
 assert.match(html,/No real location, diver, flow, terrain survey or facility/);
 assert.match(html,/Operating pressure and pipe isolation are unknown/);
 assert.match(html,/noindex,nofollow/);
 assert.match(js,/THIS ENTIRE ENVIRONMENT IS SYNTHETIC/);
 assert.match(js,/sample\.positionSource!=='SIMULATED'/);
 assert.equal(sample.demo,true);
 assert.equal(sample.positionSource,'SIMULATED');
 assert.equal(sample.xyAvailable,true);
});
test('replay implements tracking, scrub, mobile pinch and orbit, not a static image',()=>{
 assert.match(js,/atTime\(dive,current\)/);
 assert.match(js,/requestAnimationFrame\(frame\)/);
 assert.match(js,/Math\.atan2\(b\.y-a\.y,b\.x-a\.x\)/);
 assert.match(js,/pointerdown/);
 assert.match(js,/pinchLength/);
 assert.match(js,/pointercancel/);
 assert.match(js,/distance=clamp\(distance\*pinchDistance\/next,5,65\)/);
 for(const id of ['view','play','timeline','follow','evidence','close-details','depth','time'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/touch-action:none/);
});
test('scene only fetches a checked synthetic first-party sample and offers prior evidence lab',()=>{
 assert.match(js,/fetch\('\.\.\/sample\.json'/);
 assert.match(js,/normalizeDive\(await r\.json\(\)\)/);
 assert.match(js,/if\(!sample\.demo\|\|!sample\.xyAvailable/);
 assert.doesNotMatch(js,/XMLHttpRequest|sendBeacon|localStorage|sessionStorage|https?:\/\//);
 assert.match(html,/href="\.\.\/"/);
 assert.match(html,/src="\.\/scene\.mjs"/);
});

test('immersive import adds browser-local JSON/CSV with no invented site reconstruction',()=>{
 for(const id of ['import-file','load-file','reset-sample','file-status','mode-pill','no-position','import-notes','synthetic-notes','import-summary'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(js,/parseInput\(await file\.text\(\),file\.name\)/);
 assert.match(js,/if\(file\.size>2e6\)/);
 assert.match(js,/next\.demo\|\|next\.positionSource==='SIMULATED'/);
 assert.match(js,/if\(mode==='synthetic'\)/);
 assert.match(js,/route\(dive\.xyAvailable\?dive\.points:\[\]\)/);
 assert.match(js,/gl\.deleteBuffer\(track\.buffer\)/);
 assert.match(js,/dataset\.subseaMode=mode/);
 assert.match(html,/Local files never leave this browser/);
 assert.match(html,/No real seabed, site structures, pipes, obstacles or survey models are reconstructed/);
});
test('local imports preserve source claims and reject unsourced or synthetic routes',()=>{
 const json=JSON.stringify({title:'Operator example',position_source:'USBL',points:[
  {t_s:0,depth_m:5,x_m:1000,y_m:2000},
  {t_s:10,depth_m:7,x_m:1001,y_m:2002},
  {t_s:40,depth_m:8,x_m:1003,y_m:2004}
 ]});
 const dive=parseInput(json,'mission.json');
 assert.equal(dive.xyAvailable,true);
 assert.equal(dive.demo,false);
 assert.equal(dive.positionSource,'USBL');
 assert.equal(atTime(dive,25).x,null,'a long gap must not be interpolated');
 const depthOnly=parseInput('t_s,depth_m\n0,2\n10,7\n20,5','depth.csv');
 assert.equal(depthOnly.xyAvailable,false);
 assert.equal(atTime(depthOnly,10).x,null);
 const unsourced=JSON.stringify({points:[{t_s:0,depth_m:2,x_m:1,y_m:2},{t_s:10,depth_m:3,x_m:2,y_m:3}]});
 assert.throws(()=>parseInput(unsourced,'bad.json'),/declared positioning method/);
});


test('local footage is paired only with user-imported mission data and explicit timing',()=>{
 for(const id of ['footage-panel','dive-video','video-clock','video-status','video-offset','pick-video','footage-toggle','load-video','sound-toggle','close-footage'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/<video id="dive-video" playsinline preload="metadata" muted/);
 assert.match(html,/Alignment is manually entered and unverified/);
 assert.match(js,/parseVideoStart\(e\.target\.value\)/);
 assert.match(js,/videoAtMissionTime\(current,videoStart,videoReady\?video\.duration:NaN\)/);
 assert.match(js,/if\(mode!=='imported'\)/);
 assert.match(js,/URL\.createObjectURL\(file\)/);
 assert.match(js,/URL\.revokeObjectURL\(videoUrl\)/);
 assert.match(js,/video\.pause\(\)/);
 assert.match(js,/video\.currentTime=/);
 assert.match(js,/videoPlayBlocked=true/);
 assert.match(js,/clearFootage\(\);activate\(next,false\)/);
 assert.match(js,/clearFootage\(\);load\(\)/);
 assert.doesNotMatch(js,/fetch\(video|sendBeacon|XMLHttpRequest|WebSocket|MediaRecorder/);
 assert.doesNotMatch(html,/<video[^>]*controls\b/);
});

test('public HTTPS canary checks the deployed footage controls and clock module',()=>{
 assert.match(publicProbe,/immersive\/video-sync\.mjs/);
 assert.match(publicProbe,/id="dive-video"/);
 assert.match(publicProbe,/id="video-offset"/);
 assert.match(publicProbe,/SUBSEA_PUBLIC_HTTPS_WEBGL_LOCAL_FOOTAGE_AND_NOAA_ARCHIVE_VERIFIED/);
 assert.match(publicProbe,/sample/);
 assert.doesNotMatch(publicProbe,/if\(!dive\.demo/);
});
