import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {makeHistoryReceipt,buildDailyHistory,sha256,HISTORY_SCHEMA} from
  '../systemia/research-service/watershed-history.mjs';
import {archiveWatershedRun} from '../systemia/research-service/watershed-history-archive.mjs';
import {readVerifiedHistory} from '../systemia/research-service/watershed-history-read.mjs';

const sha='a'.repeat(40),runId='42739867324',runTime='2026-11-10T02:00:00.000Z';
const URLS={
  snow:'https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data',
  basin:'https://wcc.sc.egov.usda.gov/reports/UpdateReport.html?report=Washington',
  usgs:'https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/items/abc',
  usbr:'https://data.usbr.gov/catalog/8304/item/131246'
};
function fixture(day='2026-11-10'){
  const sensors={
    schema:'evercraft.research.watershed-intelligence.v1',region:'yakima-basin-wa',
    live_collection:true,publication_authorized:false,drone_operations_authorized:false,
    as_of:day+'T02:00:00.000Z',status:'partial',
    source_coverage:{status:'connected_minimum',snow_station_count:1,
      usgs_discharge_location_count:1,suitable_for_publication:false},
    snow:[{station_id:'375:WA:SNTL',kind:'WTEQ',time:'2026-11-09',value:0,
      unit:'in',state:'observed',freshness:'current',provenance:URLS.snow}],
    river:[{station_id:'USGS-12484500',kind:'stream_discharge',
      time:day+'T01:15:00.000Z',value:430,unit:'ft^3/s',
      state:'observed',freshness:'current',provenance:URLS.usgs}],failures:[]
  };
  const medians={schema:'evercraft.research.swe-median-audit.v1',publication_authorized:false,
    basin_percent_of_median:null,period:'1991-2020',
    station_comparisons:[{station_id:'375:WA:SNTL',date:'2026-11-09',
      observed_swe_in:0,median_swe_in:0.1,ratio_percent:null,
      state:'small_or_zero_median_suppressed',source:URLS.snow}]};
  const basins={schema:'evercraft.research.nrcs-basin-index.v1',publication_authorized:false,
    not_an_independent_recalculation:true,observed_date:'2026-11-09',source_url:URLS.basin,
    reference_period:'1991-2020',all_basins_warned:true,
    basins:['upper-yakima','naches','lower-yakima'].map((id,i)=>({
      id,value_percent:[11,109,130][i],warning_flag:true,observation_date:'2026-11-09',
      reference_period:'1991-2020',provenance:URLS.basin
    }))};
  const names=['KEE','KAC','CLE','BUM','RIM'];
  const reservoir={source_id:'usbr-rise-edr-reservoir-storage',
    publication_authorized:false,total_storage_af:null,as_of:day+'T02:00:00.000Z',
    observations:names.map((station_id,i)=>({
      station_id,value:100+i,unit:'af',kind:'reservoir_storage',
      source_day_reported:'2026-11-09',source_time_zone:'unspecified',
      provenance:URLS.usbr,freshness:'recent_daily_time_zone_unresolved'
    })),
    failures:[],derived_provisional_sum_af:510,derived_sum_source_reported_day:'2026-11-09'};
  return Object.fromEntries(Object.entries({
    'latest.json':sensors,'swe-median-audit.json':medians,
    'official-basin-report.json':basins,'reservoir-source-probe.json':reservoir
  }).map(([name,v])=>[name,Buffer.from(JSON.stringify(v)+'\n')]));
}
function build(bytes=fixture(),extras={}){
  return makeHistoryReceipt(bytes,{runId,headSha:sha,ingestedAt:runTime,...extras});
}

test('real-source-shaped receipts preserve zero, dates, warning flags and provisional meaning',()=>{
  const raw=fixture();
  const receipt=build(raw);
  assert.equal(receipt.schema,HISTORY_SCHEMA);
  assert.equal(receipt.collection_day_utc,'2026-11-10');
  assert.equal(receipt.source_run_id,runId);
  assert.equal(receipt.sensors.snow[0].value,0,'true observed zero preserved');
  assert.equal(receipt.sensors.snow[0].source_day,'2026-11-09');
  assert.equal(receipt.sensors.river[0].value,430);
  assert.equal(receipt.basins.indices[0].index_percent,11);
  assert.ok(receipt.basins.indices.every(r=>r.warning_flag===true));
  assert.equal(receipt.medians.comparisons[0].station_percent,null);
  assert.equal(receipt.reservoirs.derived_provisional_sum_af,510);
  assert.equal(receipt.reservoirs.official_total,false);
  assert.equal(receipt.reservoirs.reporting_day_reconciled,false);
  assert.equal(receipt.forecast_authorized,false);
  assert.equal(receipt.customer_delivery_verified,false);
  assert.equal(receipt.source_digests['latest.json'],sha256(raw['latest.json']));
  assert.equal(receipt.archived_sources.length,4);
});
test('missing optional upstream source retains a gap and never turns into zero or healthy status',()=>{
  const raw=fixture();
  delete raw['official-basin-report.json'];
  delete raw['reservoir-source-probe.json'];
  const receipt=build(raw);
  assert.equal(receipt.basins,null);
  assert.equal(receipt.reservoirs,null);
  assert.equal(receipt.source_completeness.official_basins,false);
  assert.equal(receipt.source_completeness.reservoirs,false);
  assert.equal(receipt.source_completeness.sensor,true);
});
test('untrusted, inconsistent and privileged source assertions reject archive ingestion',()=>{
  const mutations=[
    raw=>{const x=JSON.parse(raw['latest.json']);x.publication_authorized=true;raw['latest.json']=Buffer.from(JSON.stringify(x));},
    raw=>{const x=JSON.parse(raw['latest.json']);x.snow[0].provenance='https://evil.com';raw['latest.json']=Buffer.from(JSON.stringify(x));},
    raw=>{const x=JSON.parse(raw['latest.json']);x.snow[0].value=-1;raw['latest.json']=Buffer.from(JSON.stringify(x));},
    raw=>{const x=JSON.parse(raw['latest.json']);x.snow[0].unit='mm';raw['latest.json']=Buffer.from(JSON.stringify(x));},
    raw=>{const x=JSON.parse(raw['latest.json']);x.snow[0].time='2026-11-09T00:00:00Z';raw['latest.json']=Buffer.from(JSON.stringify(x));},
    raw=>{const x=JSON.parse(raw['latest.json']);x.river[0].unit='cms';raw['latest.json']=Buffer.from(JSON.stringify(x));},
    raw=>{const x=JSON.parse(raw['latest.json']);x.river[0].station_id='USGS-NOT_REAL';raw['latest.json']=Buffer.from(JSON.stringify(x));},
    raw=>{const x=JSON.parse(raw['reservoir-source-probe.json']);x.derived_provisional_sum_af=800;raw['reservoir-source-probe.json']=Buffer.from(JSON.stringify(x));},
    raw=>{const x=JSON.parse(raw['official-basin-report.json']);x.all_basins_warned=false;raw['official-basin-report.json']=Buffer.from(JSON.stringify(x));},
    raw=>{const x=JSON.parse(raw['swe-median-audit.json']);x.basin_percent_of_median=150;raw['swe-median-audit.json']=Buffer.from(JSON.stringify(x));}
  ];
  for(const mutate of mutations){
    const raw=fixture();mutate(raw);
    assert.throws(()=>build(raw),undefined,'unsafe source was archived');
  }
  assert.throws(()=>build(fixture(),{event:'pull_request'}),/trusted main-branch/);
  assert.throws(()=>build(fixture(),{runId:'../etc'}),/trusted main-branch/);
});
test('immutable on-disk run is idempotent, conflict-safe and retains all four raw byte receipts',()=>{
  const root=mkdtempSync(join(tmpdir(),'evercraft-water-ledger-'));
  const source=join(root,'source'),ledger=join(root,'ledger');
  mkdirSync(source);
  const raw=fixture();
  for(const [name,bytes] of Object.entries(raw))writeFileSync(join(source,name),bytes);
  try{
    const opts={sourceDir:source,ledgerDir:ledger,runId,headSha:sha,event:'schedule',ingestedAt:runTime};
    const first=archiveWatershedRun(opts);
    assert.equal(first.action,'new_immutable_entry');
    assert.equal(first.source_count,4);
    const dir=join(ledger,first.destination);
    const stored=JSON.parse(readFileSync(join(dir,'receipt.json'),'utf8'));
    for(const [name,bytes] of Object.entries(raw)){
      assert.equal(sha256(readFileSync(join(dir,'sources',name))),sha256(bytes));
      assert.equal(stored.source_digests[name],sha256(bytes));
    }
    assert.equal(archiveWatershedRun(opts).action,'already_recorded_unchanged');
    const verified=readVerifiedHistory(ledger,{asOf:'2026-11-10',windowDays:7});
    assert.equal(verified.status,'insufficient_history');
    assert.equal(verified.verified_run_count,1);
    assert.equal(verified.raw_digests_verified,true);
    assert.equal(verified.points.at(-1).official_basin_indices[0].warning_flag,true);
    assert.equal(verified.points.at(-2).provisional_reservoir_sum_af,null);
    assert.equal(verified.public_release_authorized,false);
    assert.throws(()=>readVerifiedHistory(ledger,{asOf:'2026-02-31',windowDays:7}),/valid ledger root/);
    const sensor=JSON.parse(raw['latest.json']);sensor.river[0].value+=1;
    writeFileSync(join(source,'latest.json'),JSON.stringify(sensor));
    assert.throws(()=>archiveWatershedRun(opts),/immutable run ID collision/);
    assert.ok(existsSync(join(dir,'receipt.json')),'original evidence untouched');
    writeFileSync(join(dir,'sources','latest.json'),Buffer.from(JSON.stringify(sensor)));
    assert.throws(()=>readVerifiedHistory(ledger,{asOf:'2026-11-10',windowDays:7}),/fingerprints|changed|source/);
  }finally{rmSync(root,{recursive:true,force:true})}
});
test('7/30/90-day timeline labels missing days, never interpolates or creates fake trends',()=>{
  const a=build();
  const empty=build(fixture('2026-11-08'),{runId:'42739867325',ingestedAt:'2026-11-08T02:05:00.000Z'});
  for(const span of [7,30,90]){
    const result=buildDailyHistory([a],{asOf:'2026-11-10',windowDays:span});
    assert.equal(result.points.length,span);
    assert.equal(result.status,'insufficient_history');
    assert.equal(result.days_with_observations,1);
    assert.equal(result.points.at(-2).source_available,false);
    assert.equal(result.points.at(-2).provisional_reservoir_sum_af,null);
    assert.equal(result.points.at(-1).provisional_reservoir_sum_af,510);
    assert.equal(result.interpolation_performed,false);
  }
  const joined=buildDailyHistory([a,empty],{asOf:'2026-11-10',windowDays:7});
  assert.equal(joined.days_with_observations,2);
  assert.equal(joined.status,'dated_observations_only');
  assert.equal(joined.points.at(-2).source_available,false);
  assert.equal(joined.points.at(-3).source_available,true);
  assert.equal(joined.points.at(-3).official_basin_indices[0].warning_flag,true);
});
