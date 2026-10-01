import assert from 'node:assert/strict';
import test from 'node:test';
import { collectUsgsEarthquakes } from './collectors.mjs';

test('USGS collector preserves event geometry for downstream visual storytelling',async()=>{
  const payload={
    metadata:{generated:Date.parse('2026-10-01T00:00:00Z'),count:1},
    features:[{
      id:'quake-1',
      properties:{
        mag:6.2,
        place:'100 km W of Example',
        time:Date.parse('2026-09-30T23:55:00Z'),
        status:'reviewed',
        tsunami:0,
        url:'https://earthquake.usgs.gov/earthquakes/eventpage/quake-1'
      },
      geometry:{type:'Point',coordinates:[-122.75,47.31,18.4]}
    }]
  };
  const fetchImpl=async()=>({ok:true,async json(){return payload}});
  const result=await collectUsgsEarthquakes({fetchImpl,now:'2026-10-01T00:00:00Z'});
  const row=result.observations[0].measurements[0];
  assert.equal(row.lon,-122.75);
  assert.equal(row.lat,47.31);
  assert.equal(row.depth_km,18.4);
  assert.equal(row.magnitude,6.2);
});
