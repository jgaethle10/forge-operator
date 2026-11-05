import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeDive} from '../public/subsea-watch/core.mjs';

const html=fs.readFileSync('public/subsea-watch/immersive/index.html','utf8');
const js=fs.readFileSync('public/subsea-watch/immersive/scene.mjs','utf8');
const sample=normalizeDive(JSON.parse(fs.readFileSync('public/subsea-watch/sample.json','utf8')));

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
 assert.match(js,/dive\.positionSource!=='SIMULATED'/);
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
 assert.match(js,/if\(!dive\.demo\|\|!dive\.xyAvailable/);
 assert.doesNotMatch(js,/XMLHttpRequest|sendBeacon|localStorage|sessionStorage|https?:\/\//);
 assert.match(html,/href="\.\.\/"/);
 assert.match(html,/src="\.\/scene\.mjs"/);
});
