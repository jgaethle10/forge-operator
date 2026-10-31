import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAwdbSweMedians,fetchAwdbSweMedians,auditSweStationComparisons,collectSweMedianAudit,
  SMALL_MEDIAN_FLOOR_IN,NRCS_AWDB_MEDIAN_API
} from '../systemia/research-service/awdb-swe-normals.mjs';

const station='375:WA:SNTL',other='478:WA:SNTL';
const date='2026-10-29';
const example={
  stationTriplet:station,
  data:[{stationElement:{elementCode:'WTEQ',storedUnitCode:'in'},values:[{date,value:1.5,median:0.2,qaFlag:'A'}]}]
};
const snapshot={
  schema:'evercraft.research.watershed-intelligence.v1',region:'yakima-basin-wa',
  as_of:'2026-10-30T16:00:00Z',snow:[
    {station_id:station,kind:'WTEQ',time:date,value:1.5,unit:'in',freshness:'current'}
  ]
};
const parse=(p)=>parseAwdbSweMedians(p,{stationTriplets:[station],beginDate:date,endDate:date});
test('NRCS REST central tendency schema accepts same-day 1991-2020 median without claiming basin ratio',()=>{
  const rows=parse([example]);
  assert.equal(rows.length,1);
  assert.equal(rows[0].swe_in,1.5);
  assert.equal(rows[0].median_in,0.2);
  assert.equal(rows[0].historical_baseline,'1991-2020_median');
  assert.equal(rows[0].quality_code,'A');
  const audit=auditSweStationComparisons(snapshot,rows);
  assert.equal(audit.station_comparisons[0].state,'small_or_zero_median_suppressed');
  assert.equal(audit.station_comparisons[0].ratio_percent,null);
  assert.equal(audit.basin_percent_of_median,null);
  assert.equal(audit.publication_authorized,false);
  assert.equal(audit.denominator_floor_in,SMALL_MEDIAN_FLOOR_IN);
});
test('station ratio is admitted ONLY with same date, source reading, unit, and substantial median',()=>{
  const audit=auditSweStationComparisons(snapshot,parse([{
    ...example,data:[{...example.data[0],values:[{date,value:1.5,median:1.2}]}]
  }]));
  assert.equal(audit.station_comparisons[0].ratio_percent,125);
  assert.equal(audit.station_comparisons[0].state,'station_comparison_valid');
  assert.equal(audit.station_comparisons[0].comparison_scope,'single_station_only');
  assert.equal(audit.basin_percent_of_median,null);
});
test('zero denominator, missing median, mismatch, stale and unit differences never produce percentage',()=>{
  const base={...parse([example])[0],median_in:0};
  for(const row of [
    base,{...base,median_in:null},{...base,swe_in:3},{...base,date:'2026-10-28'}
  ]){
    const audit=auditSweStationComparisons(snapshot,[row]);
    assert.equal(audit.station_comparisons[0].ratio_percent,null);
  }
  assert.equal(auditSweStationComparisons({
    ...snapshot,snow:[{...snapshot.snow[0],freshness:'stale'}]
  },[{...base,median_in:2}]).station_comparisons[0].ratio_percent,null);
  assert.equal(auditSweStationComparisons({
    ...snapshot,snow:[{...snapshot.snow[0],unit:'cm'}]
  },[{...base,median_in:2}]).station_comparisons[0].ratio_percent,null);
  assert.throws(()=>auditSweStationComparisons(snapshot,[],{minMedianIn:0}),/at least one inch/);
});
test('strict parser rejects wrong stations, wrong SWE units, duplicate station, fake dates, and series errors',()=>{
  assert.throws(()=>parse([{...example,stationTriplet:other}]),/unexpected station/);
  assert.throws(()=>parse([example,example]),/duplicate/);
  assert.throws(()=>parse([{...example,data:[{...example.data[0],stationElement:{elementCode:'WTEQ',storedUnitCode:'mm'}}]}]),/inches/);
  assert.throws(()=>parse([{...example,data:[{...example.data[0],error:'bad series'}]}]),/reported error/);
  assert.throws(()=>parse([{...example,data:[{...example.data[0],values:[{date:'2026-10-30',value:2,median:1.1}]}]}]),/out of requested/);
});
test('GET is bounded to USDA host and requests MEDIAN with WTEQ daily field',async()=>{
  let got;
  const rows=await fetchAwdbSweMedians({
    stationTriplets:[station],beginDate:date,endDate:date,
    fetchImpl:async(url,opt)=>{got={url:new URL(url),opt};return {ok:true,status:200,json:async()=>[example]}}
  });
  assert.equal(rows.length,1);
  assert.equal(got.url.origin,'https://wcc.sc.egov.usda.gov');
  assert.equal(got.url.pathname,'/awdbRestApi/services/v1/data');
  assert.equal(got.url.searchParams.get('centralTendencyType'),'MEDIAN');
  assert.equal(got.url.searchParams.get('elements'),'WTEQ');
  assert.equal(got.url.searchParams.get('duration'),'DAILY');
  assert.equal(got.url.searchParams.get('returnSuspectData'),'false');
  assert.equal(got.url.searchParams.get('beginDate'),date);
  assert.ok(got.opt.headers['User-Agent'].includes('Evercraft'));
  await assert.rejects(fetchAwdbSweMedians({stationTriplets:[station],beginDate:'2026-10-01',endDate:date}),/14 days/);
  await assert.rejects(fetchAwdbSweMedians({
    stationTriplets:[station],beginDate:date,endDate:date,
    fetchImpl:async()=>({ok:false,status:503})
  }),/503/);
  assert.equal(NRCS_AWDB_MEDIAN_API,'https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data');
});
test('real-world collection failures become explicit source holds, not false-normal evidence',async()=>{
  const res=await collectSweMedianAudit(snapshot,{
    fetchImpl:async()=>{throw new Error('downstream disconnected')}
  });
  assert.equal(res.failures.length,1);
  assert.equal(res.failures[0].source,'nrcs-median');
  assert.equal(res.station_comparisons[0].state,'median_unavailable');
  assert.equal(res.basin_percent_of_median,null);
  assert.equal(res.publication_authorized,false);
});
