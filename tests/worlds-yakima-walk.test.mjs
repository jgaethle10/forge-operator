import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {YAKIMA_SCENE,YAKIMA_WALK_SCHEMA,validateYakimaScene,buildYakimaDrawList,
 closestYakimaMarker,safeYakimaPosition} from '../public/worlds/hidden-world/yakima-walk/scene.mjs';
import {YAKIMA_TOUR_SECONDS,yakimaTourFrame} from '../public/worlds/hidden-world/yakima-walk/tour.mjs';
import {YAKIMA_PERIOD_SCHEMA,YAKIMA_PERIODS,getYakimaPeriod,buildYakimaPeriodDrawList,validateYakimaPeriodDrawList} from '../public/worlds/hidden-world/yakima-walk/periods.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Yakima gallery explicitly excludes surveyed and below-grade geometry',()=>{
 assert.equal(validateYakimaScene(YAKIMA_SCENE),YAKIMA_SCENE);
 assert.equal(YAKIMA_SCENE.schema,YAKIMA_WALK_SCHEMA);
 assert.equal(YAKIMA_SCENE.geometryStatus,'original_illustrative_streetscape_not_georeferenced');
 assert.equal(YAKIMA_SCENE.undergroundConnectionsVerified,false);
 assert.equal(YAKIMA_SCENE.markers.length,6);
 assert.ok(Math.abs(YAKIMA_SCENE.markers.find(m=>m.id==='orientation').x)>=4,'first research marker must not block entry camera');
 assert.ok(YAKIMA_SCENE.sources.every(s=>s.startsWith('https://')));
 assert.ok(YAKIMA_SCENE.markers.every(m=>YAKIMA_SCENE.sources[m.source]));
 assert.match(YAKIMA_SCENE.markers.find(m=>m.id==='doorways').body,/does not say those connections were below grade/);
 assert.throws(()=>validateYakimaScene({...YAKIMA_SCENE,undergroundConnectionsVerified:true}),/unverified_geometry_or_tunnel_boundary/);
 assert.throws(()=>validateYakimaScene({...YAKIMA_SCENE,geometryStatus:'surveyed_block'}),/unverified_geometry_or_tunnel_boundary/);
});
test('Yakima gallery original geometry stays inside fictional museum and has a walking corridor',()=>{
 const items=buildYakimaDrawList(YAKIMA_SCENE);
 assert.ok(items.length>110);
 assert.ok(items.some(i=>i.tier==='interpretive'));
 assert.ok(items.some(i=>i.tier==='documented_category'));
 assert.ok(items.every(i=>[i.x,i.y,i.z,i.sx,i.sy,i.sz].every(Number.isFinite)));
 assert.ok(items.every(i=>/^#[0-9a-f]{6}$/i.test(i.color)));
 const blocked=items.filter(i=>i.sy>1.4&&i.y-i.sy/2<1.65&&i.z>-41&&i.z<17&&Math.abs(i.x)-i.sx/2<2.2);
 assert.equal(blocked.length,0,'no opaque building or mast may block the central fictional promenade');
 assert.deepEqual(safeYakimaPosition(-200,500),{x:-28,z:19});
 assert.deepEqual(safeYakimaPosition(200,-500),{x:28,z:-43});
 assert.equal(closestYakimaMarker(5,-11).marker.id,'retail-1910');
});
test('Yakima guided walk visits documented source categories without real-world navigation',()=>{
 assert.equal(YAKIMA_TOUR_SECONDS,72);
 const a=yakimaTourFrame(0),m=yakimaTourFrame(30),b=yakimaTourFrame(72);
 assert.equal(a.markerId,'orientation');
 assert.ok(m.progress>a.progress&&b.progress>m.progress);
 assert.equal(b.finished,true);
 assert.match(b.evidenceBoundary,/never a map of underground connections/);
 assert.throws(()=>yakimaTourFrame(Infinity),/invalid_tour_elapsed/);
});
test('Yakima walk has static-first mobile fallback and bidirectional research links',()=>{
 const page=read('public/worlds/hidden-world/yakima-walk/index.html');
 const app=read('public/worlds/hidden-world/yakima-walk/app.mjs');
 const atlas=read('public/worlds/hidden-world/index.html');
 const lab=read('public/worlds/hidden-world/yakima-evidence.html');
 const lund=read('public/worlds/hidden-world/lund-building.html');
 assert.match(page,/<body class="no-js">/);
 assert.match(page,/id="static-fallback"/);
 assert.match(page,/href="\.\.\/yakima-evidence\.html"/);
 assert.match(page,/NO VERIFIED TUNNELS/);
 assert.match(page,/id="joystick"/);
 assert.match(page,/72-second historical walk/);
 assert.match(app,/buildYakimaDrawList/);
 assert.match(app,/__evercraftYakimaQA/);
 assert.doesNotMatch(app,/Titan I|missile|Pavlopetri|actual underground facility/i);
 for(const p of [atlas,lab,lund])assert.match(p,/href="yakima-walk\/"/);
 assert.doesNotMatch(page,/<script[^>]+src="https?:\/\//);
});

test('Yakima decade lenses show distinct historically sourced categories, never surveyed doors',()=>{
 assert.equal(YAKIMA_PERIOD_SCHEMA,'evercraft.hidden-world.yakima-period-lenses.v1');
 assert.deepEqual(YAKIMA_PERIODS.map(p=>p.id),['1899','1910','1920s']);
 assert.ok(YAKIMA_PERIODS.every(p=>p.source_url.startsWith('https://npgallery.nps.gov/')));
 assert.ok(YAKIMA_PERIODS.every(p=>/documented|imagined|measured|NOT|not/.test(p.certainty)));
 const saloon=buildYakimaPeriodDrawList('1899');
 const retail=buildYakimaPeriodDrawList('1910');
 const later=buildYakimaPeriodDrawList('1920s');
 for(const [id,items] of [['1899',saloon],['1910',retail],['1920s',later]]){
  assert.equal(validateYakimaPeriodDrawList(id,items),true);
  assert.ok(items.every(x=>x.provenance==='illustrative_geometry_only'));
  assert.ok(items.every(x=>x.tier==='interpretive'));
 }
 assert.ok(saloon.some(x=>/saloon/.test(x.name)));
 assert.equal(saloon.some(x=>/retail bay/.test(x.name)),false);
 assert.ok(retail.some(x=>/retail bay/.test(x.name)));
 assert.equal(retail.some(x=>/marquee/.test(x.name)),false);
 assert.ok(later.some(x=>/marquee/.test(x.name)));
 assert.ok(later.length>retail.length);
 assert.throws(()=>getYakimaPeriod('1924'),/unknown_yakima_period/);
 assert.throws(()=>validateYakimaPeriodDrawList('1899',[{tier:'documented_category'}]),/empty_period_artwork/);
});
test('Yakima UI exposes live era switching with plain-language provenance',()=>{
 const page=read('public/worlds/hidden-world/yakima-walk/index.html');
 const app=read('public/worlds/hidden-world/yakima-walk/app.mjs');
 const lab=JSON.parse(read('public/worlds/hidden-world/yakima-evidence-ledger.v1.json'));
 for(const id of ['1899','1910','1920s'])assert.match(page,new RegExp('id="period-'+id+'"'));
 assert.match(page,/role="group" aria-label="Artistic historical era lenses"/);
 assert.match(page,/aria-live="polite"/);
 assert.match(app,/function setPeriod\(id\)/);
 assert.match(app,/eraMeshes\.get\(period\)/);
 assert.ok(lab.virtual_exhibits[0].period_lenses.every(p=>p.geometry_verified===false));
 assert.equal(lab.virtual_exhibits[0].underground_connections_verified,false);
});
