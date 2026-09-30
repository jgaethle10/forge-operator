import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupAliEVSite } from './site-source.mjs';

function response(body,status=200){ return {ok:status>=200&&status<300,status,json:async()=>body}; }
function fetchMock(url){
  const s=String(url);
  if(s.includes('geocoding.geo.census.gov')) return response({result:{addressMatches:[{
    matchedAddress:'333 STRANDER BLVD, TUKWILA, WA, 98188',
    coordinates:{x:-122.25,y:47.46},
    addressComponents:{state:'WA',zip:'98188',city:'TUKWILA'}
  }]}});
  if(s.includes('alt-fuel-stations')) return response({fuel_stations:[{
    id:1,station_name:'Station A',ev_network:'Network A',latitude:47.47,longitude:-122.24,
    distance:1.1,ev_dc_fast_num:4,ev_connector_types:['CCS'],street_address:'1 Main',city:'Tukwila',state:'WA',zip:'98188'
  }]});
  if(s.includes('TrafficData')) return response({features:[{attributes:{StationID:'s1',Route:'I-5',AADT:123456,Year:2025},geometry:{x:-122.245,y:47.465}}]});
  if(s.includes('gis.ecology.wa.gov')) return response({features:[{attributes:{UTILITY:'Seattle City Light'}}]});
  throw new Error('unexpected URL '+s);
}

test('owned site source produces complete explicit coverage manifest',async()=>{
  const out=await lookupAliEVSite('333 Strander Blvd, Tukwila, WA 98188',{mode:'rivet_report_snapshot',fetchImpl:fetchMock,now:()=> '2026-09-30T20:30:00Z'});
  assert.equal(out.response_profile,'rivet_report_snapshot_v1');
  assert.equal(out.base44_runtime_used,false);
  assert.equal(out.chargers.length,1);
  assert.equal(out.traffic.length,1);
  assert.equal(out.washington_utility_service_area_candidates.length,1);
  assert.equal(Object.keys(out.source_coverage_manifest.domains).length,14);
  assert.equal(out.source_coverage_manifest.domains.observed_sessions.state,'NOT_OBSERVABLE');
  assert.equal(out.coverage_contract.sessions_utilization.value,null);
});

test('public screen never converts source failure into zero',async()=>{
  const failing=async(url)=>{
    if(String(url).includes('geocoding.geo.census.gov')) return fetchMock(url);
    if(String(url).includes('nominatim')) return fetchMock(url);
    return response({error:'unavailable'},503);
  };
  const out=await lookupAliEVSite('333 Strander Blvd, Tukwila, WA 98188',{fetchImpl:failing});
  assert.equal(out.charger_source_status,'unavailable');
  assert.equal(out.coverage_contract.charging_inventory.state,'NOT_OBSERVABLE');
  assert.equal(out.coverage_contract.charging_inventory.value,null);
  assert.equal(out.source_coverage_manifest.domains.charging_inventory.state,'NOT_OBSERVABLE');
});
