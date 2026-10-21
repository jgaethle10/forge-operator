import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startFabricLocalRuntime } from '../systemia/mcp/fabric-local-runtime.mjs';

const dir='public/demos/isaias-lifelines/';
const baseline=JSON.parse(fs.readFileSync(dir+'baseline.json','utf8'));
const html=fs.readFileSync(dir+'index.html','utf8');

test('Isaias source-bound baseline preserves official advisory and unknowns',()=>{
  assert.equal(baseline.cyclone_id,'AL092026');
  assert.equal(baseline.advisory_number,8);
  assert.equal(baseline.issued_at,'2026-10-08T15:00:00Z');
  assert.equal(baseline.advisory_values.maximum_sustained_wind_mph,85);
  assert.equal(baseline.advisory_values.position.latitude,23.7);
  assert.equal(baseline.advisory_values.position.longitude,-90.2);
  assert.equal(baseline.exposed_lifeline_count,null);
  assert.equal(baseline.observed_disruptions_count,null);
  assert.equal(baseline.geospatial_join_state,'not_performed');
  assert.equal(baseline.hazard_layers.length,0);
  assert.match(html,/NOT LIVE EMERGENCY GUIDANCE/);
  assert.match(html,/NOT A WEATHER MAP/);
  assert.match(html,/Forecast exposure is not confirmed damage/);
  assert.match(html,/https:\/\/www\.nhc\.noaa\.gov/);
  assert.doesNotMatch(html,/confirmed [0-9]+ (outages|shelters|facilities)/i);
  assert.match(html,/overflow-x:clip/);
  assert.match(html,/prefers-reduced-motion/);
});

test('owned Fabric local runtime can serve storm HTML and machine-readable baseline',async()=>{
  const runtime=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false});
  try{
    const page=await fetch(runtime.url+'/demos/isaias-lifelines/');
    assert.equal(page.status,200);
    assert.match(page.headers.get('content-type')||'',/text\/html/);
    assert.match(await page.text(),/Isaias: Lifeline Exposure Atlas/);
    const data=await fetch(runtime.url+'/demos/isaias-lifelines/baseline.json');
    assert.equal(data.status,200);
    assert.equal((await data.json()).advisory_number,8);
  }finally{await runtime.close();}
});