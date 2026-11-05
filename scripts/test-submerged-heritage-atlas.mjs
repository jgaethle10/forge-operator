// Deterministic seed-data and UI safety checks. No network, external deps or test secrets.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=new URL('../public/submerged-heritage/sites.geojson',import.meta.url);
const html=new URL('../public/submerged-heritage/index.html',import.meta.url);
const data=JSON.parse(readFileSync(file,'utf8'));
const view=readFileSync(html,'utf8');
assert.equal(data.type,'FeatureCollection');
assert.equal(data.features.length,7);
assert.equal(data.features.filter(f=>f.properties.classification==='confirmed').length,5);
assert.equal(data.features.filter(f=>f.properties.classification==='disputed').length,2);
const ids=new Set();
for(const f of data.features){
 assert.equal(f.type,'Feature');
 assert.equal(f.geometry.type,'Point');
 assert.equal(f.geometry.coordinates.length,2);
 const [lon,lat]=f.geometry.coordinates;
 assert.ok(Number.isFinite(lon)&&lon>=-180&&lon<=180);
 assert.ok(Number.isFinite(lat)&&lat>=-90&&lat<=90);
 assert.ok(!ids.has(f.id),'duplicate id: '+f.id);ids.add(f.id);
 assert.ok(['confirmed','disputed'].includes(f.properties.classification));
 for(const k of ['name','country','region','summary','evidence','interpretation','cause','coordinate_quality'])assert.ok(typeof f.properties[k]==='string'&&f.properties[k].length>5,k+' is missing: '+f.id);
 assert.ok(f.properties.coordinate_quality.includes('region'),'public markers must not claim survey precision');
 assert.ok(Array.isArray(f.properties.sources)&&f.properties.sources.length>0);
 f.properties.sources.forEach(s=>assert.ok(/^https:\/\//.test(s),'insecure source: '+s));
}
assert.ok(view.includes("fetch('./sites.geojson'"),'UI must read canonical GeoJSON');
assert.ok(view.includes('not excavation coordinates'),'geography disclaimer not visible');
assert.ok(view.includes('Disputed interpretation'),'disputed status not visible');
assert.ok(!/https?:\/\/[^"'\s]*\.(js|css)/i.test(view),'no hosted script/css dependencies');
console.log('PASS: 7 cases, 5 confirmed, 2 disputed, sources, approximate geometry and UI safety labels');
