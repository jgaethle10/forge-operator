import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TITAN_SCENE,TITAN_GALLERY_SCHEMA,validateTitanScene,buildTitanDrawList,closestGalleryMarker,safeGalleryPosition} from '../public/worlds/hidden-world/titan-walk/scene.mjs';
import {TITAN_TOUR_SECONDS,titanGalleryTourFrame} from '../public/worlds/hidden-world/titan-walk/tour.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Titan 3D gallery has sourced thematic markers but no real facility coordinates',()=>{
 assert.equal(validateTitanScene(TITAN_SCENE),TITAN_SCENE);
 assert.equal(TITAN_SCENE.schema,TITAN_GALLERY_SCHEMA);
 assert.equal(TITAN_SCENE.markers.length,5);
 assert.match(TITAN_SCENE.geometryStatus,/invented_museum_geometry/);
 assert.ok(TITAN_SCENE.sources.every(s=>s.startsWith('https://')));
 assert.ok(TITAN_SCENE.markers.every(m=>TITAN_SCENE.sources[m.source]));
 assert.ok(!JSON.stringify(TITAN_SCENE).includes('actual_complex_coordinates'));
 const items=buildTitanDrawList(TITAN_SCENE);
 assert.ok(items.length>110,'3D museum needs substantive geometry');
 assert.ok(items.some(i=>i.tier==='interpretive'),'optional fictional silhouettes missing');
 assert.ok(items.some(i=>i.tier==='environment'),'static environment missing');
 assert.ok(items.every(i=>[i.x,i.y,i.z,i.sx,i.sy,i.sz].every(Number.isFinite)));
 assert.ok(items.every(i=>/^#[0-9a-f]{6}$/i.test(i.color)));
 // The invented museum's central walking aisle must not be blocked by a giant silo sculpture.
 const blocking=items.filter(i=>i.tier!=='interpretive'&&i.sy>1.4&&i.y-i.sy/2<1.65&&
   Math.abs(i.x)-i.sx/2<2.5&&Math.abs(i.x)+i.sx/2>0&&i.z>-42&&i.z<18);
 assert.equal(blocking.length,0,'gallery walking spine obstructed by large exhibit solids');

 assert.throws(()=>validateTitanScene({...TITAN_SCENE,geometryStatus:'surveyed_real_facility'}),/unverified_geometry_disclosure_missing/);
});

test('3D museum walk and tour are bounded to imaginary gallery units',()=>{
 assert.deepEqual(safeGalleryPosition(-100,100),{x:-29,z:19});
 assert.deepEqual(safeGalleryPosition(100,-100),{x:29,z:-43});
 assert.equal(closestGalleryMarker(0,13,TITAN_SCENE).marker.id,'orientation');
 assert.equal(TITAN_TOUR_SECONDS,60);
 const a=titanGalleryTourFrame(0),b=titanGalleryTourFrame(30),c=titanGalleryTourFrame(60);
 assert.equal(a.markerId,'orientation');
 assert.ok(b.progress>a.progress&&b.progress<c.progress);
 assert.equal(c.finished,true);
 assert.equal(c.progress,1);
 assert.match(c.evidenceBoundary,/not a Titan installation plan/);
 assert.throws(()=>titanGalleryTourFrame(Infinity),/Invalid tour time/);
});

test('Titan gallery works in owned Worlds with a no-script historical fallback',()=>{
 const index=read('public/worlds/hidden-world/titan-walk/index.html');
 const app=read('public/worlds/hidden-world/titan-walk/app.mjs');
 const atlas=read('public/worlds/hidden-world/index.html');
 const historic=read('public/worlds/hidden-world/titan-i-1962.html');
 assert.match(index,/WebGL2/);
 assert.match(index,/<body class="no-js">/);
 assert.match(index,/id="static-fallback"/);
 assert.match(index,/Open historical exhibit/);
 assert.match(app,/classList\.replace\('no-js','js'\)/);
 assert.match(index,/\.\.\/titan-i-1962\.html/);
 assert.match(index,/id="joystick"/);
 assert.match(index,/id="tour"/);
 assert.match(index,/id="inspect"/);
 assert.match(index,/href="\.\.\/titan-i-1962\.html"/);
 assert.match(index,/ORIGINAL ART · NOT A SITE PLAN/);
 assert.match(app,/buildTitanDrawList/);
 assert.match(app,/__evercraftTitanQA/);
 assert.doesNotMatch(app,/Pavlopetri|georeferenced survey mesh|dive|missile operating/i);
 assert.doesNotMatch(index,/<script[^>]+src="https?:\/\//);
 assert.match(atlas,/href="titan-walk\/"/);
 assert.match(historic,/href="\.\/titan-walk\/"/);
});
