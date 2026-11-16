import test from 'node:test';
import assert from 'node:assert/strict';
import {RADIO_PRESETS,radioQuery,radioRegionalQuery,distanceKm,normalizeRadioStations,pointFromMap,pointToMap} from '../public/worlds/world-radio-core.mjs';
const uuid='bcab4e90-5908-48ee-8ea1-71ca52d5e9a1';
const station=(changes={})=>({stationuuid:uuid,name:'Test public stream',url_resolved:'https://example.org/live.mp3',geo_lat:46.6021,geo_long:-120.5059,lastcheckok:1,votes:21,...changes});
test('geographic queries are bounded and opt in to HTTPS/healthy stations',()=>{
  const u=new URL('https://example.org'+radioQuery(46.6021,-120.5059));
  assert.equal(u.searchParams.get('geo_lat'),'46.6021');
  assert.equal(u.searchParams.get('geo_distance'),'350000');
  assert.equal(u.searchParams.get('hidebroken'),'true');
  assert.equal(u.searchParams.get('is_https'),'true');
  assert.throws(()=>radioQuery(95,0),RangeError);
  assert.throws(()=>radioQuery(20,0,1001),RangeError);
});
test('approximate real-world distance is computed consistently',()=>{
  assert.equal(distanceKm(0,0,0,0),0);
  assert.ok(distanceKm(46.6021,-120.5059,47.6062,-122.3321)>150);
  assert.equal(distanceKm(46.6021,-120.5059,47.6062,-122.3321),distanceKm(47.6062,-122.3321,46.6021,-120.5059));
  assert.equal(distanceKm(NaN,0,1,1),Infinity);
});
test('station results are not invented and bad records cannot play',()=>{
  const rows=[station(),station(),station({stationuuid:'bcab4e90-5908-48ee-8ea1-71ca52d5e9a2',url_resolved:'http://unsafe.example/live'}),
    station({stationuuid:'bcab4e90-5908-48ee-8ea1-71ca52d5e9a3',geo_lat:1,geo_long:1}),
    station({stationuuid:'bcab4e90-5908-48ee-8ea1-71ca52d5e9a4',lastcheckok:0}),
    station({stationuuid:'bcab4e90-5908-48ee-8ea1-71ca52d5e9a5',url_resolved:'javascript:alert(1)',url:'javascript:alert(1)'})];
  const out=normalizeRadioStations(rows,46.6021,-120.5059);
  assert.equal(out.length,1);
  assert.equal(out[0].distanceKm,0);
  assert.equal(out[0].stream,'https://example.org/live.mp3');
  assert.throws(()=>normalizeRadioStations({},0,0),TypeError);
});
test('fallback source can be HTTPS if a resolved URL is HTTP',()=>{
  const out=normalizeRadioStations([station({url_resolved:'http://example.org/stream',url:'https://example.org/stream'})],46.6021,-120.5059);
  assert.equal(out[0].stream,'https://example.org/stream');
});
test('map geographic projection round trips and presets are legitimate',()=>{
  for(const p of RADIO_PRESETS){
    assert.ok(p.lat>=-90&&p.lat<=90&&p.lon>=-180&&p.lon<=180);
    const pos=pointToMap(p.lat,p.lon,480,240);
    const roundTrip=pointFromMap(pos.x,pos.y,480,240);
    assert.ok(Math.abs(roundTrip.lat-p.lat)<1e-8);
    assert.ok(Math.abs(roundTrip.lon-p.lon)<1e-8);
  }
  assert.throws(()=>pointFromMap(500,20,480,240),RangeError);
});

test('fallback search uses only documented country/state parameters and never invents a geographic match',()=>{
  const yakima=RADIO_PRESETS[0],q=radioRegionalQuery(yakima);
  const u=new URL('https://example.org'+q);
  assert.equal(u.searchParams.get('state'),'Washington');
  assert.equal(u.searchParams.get('countrycode'),'US');
  assert.equal(u.searchParams.get('has_geo_info'),'true');
  assert.equal(u.searchParams.get('geo_distance'),null);
  assert.equal(radioRegionalQuery({lat:46,lon:-120}),null);
  const far=station({geo_lat:40.7128,geo_long:-74.0060});
  assert.deepEqual(normalizeRadioStations([far],yakima.lat,yakima.lon),[]);
});
test('audio directory entries require a browser-safe HTTPS URL and healthy status',()=>{
  const bad=[
    station({url_resolved:'https://username:password@station.example/stream',url:'http://station.example/stream'}),
    station({url_resolved:'data:audio/wav;base64,AA==',url:'javascript:alert(1)'}),
    station({lastcheckok:0})
  ];
  assert.deepEqual(normalizeRadioStations(bad,46.6021,-120.5059),[]);
});
