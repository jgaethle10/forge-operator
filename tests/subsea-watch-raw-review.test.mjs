import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const base='public/subsea-watch/field-archive/track-review/';
const sample=JSON.parse(fs.readFileSync(base+'sample-5s.json','utf8'));
const html=fs.readFileSync(base+'index.html','utf8');
const js=fs.readFileSync(base+'review.mjs','utf8');
const archive=fs.readFileSync('public/subsea-watch/field-archive/index.html','utf8');

test('real NOAA sample is explicitly provisional, downsampled and source-hash pinned',()=>{
 assert.equal(sample.schema,'evercraft.subsea.raw_track_preview_5s.v1');
 assert.equal(sample.status,'PROVISIONAL_ROUNDED_DOWNSAMPLED_OBSERVATIONS');
 assert.equal(sample.mission_id,'EX2306_DIVE02');
 assert.equal(sample.source_credit,'NOAA Ocean Exploration');
 assert.equal(sample.source_archive_sha256,'b83df8dd9ae8ebeee7e23c5b1d8a2550b192137bbe7f1e394e551ee4124dda61');
 assert.equal(sample.original_window_count,300);
 assert.equal(sample.preview_sample_count,61);
 assert.equal(sample.points.length,61);
 assert.equal(sample.positioning_quality,'UNVERIFIED');
 assert.equal(sample.site_geometry,'NONE');
 assert.equal(sample.safety,'NOT_FOR_NAVIGATION_OR_DIVE_CLEARANCE');
 assert.match(sample.depth_reference,/UNVERIFIED/);
 assert.match(sample.clock_reference,/synchronization unverified/);
 assert.equal(sample.points[0][0],0);
 assert.equal(sample.points.at(-1)[0],299);
 assert.equal(sample.points[0][3],-1913.733);
 assert.equal(sample.points.at(-1)[3],-2064.021);
 for(let i=0;i<sample.points.length;i++){
  const [t,lat,lon,depth]=sample.points[i];
  assert.equal(t,i===60?299:5*i);
  assert.ok(Number.isFinite(lat)&&lat>=-90&&lat<=90);
  assert.ok(Number.isFinite(lon)&&lon>=-180&&lon<=180);
  assert.ok(Number.isFinite(depth)&&depth<=0);
 }
});
test('browser source-review interface never fabricates a 3D dive or a synchronized camera',()=>{
 assert.match(html,/Unverified positioning/);
 assert.match(html,/No interpolation/);
 assert.match(html,/signed depth/);
 assert.match(html,/NOT CERTIFIED/);
 assert.match(html,/noindex,nofollow/);
 assert.match(html,/id="position-plot"/);
 assert.match(html,/id="depth-plot"/);
 assert.match(html,/id="observation"/);
 assert.match(html,/src="\.\/review\.mjs"/);
 assert.match(archive,/href="\.\/track-review\/"/);
 assert.match(js,/fetch\('\.\/sample-5s\.json'/);
 assert.match(js,/EXPECTED_SHA/);
 assert.match(js,/dataset\.noaaTrack='source-observations-loaded'/);
 assert.match(js,/One dot per observed source sample/);
 assert.doesNotMatch(html,/three\.js|babylon|iframe|video.*autoplay/);
 assert.doesNotMatch(js,/WebSocket|sendBeacon|localStorage|innerHTML|createObjectURL|\.lineTo\(x,y\)/);
});
