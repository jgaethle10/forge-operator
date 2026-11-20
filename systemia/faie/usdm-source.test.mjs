import test from 'node:test';
import assert from 'node:assert/strict';
import { pollUsdmCountyDrought, normalizeUsdmCountyRows } from './usdm-source.mjs';
import { collectFaieOfficialSources, faieCollectorConfigFromEnv } from './collectors.mjs';
import { buildFaieInvestigation, emptyFaieState, ingestFaieObservation } from './core.mjs';

const checkedAt='2026-11-19T20:00:00.000Z';
const row=(FIPS='53077',overrides={})=>({
  MapDate:20261117,FIPS,County:'Yakima',State:'WA',None:20,D0:80,D1:55,D2:25,D3:5,D4:0,
  ...overrides
});
const sourceUrl='https://usdmdataservices.unl.edu/api/CountyStatistics/GetDroughtSeverityStatisticsByAreaPercent?aoi=53077';

test('USDM collector pulls only documented county percent-area API and preserves provenance',async()=>{
  const requests=[];
  const result=await pollUsdmCountyDrought({
    countyFips:['53077','53005','53021'],
    checkedAt,
    fetchImpl:async(url,options)=>{
      const parsed=new URL(url);
      requests.push(parsed);
      assert.equal(parsed.host,'usdmdataservices.unl.edu');
      assert.equal(parsed.pathname,'/api/CountyStatistics/GetDroughtSeverityStatisticsByAreaPercent');
      assert.equal(parsed.searchParams.get('statisticsType'),'1');
      assert.equal(options.headers.Accept,'application/json');
      const fips=parsed.searchParams.get('aoi');
      return {ok:true,text:async()=>JSON.stringify([row(fips)])};
    }
  });
  assert.equal(requests.length,3);
  assert.equal(result.receipt.status,'ok');
  assert.equal(result.observations.length,3);
  const yakima=result.observations.find(x=>x.region_group==='yakima-wa');
  const triCities=result.observations.filter(x=>x.region_group==='tri-cities-wa');
  assert.ok(yakima);
  assert.equal(triCities.length,2);
  assert.match(yakima.provenance_ref,/usdmdataservices.unl.edu/);
  assert.match(yakima.summary,/county area/);
  assert.match(yakima.summary,/not establish site water rights/);
  assert.equal(yakima.evidence_state,'reported');
  assert.equal(yakima.metric_metadata.data_format,'traditional_cumulative_percent_area');
  assert.equal(yakima.metric_metadata.d1_or_worse_percent,55);
  assert.equal(yakima.created_at,'2026-11-17T12:00:00.000Z');
});

test('USDM rejects stale, inconsistent, unauthorized or wrong-county reports',()=>{
  const base={fips:'53077',checkedAt,sourceUrl};
  assert.throws(()=>normalizeUsdmCountyRows([row('53005')],base),/county_not_in_response/);
  assert.throws(()=>normalizeUsdmCountyRows([row('53077',{MapDate:20260801})],base),/stale_or_future/);
  assert.throws(()=>normalizeUsdmCountyRows([row('53077',{D1:120})],base),/invalid_D1/);
  assert.throws(()=>normalizeUsdmCountyRows([row('53077',{D2:70})],base),/cumulative_levels_invalid/);
  assert.throws(()=>normalizeUsdmCountyRows([row('53077',{None:80})],base),/none_d0_sum_invalid/);
  assert.throws(()=>normalizeUsdmCountyRows([row('53077')],{...base,fips:'99999'}),/unknown_county/);
});

test('official failures yield partial/error receipts and never fabricated observations',async()=>{
  const result=await pollUsdmCountyDrought({
    countyFips:['53077','53005'],
    checkedAt,
    fetchImpl:async(url)=>{
      const fips=new URL(url).searchParams.get('aoi');
      if(fips==='53005')throw new Error('provider_unavailable');
      return {ok:true,text:async()=>JSON.stringify([row('53077')])};
    }
  });
  assert.equal(result.observations.length,1);
  assert.equal(result.receipt.status,'partial');
  assert.deepEqual(result.receipt.failures.map(x=>x.fips),['53005']);
});

test('Yakima USDM is independent of USGS water evidence; Tri-Cities cannot inherit Yakima location aliases',async()=>{
  const config=faieCollectorConfigFromEnv({FAIE_REGION_PROFILE:'yakima-basin-wa'});
  assert.equal(config.usdm_enabled,true);
  assert.deepEqual(config.usdm_county_fips,['53077','53005','53021']);
  const source=await pollUsdmCountyDrought({
    countyFips:config.usdm_county_fips,checkedAt,
    fetchImpl:async(url)=>({
      ok:true,
      text:async()=>JSON.stringify([row(new URL(url).searchParams.get('aoi'))])
    })
  });
  const water={
    observation_id:'usgs-water-latest:test-real-independent-water',
    created_at:checkedAt,region_key:'Yakima River at Umtanum',region_group:'yakima-wa',
    source_family:'usgs-water-data-api',independence_group:'usgs',domain:'hydrology',
    kind:'stream_discharge',evidence_state:'observed',reliability:.9,anomaly_score:.5,
    provenance_ref:'https://waterdata.usgs.gov/monitoring-location/USGS-12484500/',
    summary:'Yakima River water discharge at Umtanum; local gauge observation, not water rights',
    metric_value:2000
  };
  const collected=await collectFaieOfficialSources({
    checkedAt,config,
    pollers:{
      nws:async()=>({observations:[],receipt:{status:'ok',source_id:'nws-active-alerts',item_count:0}}),
      usgsWater:async()=>({observations:[water],receipt:{status:'ok',source_id:'usgs-water-latest-continuous',item_count:1}}),
      nwps:async()=>({observations:[],receipt:{status:'ok',source_id:'nwps-river-gauges',item_count:0}}),
      usdm:async()=>source
    }
  });
  assert.equal(collected.observations.length,4);
  const droughts=collected.observations.filter(x=>x.source_family==='us-drought-monitor-ndmc');
  assert.equal(droughts.length,3);
  const yak=droughts.find(x=>x.facts.metric_metadata.county_fips==='53077');
  const benton=droughts.find(x=>x.facts.metric_metadata.county_fips==='53005');
  assert.ok(yak.region_keys.includes('yakima-wa'));
  assert.ok(!benton.region_keys.includes('yakima-wa'));
  assert.ok(benton.region_keys.includes('tri-cities-wa'));
  assert.equal(yak.evidence_state,'reported');
  let state=emptyFaieState();
  for(const observation of collected.observations){
    const ingested=ingestFaieObservation(state,observation,{now:checkedAt});
    state=ingested.state;
    assert.equal(ingested.decision.action,'admitted');
  }
  const inv=buildFaieInvestigation(state,{
    question:'What evidence affects water availability, agricultural drought and climate resilience in the Yakima Valley?',
    region_keys:['yakima-wa'],asset_types:['regional food production infrastructure'],horizon_days:90
  },{now:checkedAt}).investigation;
  assert.ok(inv.findings.some(x=>x.source_family==='usgs-water-data-api'));
  assert.ok(inv.findings.some(x=>x.source_family==='us-drought-monitor-ndmc'));
  assert.ok(inv.coverage.independent_source_family_count>=2);
  assert.ok(inv.coverage.covered_dimensions.includes('water'));
  assert.ok(inv.coverage.covered_dimensions.includes('resilience'));
  assert.ok(!inv.coverage.covered_dimensions.includes('soil'), 'a disclaimer about unknown soil conditions must never count as measured soil evidence');
  assert.ok(!droughts.some(x=>x.evidence_state!=='reported'), 'USDM county estimates remain reported, not site measurements');
  assert.equal(inv.decision_authority,false);
  assert.equal(inv.publication_authority,false);

  const tri=buildFaieInvestigation(state,{
    question:'What drought evidence affects water and agricultural production around Tri-Cities?',
    region_keys:['tri-cities-wa'],asset_types:['regional food production infrastructure'],horizon_days:90
  },{now:checkedAt}).investigation;
  assert.ok(tri.findings.some(x=>x.source_family==='us-drought-monitor-ndmc'));
  assert.ok(!tri.findings.some(x=>x.source_family==='usgs-water-data-api'));
});

test('statewide NWS feed never labels a Spokane alert as Yakima evidence',async()=>{
  const config=faieCollectorConfigFromEnv({FAIE_REGION_PROFILE:'yakima-basin-wa'});
  const nwsRow=(area,identifier)=>({
    observation_id:'nws-active-alerts:'+identifier, created_at:checkedAt,
    region_key:area,region_group:'coarse-grid:1deg:47:-118',
    source_family:'nws-api',independence_group:'noaa-nws',
    domain:'emergency_report',kind:'nws_alert:heat_warning',
    anomaly_score:.8,reliability:.9,evidence_state:'reported',
    provenance_ref:'https://api.weather.gov/alerts/'+identifier,
    summary:'Heat advisory for '+area,adapter_receipt:{source_id:'nws-active-alerts'}
  });
  const collected=await collectFaieOfficialSources({
    checkedAt,
    config:{...config,usdm_enabled:false,usdm_county_fips:[]},
    pollers:{
      nws:async()=>({observations:[
        nwsRow('Spokane County, WA','spokane'),
        nwsRow('Yakima County, WA','yakima')
      ],receipt:{status:'ok',item_count:2}}),
      usgsWater:async()=>({observations:[],receipt:{status:'ok',item_count:0}}),
      nwps:async()=>({observations:[],receipt:{status:'ok',item_count:0}}),
      usdm:async()=>{throw new Error('disabled drought poller must not run')}
    }
  });
  const spokane=collected.observations.find(x=>x.observation_id.includes('spokane'));
  const yakima=collected.observations.find(x=>x.observation_id.includes('yakima'));
  assert.ok(spokane&&!spokane.region_keys.includes('yakima-wa'));
  assert.ok(yakima&&yakima.region_keys.includes('yakima-wa'));
});
