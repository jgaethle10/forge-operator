import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PAVLOPETRI_SCENE as scene} from '../public/worlds/heritage/scene.mjs';
import {HERITAGE_TOUR_SECONDS,heritageTourFrame} from '../public/worlds/heritage/tour.mjs';

test('60-second tour visits only documented-category markers and source URLs',()=>{
 assert.equal(HERITAGE_TOUR_SECONDS,60);
 const observed=new Set();
 for(let second=0;second<=60;second+=.25){
  const f=heritageTourFrame(second);
  const marker=scene.markers.find(m=>m.id===f.markerId);
  assert.ok(marker);
  assert.equal(marker.kind,'documented_category');
  assert.equal(f.source,scene.sources[marker.source]);
  assert.ok(f.source.startsWith('https://'));
  assert.ok(f.x>=-29&&f.x<=29&&f.z>=-43&&f.z<=19);
  assert.ok(Number.isFinite(f.yaw)&&Number.isFinite(f.pitch));
  assert.match(f.evidenceBoundary,/not surveyed/);
  observed.add(f.markerId);
 }
 assert.deepEqual([...observed].sort(),scene.markers.map(m=>m.id).sort());
});
test('tour interpolation is deterministic, finite, clamped and ordered',()=>{
 assert.deepEqual(heritageTourFrame(0),heritageTourFrame(-100));
 assert.deepEqual(heritageTourFrame(60),heritageTourFrame(999));
 assert.deepEqual(heritageTourFrame(22.25),heritageTourFrame(22.25));
 assert.equal(heritageTourFrame(0).finished,false);
 assert.equal(heritageTourFrame(60).finished,true);
 assert.equal(heritageTourFrame(30).progress,.5);
 assert.throws(()=>heritageTourFrame(NaN),/Invalid tour time/);
 assert.throws(()=>heritageTourFrame(Infinity),/Invalid tour time/);
 assert.throws(()=>heritageTourFrame(1,{...scene,markers:scene.markers.slice(1)}),/Missing guided evidence marker/);
});
test('guided tour UI keeps visible schematic disclosure and can stop for free exploration',()=>{
 const html=readFileSync(new URL('../public/worlds/heritage/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/worlds/heritage/app.mjs',import.meta.url),'utf8');
 assert.match(html,/id="start-tour"/);
 assert.match(html,/id="tour"/);
 assert.match(html,/id="tourprogress"/);
 assert.match(html,/NOT AN EXACT RECONSTRUCTION/);
 assert.match(app,/heritageTourFrame/);
 assert.match(app,/stopTour/);
 assert.match(app,/pointerdown/);
 assert.doesNotMatch(html+app,/base44\.app|tinyfish/i);
});
