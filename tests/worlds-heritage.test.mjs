import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PAVLOPETRI_SCENE as scene,validateHeritageScene,buildHeritageDrawList,closestMarker,safePlayerPosition} from '../public/worlds/heritage/scene.mjs';

test('Pavlopetri scene is explicitly non-georeferenced and provenance-linked',()=>{
 assert.equal(validateHeritageScene(scene),scene);
 assert.equal(scene.geometryStatus,'original_illustrative_layout_not_georeferenced');
 assert.equal(scene.evidenceStatus,'confirmed_settlement');
 assert.ok(scene.sources.length>=3);
 assert.ok(scene.sources.every(x=>x.startsWith('https://')));
 assert.equal(scene.markers.length,5);
});
test('Survey typology, artistic interpretation and environment are not conflated',()=>{
 const draw=buildHeritageDrawList(scene);
 assert.ok(draw.length>50);
 assert.ok(draw.some(x=>x.tier==='documented_type'));
 assert.ok(draw.some(x=>x.tier==='interpretive'));
 assert.ok(draw.some(x=>x.tier==='environment'));
 for(const b of draw)assert.ok(['documented_type','interpretive','environment','interface'].includes(b.tier));
 assert.ok(scene.markers.every(x=>x.kind==='documented_category'));
});
test('Movement stays inside the authored learning bounds',()=>{
 assert.deepEqual(safePlayerPosition(999,-999),{x:29,z:-43});
 assert.deepEqual(safePlayerPosition(-999,999),{x:-29,z:19});
 assert.equal(closestMarker(0,13).marker.id,'orientation');
});
test('Reject missing citations and fake surveyed geometry states',()=>{
 assert.throws(()=>validateHeritageScene({...scene,sources:[]}));
 assert.throws(()=>validateHeritageScene({...scene,geometryStatus:'surveyed_exact'}));
 assert.throws(()=>validateHeritageScene({...scene,markers:scene.markers.map((m,i)=>({...m,source:i===0?999:m.source}))}));
});
test('Public browser labels and source link are required',()=>{
 const html=readFileSync(new URL('../public/worlds/heritage/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/worlds/heritage/app.mjs',import.meta.url),'utf8');
 assert.match(html,/NOT AN EXACT RECONSTRUCTION/);
 assert.match(html,/not diving guidance/);
 assert.match(html,/id="joystick"/);
 assert.match(html,/id="toggle"/);
 assert.match(html,/submerged-heritage/);
 assert.match(app,/closestMarker/);
 assert.match(app,/scene\.sources/);
 assert.match(app,/webgl2/);
 assert.doesNotMatch(html+app,/base44\.app|tinyfish/i);
});
