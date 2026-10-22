import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const root=process.cwd();
const read=relative=>readFileSync(join(root,relative),'utf8');
const html=read('public/evermaps/index.html');
const js=read('public/evermaps/app.js');
const css=read('public/evermaps/style.css');
const docker=read('Dockerfile');
const server=read('server.ts');

test('EverMaps has a real, independently owned static entry point and same-origin API',()=>{
 assert.match(html,/<title>EverMaps \| Evercraft Owned Preview<\/title>/);
 assert.match(html,/src="\/evermaps\/app.js"/);
 assert.match(html,/href="\/evermaps\/style.css"/);
 assert.match(js,/fetch\('\/api\/evermaps\/incidents\/pnw'/);
 assert.match(server,/registerEvermapsIncidentRoutes\(app/);
 assert.match(docker,/COPY --from=build \/app\/dist \.\/dist/);
});
test('No legacy platform SDK, hosting endpoint, geofence, payment or fake rewards appear in owned page',()=>{
 for(const file of [html,js,css]){
  assert.doesNotMatch(file, /base44|@base44|functions\.invoke|entities\.[A-Za-z]+\.list|stripe\.com|points_awarded/i);
 }
 assert.match(html,/No marker is an official evacuation order/);
 assert.match(html,/no location permissions or Rewards Points used/i);
});
test('Source errors fail closed, rather than showing stale records as active',()=>{
 assert.match(js,/state\.records=\[\];/);
 assert.match(js,/sourceState='unavailable'/);
 assert.match(js,/Official incident source unavailable/);
 assert.match(js,/json\.guarantees\?\.current_feed_is_burning_confirmation!==false/);
 assert.match(js,/json\.count!==json\.records\.length/);
 assert.match(js,/state\.lastFetch=Date\.now\(\)/);
 assert.match(js,/now-Date\.parse\(r\.modified_at_utc\)<14\*86400000/);
 assert.doesNotMatch(js,/actively burning|confirmed flame front/i);
});
test('Mobile controls, source attribution and map provider boundaries are present',()=>{
 assert.match(html,/OpenStreetMap contributors/);
 assert.match(js,/https:\/\/tile\.openstreetmap\.org\//);
 assert.match(js,/pointerdown/);
 assert.match(js,/pointermove/);
 assert.match(js,/addEventListener\('keydown'/);
 assert.match(css,/@media\(max-width:640px\)/);
 assert.match(html,/aria-label="Zoom in"/);
 assert.match(html,/aria-label="Zoom out"/);
 assert.match(html,/aria-label="Show NIFC incident reports"/);
});
test('The static release defaults to noindex until independently verified and approved',()=>{
 assert.match(html,/name="robots" content="noindex,nofollow"/);
 assert.match(html,/OWNED RUNTIME PREVIEW/);
 assert.match(html,/not an emergency operations product/);
});

test('public-domain natural-earth geography is bundled and credited as the raster fallback',()=>{
 const land=JSON.parse(read('public/evermaps/pnw-land.geojson'));
 assert.equal(land.type,'FeatureCollection');
 assert.equal(land.metadata.rights,'public domain');
 assert.equal(land.metadata.source,'Natural Earth 1:50m land');
 assert.ok(land.features.length>=15);
 assert.ok(land.features.every(f=>f.geometry?.type==='Polygon'));
 assert.match(html,/id="em-fallback"/);
 assert.match(html,/Natural Earth \(public domain\)/);
 assert.match(js,/fetch\('\/evermaps\/pnw-land\.geojson'/);
 assert.match(js,/function renderFallback\(\)/);
 assert.match(js,/function updateTileCoverage\(\)/);
 assert.match(css,/\.em-fallback\{/);
});
