import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectYakimaHistoricalClimate,eligibleYakimaClimatePoint,
  YAKIMA_CLIMATE_STATION
} from './ncei-climate-history.mjs';

const SAMPLE={latitude:46.6021,longitude:-120.5059};
const expectedUrlFragment='https://www.ncei.noaa.gov/access/services/data/v1';
const now='2026-11-20T04:22:00.000Z';
function dailyRows(year,{missing=[],badQuality=[]}={}){
  const rows=[],end=new Date(Date.UTC(year+1,0,1));
  for(let day=new Date(Date.UTC(year,0,1));day<end;day.setUTCDate(day.getUTCDate()+1)){
    const date=day.toISOString().slice(0,10);
    if(missing.includes(date))continue;
    rows.push({
      STATION:'USW00024243',DATE:date,
      TMAX:day.getUTCMonth()===6?'98':'55',
      TMIN:day.getUTCMonth()===0?'25':'42',
      PRCP:'0.05',
      TMAX_ATTRIBUTES:badQuality.includes(date)?',X,S':',,S',
      TMIN_ATTRIBUTES:',,S',PRCP_ATTRIBUTES:',,S'
    });
  }
  return rows;
}
function mockFetch({badYear=null,partial=false,untrustedStation=false,quality=false}={}){
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push(url);
    const parsed=new URL(url);
    assert.equal(parsed.origin,'https://www.ncei.noaa.gov');
    assert.equal(parsed.pathname,'/access/services/data/v1');
    assert.equal(parsed.searchParams.get('dataset'),'daily-summaries');
    assert.equal(parsed.searchParams.get('stations'),'USW00024243');
    assert.equal(parsed.searchParams.get('units'),'standard');
    assert.equal(parsed.searchParams.get('format'),'json');
    assert.equal(parsed.searchParams.get('includeAttributes'),'true');
    assert.equal(options.redirect,'error');
    const year=Number(parsed.searchParams.get('startDate').slice(0,4));
    if(year===badYear)return {ok:false,status:503,text:async()=>''};
    let rows=dailyRows(year,{
      missing:partial?dailyRows(year).slice(80).map(x=>x.DATE):[],
      badQuality:quality?[year+'-01-01']:[]
    });
    if(untrustedStation)rows[0].STATION='USW00000000';
    return {ok:true,status:200,text:async()=>JSON.stringify(rows)};
  };
  return {fetchImpl,calls};
}
test('official station metadata is explicit and point distance is shown, not site observations',()=>{
  assert.equal(YAKIMA_CLIMATE_STATION.id,'USW00024243');
  const p=eligibleYakimaClimatePoint(SAMPLE.latitude,SAMPLE.longitude);
  assert.equal(p.station_eligible,true);
  assert.ok(p.distance_km>0&&p.distance_km<10);
  assert.equal(eligibleYakimaClimatePoint(46.6021,-123).station_eligible,false);
  assert.throws(()=>eligibleYakimaClimatePoint(0,0),/explicit_contiguous_us_point_required/);
});
test('two complete observed years yield counts and denominators, never inferred 30-year normals',async()=>{
  const {fetchImpl,calls}=mockFetch();
  const output=await collectYakimaHistoricalClimate({...SAMPLE,retrievedAt:now,fetchImpl});
  assert.equal(output.schema,'evercraft.faie.ncei-station-history.v1');
  assert.equal(output.status,'historical_station_context_available');
  assert.equal(output.evidence_state,'OBSERVED');
  assert.equal(output.expected_days,731);
  assert.equal(output.received_calendar_dates,731);
  assert.deepEqual(output.sample_years,[2023,2024]);
  assert.equal(output.metrics.hot_days_ge_95f.threshold_days,62);
  assert.equal(output.metrics.freeze_nights_le_32f.threshold_days,62);
  assert.equal(output.metrics.wet_days_ge_0_01in.threshold_days,731);
  assert.equal(output.metrics.wet_days_ge_0_01in.observed_days,731);
  assert.equal(output.station.id,'USW00024243');
  assert.ok(output.limitations.some(s=>s.includes('NOT 30-year climate normals')));
  assert.equal(output.site_suitability_verdict,null);
  assert.equal(output.request_persisted,false);
  assert.equal(calls.length,2);
  assert.ok(calls.every(x=>x.startsWith(expectedUrlFragment)));
});
test('unavailable year cannot masquerade as complete historical evidence',async()=>{
  const {fetchImpl}=mockFetch({badYear:2024});
  await assert.rejects(collectYakimaHistoricalClimate({...SAMPLE,fetchImpl}),/ncei_required_year_unavailable/);
});
test('missing and quality-flagged readings count as missing, not cold or dry zeroes',async()=>{
  const {fetchImpl}=mockFetch({quality:true});
  const output=await collectYakimaHistoricalClimate({...SAMPLE,fetchImpl});
  assert.equal(output.metrics.hot_days_ge_95f.observed_days,729);
  assert.equal(output.metrics.hot_days_ge_95f.missing_days,2);
  assert.equal(output.metrics.wet_days_ge_0_01in.observed_days,731);
});
test('sparse station returns explicit insufficient historical coverage',async()=>{
  const {fetchImpl}=mockFetch({partial:true});
  const output=await collectYakimaHistoricalClimate({...SAMPLE,fetchImpl});
  assert.equal(output.status,'insufficient_historical_coverage');
  assert.ok(output.metrics.freeze_nights_le_32f.observation_coverage<0.7);
});
test('an ineligible site must never request the Yakima station',async()=>{
  const {fetchImpl,calls}=mockFetch();
  await assert.rejects(collectYakimaHistoricalClimate({
    latitude:47.5,longitude:-121,retrievedAt:now,fetchImpl
  }),/no_approved_nearby_historical_station/);
  assert.equal(calls.length,0);
});
test('unexpected station id is not accepted as Yakima history',async()=>{
  const {fetchImpl}=mockFetch({untrustedStation:true});
  const result=await collectYakimaHistoricalClimate({...SAMPLE,retrievedAt:now,fetchImpl});
  assert.equal(result.received_calendar_dates,729);
});
