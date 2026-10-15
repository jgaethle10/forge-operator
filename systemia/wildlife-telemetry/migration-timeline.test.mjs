import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMigrationCSV,parseMigrationGeoJSON,telemetrySummary,segmentKm,sampleForMap,MAX_OBSERVATION_GAP_MS} from './migration-timeline.mjs';

test('CSV observations are sorted, deduplicated and grouped by individual',()=>{
 const text=[
  'timestamp,latitude,longitude,animal_id',
  '2026-01-03T00:00:00Z,47.2,-120.3,duck-1',
  '2026-01-01T00:00:00Z,46.5,-120.5,duck-1',
  '2026-01-01T00:00:00Z,46.5,-120.5,duck-1',
  '2026-01-04T00:00:00Z,abc,-120.3,duck-1'
 ].join('\n');
 const result=parseMigrationCSV(text);
 assert.equal(result.accepted,2);
 assert.equal(result.rejected,2);
 assert.equal(result.points[0].lat,46.5);
 assert.equal(result.points[1].animal,'duck-1');
});
test('GeoJSON features require dated Point coordinates and geographic bounds',()=>{
 const features=[
  {type:'Feature',geometry:{type:'Point',coordinates:[-120,46.5]},properties:{timestamp:'2026-01-01'}},
  {type:'Feature',geometry:{type:'Point',coordinates:[-121,47.5]},properties:{timestamp:'2026-01-12'}},
  {type:'Feature',geometry:{type:'Point',coordinates:[300,47.5]},properties:{timestamp:'2026-01-13'}}
 ];
 const result=parseMigrationGeoJSON({type:'FeatureCollection',features});
 assert.equal(result.accepted,2);
 assert.equal(result.rejected,1);
 assert.equal(telemetrySummary(result.points).gapCount,1);
});
test('No valid track is invented when source data is insufficient',()=>{
 assert.throws(()=>parseMigrationCSV('timestamp,latitude,longitude\n2026-01-01,46.4,-120.2\n'));
 assert.throws(()=>parseMigrationCSV('timestamp,latitude,longitude\nno-date,46.4,-120.2\n2026-01-02,400,-120.2'));
});
test('CSV quoted delimiters and headers are supported',()=>{
 const result=parseMigrationCSV('"Date time","Latitude","Longitude","Animal ID"\n"2026-01-01T00:00:00Z","46.2","-120.5","duck, alpha"\n"2026-01-02T00:00:00Z",46.3,-120.6,"duck, alpha"');
 assert.equal(result.points[0].animal,'duck, alpha');
});
test('Sampled distance is nonnegative and not confused with ground-truth travel',()=>{
 const a={lat:46,lon:-120},b={lat:47,lon:-120};
 assert.ok(segmentKm(a,b)>110&&segmentKm(a,b)<112);
 const points=[{...a,at:Date.parse('2026-01-01'),animal:'a'},{...b,at:Date.parse('2026-01-03'),animal:'a'}];
 const summary=telemetrySummary(points);
 assert.equal(summary.count,2);
 assert.ok(summary.distanceKm>110);
});
test('Cross-animal proximity is not interpreted as travel distance',()=>{
 const points=[
  {lat:46,lon:-120,at:1,animal:'A'},
  {lat:47,lon:-120,at:2,animal:'B'},
  {lat:46.1,lon:-120,at:3,animal:'A'}
 ];
 const result=telemetrySummary(points);
 assert.equal(result.distanceKm,0);
});


test('Rendering sample caps 50,000 fixes at 1,000 and preserves boundaries',()=>{
 const points=Array.from({length:50000},(_,i)=>({lat:30,lon:-120+i/100000,at:Date.parse('2007-01-01')+i*1000,animal:'goose'}));
 const sample=sampleForMap(points);
 assert.equal(sample.length,1000);
 assert.equal(sample[0],points[0]);
 assert.equal(sample.at(-1),points.at(-1));
 assert.equal(telemetrySummary(points).count,50000);
});
test('Gaps are defined by time, not assumed movement, and the cutoff is stable',()=>{
 assert.equal(MAX_OBSERVATION_GAP_MS,604800000);
 const points=[
  {lat:46,lon:-120,at:Date.parse('2007-01-01T00:00:00Z'),animal:'a'},
  {lat:46.1,lon:-120,at:Date.parse('2007-01-08T00:00:00Z'),animal:'a'},
  {lat:46.2,lon:-120,at:Date.parse('2007-01-16T00:00:00Z'),animal:'a'}
 ];
 assert.equal(telemetrySummary(points).gapCount,1);
});
test('Sampling options reject malformed maximum',()=>{
 assert.throws(()=>sampleForMap([1,2,3],1));
 assert.deepEqual(sampleForMap([1,2,3],4),[1,2,3]);
});
