import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMigrationCSV,parseMigrationGeoJSON,telemetrySummary,segmentKm} from './migration-timeline.mjs';

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
