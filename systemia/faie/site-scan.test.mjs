import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFaieSiteScan } from './site-scan.mjs';
const now='2026-11-19T20:15:00.000Z';
const soil=async()=>({
  mapunit_count:1,
  observation:{facts:{source_updated_at:'2025-08-29T16:57:00.000Z',mapunits:[{
    muname:'Naches loam',areaname:'Fixture',survey_area_name:'Example Survey',
    farmland_classification:'Prime farmland',source_updated_at:'2025-08-29T16:57:00.000Z',
    components:[{name:'Example component',percent:80,slope_percent:2,major_component:true}]
  }]}}
});
const weather=async()=>({
  status:'forecast_available',forecast_issued_at:'2026-11-19T20:10:00.000Z',
  forecast_freshness:'current',forecast_office:'PDT',
  periods:[{name:'Tonight',temperature_f:30}],
  screening_flags:[{trigger:'freeze',threshold:'forecast temperature <= 32°F',period:'Tonight'}],
  threshold_rules:{freeze_f:32},
  provenance_urls:['https://api.weather.gov/points/46.6021,-120.5059',
    'https://api.weather.gov/gridpoints/PDT/11,42/forecast']
});
const scan=(options={})=>buildFaieSiteScan({
  latitude:46.6021,longitude:-120.5059,retrievedAt:now,
  soilCollector:soil,weatherCollector:weather,...options
});

test('two independent point sources create bounded, source-linked operating report without site verdict',async()=>{
  const data=await scan();
  assert.equal(data.schema,'evercraft.faie.site-scan.v1');
  assert.equal(data.state,'bounded_evidence_available');
  assert.equal(data.sources_checked,2);
  assert.equal(data.sources_with_usable_evidence,2);
  assert.equal(data.soil.status,'mapped_soil_available');
  assert.equal(data.soil.evidence_state,'REPORTED');
  assert.equal(data.soil.mapunits[0].name,'Naches loam');
  assert.equal(data.weather.status,'forecast_available');
  assert.equal(data.weather.evidence_state,'MODELED');
  assert.equal(data.weather.screening_flags[0].trigger,'freeze');
  assert.ok(data.next_checks.some(x=>/water rights/i.test(x)));
  assert.ok(data.next_checks.some(x=>/energy tariffs/i.test(x)));
  assert.ok(data.next_checks.some(x=>/field/i.test(x)));
  assert.equal(data.site_suitability_verdict,null);
  assert.equal(data.investment_recommendation,null);
  assert.equal(data.decision_authority,false);
  assert.equal(data.privacy.public_lookup_persisted,false);
  assert.equal(data.privacy.upstream_receives_site_coordinates,true);
});

test('one failing provider remains explicit and cannot turn partial scan into whole-site evidence',async()=>{
  const data=await scan({weatherCollector:async()=>{throw new Error('forecast_upstream_failed_with_private_details');}});
  assert.equal(data.state,'partial_evidence');
  assert.equal(data.sources_with_usable_evidence,1);
  assert.equal(data.source_receipts[1].state,'unavailable');
  assert.equal(data.weather.status,'unavailable');
  assert.deepEqual(data.weather.periods,[]);
  assert.ok(!JSON.stringify(data).includes('private_details'),'do not leak raw upstream exceptions');
  assert.ok(data.unknowns.some(x=>/Weather Service.*not confirmed/i.test(x)));
});

test('stale weather never counts as useful current forecast',async()=>{
  const data=await scan({weatherCollector:async()=>({...await weather(),
    status:'forecast_freshness_not_verified',forecast_freshness:'stale'})});
  assert.equal(data.state,'partial_evidence');
  assert.equal(data.sources_with_usable_evidence,1);
  assert.equal(data.source_receipts[1].state,'forecast_freshness_unknown');
});

test('two failed sources fail to create fake evidence',async()=>{
  const fail=async()=>{throw new Error('upstream unavailable');};
  const data=await scan({soilCollector:fail,weatherCollector:fail});
  assert.equal(data.state,'insufficient_evidence');
  assert.equal(data.sources_with_usable_evidence,0);
  assert.equal(data.soil.mapunit_count,null);
  assert.deepEqual(data.soil.mapunits,[]);
  assert.deepEqual(data.weather.periods,[]);
  assert.equal(data.site_suitability_verdict,null);
});

test('provider takes the same explicit coordinates and does not infer parcel identifiers',async()=>{
  const seen=[];
  await scan({
    soilCollector:async(args)=>{seen.push(args);return soil();},
    weatherCollector:async(args)=>{seen.push(args);return weather();}
  });
  assert.equal(seen.length,2);
  assert.ok(seen.every(x=>x.latitude===46.6021&&x.longitude===-120.5059));
  assert.deepEqual(seen[0].regionKeys,[]);
  await assert.rejects(scan({latitude:0,longitude:0}),/coordinates/);
});
