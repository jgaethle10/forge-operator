import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startAliEvSourceRuntime } from './source-runtime.mjs';
import { startRivetReportRuntime } from '../rivet/report-runtime.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'aliev-domain-engine-proof-'));
let geocodeCalls=0;
const geocode=async(address)=>{
  geocodeCalls++;
  return {
    matched_address:'123 New Site Ave, SeaTac, WA 98188',
    latitude:47.424,longitude:-122.296,state:'WA',postal_code:'98188',city:'SeaTac',
    source_name:'Proof Geocoder',source_url:'https://example.test/geocoder',evidence_state:'OFFICIAL_GEOCODE'
  };
};

const aliev=await startAliEvSourceRuntime({
  stateDir:path.join(root,'aliev'),
  systemiaMachineKey:'domain-proof-machine',
  ingestToken:'domain-proof-ingest',
  geocode,
});

async function ingest(domain,records){
  const response=await fetch(aliev.domain_ingest_url,{
    method:'POST',
    headers:{'content-type':'application/json',authorization:'Bearer domain-proof-ingest'},
    body:JSON.stringify({domain,records})
  });
  assert.equal(response.status,201,domain);
  return await response.json();
}

try{
  await ingest('charging_inventory',[
    {record_key:'charger-a',station_name:'Owned Fast Site',latitude:47.425,longitude:-122.297,state:'WA',postal_code:'98188',ports:8,power_kw:250,source_name:'Owned Charger Feed',source_url:'https://example.test/chargers',retrieved_at:'2026-09-30T18:00:00Z'}
  ]);
  await ingest('traffic',[
    {record_key:'traffic-a',latitude:47.423,longitude:-122.294,state:'WA',aadt:47000,source_name:'Owned Traffic Feed',source_url:'https://example.test/traffic',retrieved_at:'2026-09-30T18:00:00Z'}
  ]);
  await ingest('traffic_temporal',[
    {record_key:'traffic-profile-a',latitude:47.423,longitude:-122.294,state:'WA',profile_type:'peak_hour_volume',bucket_count:200,source_name:'Owned Traffic Feed',source_url:'https://example.test/traffic-profile',retrieved_at:'2026-09-30T18:00:00Z'}
  ]);
  await ingest('observed_sessions',[
    {record_key:'sessions-a',latitude:47.425,longitude:-122.297,state:'WA',charging_sessions_count:120,period_start:'2026-08-01',period_granularity:'month',evidence_state:'observed',source_name:'Permissioned Sessions',source_url:'https://example.test/sessions',retrieved_at:'2026-09-30T18:00:00Z'}
  ]);
  await ingest('utility_service_area',[
    {record_key:'utility-area-a',state:'WA',postal_code:'98188',utility_name:'Owned Utility Candidate',source_name:'Owned Utility Feed',source_url:'https://example.test/utility-area',retrieved_at:'2026-09-30T18:00:00Z'}
  ]);
  await ingest('utility_tariff',[
    {record_key:'tariff-a',state:'WA',postal_code:'98188',utility_name:'Owned Utility Candidate',rate_name:'EV-1',energy_rate_per_kwh:0.11,demand_charge_per_kw:6.1,source_name:'Owned Tariff Feed',source_url:'https://example.test/tariff',retrieved_at:'2026-09-30T18:00:00Z'}
  ]);
  await ingest('incentives',[
    {record_key:'incentive-a',state:'WA',name:'Owned Charging Incentive',source_name:'Owned Incentive Feed',source_url:'https://example.test/incentive',retrieved_at:'2026-09-30T18:00:00Z'}
  ]);
  await ingest('parcel_planning',[
    {record_key:'parcel-a',latitude:47.4241,longitude:-122.2961,state:'WA',postal_code:'98188',parking_spaces:80,source_name:'Owned Parcel Feed',source_url:'https://example.test/parcel',retrieved_at:'2026-09-30T18:00:00Z'}
  ]);
  await ingest('local_ev_stock',[
    {record_key:'ev-stock-wa',state:'WA',bev_count:236400,phev_count:57100,source_name:'Owned EV Stock',source_url:'https://example.test/ev-stock',retrieved_at:'2026-09-30T18:00:00Z'}
  ]);
  await ingest('freight',[
    {record_key:'freight-a',latitude:47.43,longitude:-122.29,state:'WA',class:'T-1',source_name:'Owned Freight Feed',source_url:'https://example.test/freight',retrieved_at:'2026-09-30T18:00:00Z'}
  ]);
  await ingest('dwell_context',[
    {record_key:'dwell-a',latitude:47.448,longitude:-122.308,state:'WA',name:'SEA Airport',source_name:'Owned Dwell Feed',source_url:'https://example.test/dwell',retrieved_at:'2026-09-30T18:00:00Z'}
  ]);
  await ingest('deep_market_evidence',[
    {record_key:'market-a',state:'WA',name:'Owned Market Evidence',source_name:'Owned Market Feed',source_url:'https://example.test/market',retrieved_at:'2026-09-30T18:00:00Z'}
  ]);

  const source=await fetch(aliev.source_url,{
    method:'POST',
    headers:{'content-type':'application/json','x-systemia-machine-key':'domain-proof-machine'},
    body:JSON.stringify({mode:'rivet_report_snapshot',address:'123 New Site Ave, SeaTac, WA 98188'})
  });
  assert.equal(source.status,200);
  const snapshot=await source.json();
  assert.equal(snapshot.response_profile,'rivet_report_snapshot_v1');
  assert.equal(snapshot.owned_domain_engine.precomputed_snapshot_required,false);
  assert.equal(snapshot.traffic[0].aadt,47000);
  assert.equal(snapshot.chargers[0].ports,8);
  assert.equal(snapshot.nearby_observed_usage[0].charging_sessions_count,120);
  assert.equal(snapshot.utility_rate_candidates[0].rate_name,'EV-1');
  assert.equal(snapshot.utility_service_area_candidates[0].utility_name,'Owned Utility Candidate');
  assert.equal(snapshot.parcel_planning[0].parking_spaces,80);
  assert.equal(snapshot.source_coverage_manifest.domains.observed_sessions.state,'OBSERVED_VERIFIED');
  assert.equal(snapshot.source_coverage_manifest.domains.parcel_planning.state,'CONNECTED');
  assert.equal(geocodeCalls,1);

  const cached=await fetch(aliev.source_url,{
    method:'POST',
    headers:{'content-type':'application/json','x-systemia-machine-key':'domain-proof-machine'},
    body:JSON.stringify({mode:'rivet_report_snapshot',address:'123 New Site Ave, SeaTac, WA 98188'})
  });
  assert.equal(cached.status,200);
  assert.equal(geocodeCalls,1,'second lookup must use verified snapshot cache rather than re-geocode');

  const rivet=await startRivetReportRuntime({
    stateDir:path.join(root,'rivet'),
    sourceUrl:aliev.source_url,
    systemiaMachineKey:'domain-proof-machine',
    teamToken:'domain-proof-team'
  });
  try{
    const generated=await fetch(rivet.service_url+'/v1/reports',{
      method:'POST',
      headers:{'content-type':'application/json',authorization:'Bearer domain-proof-team'},
      body:JSON.stringify({address:'123 New Site Ave, SeaTac, WA 98188',report_type:'full_site_opportunity'})
    });
    assert.equal(generated.status,201);
    const report=await generated.json();
    assert.equal(report.generation_state,'ready');
    assert.equal(report.report.body.report_type,'full_site_opportunity');
    assert.equal(report.report.body.metrics.max_aadt,47000);
    assert.equal(report.report.body.evidence.observed_usage[0].charging_sessions_count,120);
    assert.equal(report.report.body.evidence.domains.utility.service_area_candidates[0].utility_name,'Owned Utility Candidate');
    assert.equal(report.report.body.evidence.domains.property_planning.parcel_planning[0].parking_spaces,80);
    assert.equal(report.verification.full_source_snapshot_persisted,true);
  }finally{
    await rivet.close();
  }

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.aliev.dynamic-domain-engine-proof.v1',
    unseen_address_generated_without_precomputed_snapshot:true,
    owned_domain_ingest:true,
    source_coverage_explicit:true,
    observed_sessions_preserved:true,
    utility_and_parcel_evidence_preserved:true,
    verified_snapshot_cache_after_first_build:true,
    full_rivet_report_ready:true,
    base44_request_path_required:false
  },null,2));
}finally{
  await aliev.close();
  fs.rmSync(root,{recursive:true,force:true});
}
