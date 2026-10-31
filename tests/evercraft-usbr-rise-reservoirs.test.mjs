import test from 'node:test';
import assert from 'node:assert/strict';
import {
  YAKIMA_RESERVOIR_SITES, USBR_RISE_EDR_ORIGIN,
  parseRiseReservoirCoverage, fetchRiseReservoirStorage, collectRiseYakimaReservoirs
} from '../systemia/research-service/usbr-rise-reservoirs.mjs';

const fixture = {
  type: 'Coverage',
  domain: { type: 'Domain', axes: { t: { values: ['2026-10-28T07:00:00Z','2026-10-29T07:00:00Z'] } } },
  parameters: { '3': { observedProperty: { label: 'Lake/Reservoir Storage' }, unit: { symbol: 'af' } } },
  ranges: { '3': { type: 'NdArray', axisNames: ['t'], shape: [2], values: [12345, 0] } }
};

test('verified basin storage catalog contains five distinct RISE source identities', () => {
  assert.deepEqual(YAKIMA_RESERVOIR_SITES.map(s=>s.code),['KEE','KAC','CLE','BUM','RIM']);
  assert.equal(new Set(YAKIMA_RESERVOIR_SITES.map(s=>s.catalog_item_id)).size,5);
  assert.equal(new Set(YAKIMA_RESERVOIR_SITES.map(s=>s.location_id)).size,5);
  assert.ok(YAKIMA_RESERVOIR_SITES.every(s=>Number.isInteger(s.catalog_record_id)&&s.catalog_record_id>0));
});

test('RISE coverage preserves provisional evidence and actual zero rather than converting to missing', () => {
  const rows=parseRiseReservoirCoverage(fixture,'KEE',{beginDate:'2026-10-27',endDate:'2026-10-29'});
  assert.equal(rows.length,2);
  assert.equal(rows[0].value,12345);
  assert.equal(rows[1].value,0);
  assert.equal(rows[1].state,'provisional_observed');
  assert.equal(rows[1].unit,'af');
  assert.equal(rows[0].catalog_item_id,131246);
  assert.match(rows[0].provenance,/131246$/);
});

test('RISE parser rejects ambiguous parameters, wrong units and invalid or negative values', () => {
  const request={beginDate:'2026-10-27',endDate:'2026-10-29'};
  assert.throws(()=>parseRiseReservoirCoverage({...fixture,type:'CoverageCollection'},'KEE',request),/single Coverage/);
  assert.throws(()=>parseRiseReservoirCoverage({...fixture,ranges:{...fixture.ranges,'4':fixture.ranges['3']}},'KEE',request),/ambiguous/);
  assert.throws(()=>parseRiseReservoirCoverage({...fixture,parameters:{'3':{unit:{symbol:'ft'}}}},'KEE',request),/acre-feet/);
  assert.throws(()=>parseRiseReservoirCoverage({...fixture,ranges:{'3':{values:[-1,0]}}},'KEE',request),/invalid/);
  assert.throws(()=>parseRiseReservoirCoverage({...fixture,domain:{axes:{t:{values:['2026-10-28T07:00:00Z']}}}},'KEE',request),/cardinality/);
  assert.throws(()=>parseRiseReservoirCoverage(fixture,'OR',{beginDate:'2026-10-27',endDate:'2026-10-29'}),/unknown/);
});

test('RISE fetch uses fixed official HTTPS host, storage-only parameter and bounded date window', async () => {
  let seen;
  const rows=await fetchRiseReservoirStorage({
    code:'KAC',beginDate:'2026-10-27',endDate:'2026-10-29',
    fetchImpl:async(url,options)=>{seen={url:new URL(url),options};return {ok:true,status:200,json:async()=>fixture}}
  });
  assert.equal(seen.url.origin,USBR_RISE_EDR_ORIGIN);
  assert.equal(seen.url.pathname,'/api/ogc/collections/rise/locations/7186');
  assert.equal(seen.url.searchParams.get('parameter-name'),'3');
  assert.equal(seen.url.searchParams.get('f'),'json');
  assert.equal(rows.length,2);
  assert.equal(rows[0].station_id,'KAC');
  assert.equal((await fetchRiseReservoirStorage({
    code:'KAC',beginDate:'2026-10-27',endDate:'2026-10-29',
    fetchImpl:async()=>({ok:false,status:204})
  })).length,0);
  await assert.rejects(fetchRiseReservoirStorage({
    code:'KAC',beginDate:'2026-10-01',endDate:'2026-10-29',
    fetchImpl:async()=>({ok:true,json:async()=>fixture})
  }),/0-14/);
  await assert.rejects(fetchRiseReservoirStorage({
    code:'KAC',beginDate:'2026-10-27',endDate:'2026-10-29',
    fetchImpl:async()=>({ok:false,status:503})
  }),/503/);
});

test('reservoir inventory is never summed until reporting days, completeness, and unit are independently reviewed', async () => {
  const snap=await collectRiseYakimaReservoirs({
    asOf:'2026-10-30T18:00:00Z',
    fetchImpl:async()=>({ok:true,status:200,json:async()=>fixture})
  });
  assert.equal(snap.observations.length,5);
  assert.equal(snap.current_station_count,5);
  assert.equal(snap.status,'recent_five_station_observations_needing_time_zone_review');
  assert.equal(snap.total_storage_af,null);
  assert.equal(snap.derived_provisional_sum_af,0);
  assert.equal(snap.derived_sum_status,'five_site_arithmetic_same_source_reported_day');
  assert.equal(snap.publication_authorized,false);
  assert.deepEqual(snap.failures,[]);
});

test('upstream 204 or failure yields partial coverage without silently summing missing reservoirs', async () => {
  const snap=await collectRiseYakimaReservoirs({
    asOf:'2026-10-30T18:00:00Z',
    fetchImpl:async(url)=>{
      const n=Number(new URL(url).pathname.split('/').pop());
      if(n===7187)return {status:204,ok:false};
      if(n===7186)throw Error('no service');
      return {ok:true,status:200,json:async()=>fixture};
    }
  });
  assert.equal(snap.status,'partial');
  assert.equal(snap.current_station_count,3);
  assert.equal(snap.failures.length,1);
  assert.equal(snap.total_storage_af,null);
  assert.equal(snap.derived_provisional_sum_af,null);
});

test('zone-free RISE timestamps are preserved, not secretly converted into UTC', async () => {
  const zoneFree={
    ...fixture,
    domain:{axes:{t:{values:['2026-10-29T06:00:00','2026-10-28T06:00:00']}}},
    parameters:{},
    ranges:{'3':{axisNames:['t'],values:[950,920]}}
  };
  const rows=parseRiseReservoirCoverage(zoneFree,'BUM',{beginDate:'2026-10-27',endDate:'2026-10-29'});
  assert.equal(rows[0].time,'2026-10-29T06:00:00');
  assert.equal(rows[0].source_day_reported,'2026-10-29');
  assert.equal(rows[0].source_time_zone,'unspecified');
  const snap=await collectRiseYakimaReservoirs({
    asOf:'2026-10-30T18:00:00Z',
    fetchImpl:async()=>({ok:true,status:200,json:async()=>zoneFree})
  });
  assert.equal(snap.time_zone_unresolved_count,5);
  assert.equal(snap.observations[0].freshness,'recent_daily_time_zone_unresolved');
  assert.equal(snap.total_storage_af,null);
  assert.equal(snap.derived_provisional_sum_af,4750);
});

test('mixed source-reported reservoir dates do not yield an artificial five-site sum', async () => {
  let seq=0;
  const mixed=await collectRiseYakimaReservoirs({
    asOf:'2026-10-30T18:00:00Z',
    fetchImpl:async()=>{
      seq+=1;
      const day=seq===1?'2026-10-28T06:00:00':'2026-10-29T06:00:00';
      return {ok:true,status:200,json:async()=>({
        ...fixture,
        domain:{axes:{t:{values:[day]}}},
        ranges:{'3':{axisNames:['t'],values:[100]}}
      })};
    }
  });
  assert.equal(mixed.observations.length,5);
  assert.equal(mixed.derived_provisional_sum_af,null);
  assert.equal(mixed.derived_sum_status,'held_incomplete_or_nonmatching_source_days');
});
