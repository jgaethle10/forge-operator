import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildYardReport, generateYardReport } from './report-runtime.mjs';

const coverageDomains=[
  'geocoding','charging_inventory','traffic','traffic_temporal','utility_service_area','utility_tariff',
  'incentives','parcel_planning','local_ev_stock','observed_sessions','freight','dwell_context',
  'deep_market_evidence','provenance'
];
const coverage={
  schema:'evercraft.rivet.source-coverage.v1',
  generated_at:'2026-09-30T19:10:00.000Z',
  domains:Object.fromEntries(coverageDomains.map(key=>[key,{state:'CONNECTED',record_count:1,source_status:'proof'}])),
  semantics:'Missing is never zero.'
};
const source={
  response_profile:'rivet_report_snapshot_v1',
  evidence_state:'SOURCE_BACKED',
  access_policy:{commercial_access:true},
  matched_address:'333 Strander Blvd, Tukwila, WA 98188',
  latitude:47.456,
  longitude:-122.252,
  state:'WA',
  postal_code:'98188',
  retrieved_at:'2026-09-30T19:10:00.000Z',
  source_coverage_manifest:coverage,
  source_record_ids:['proof-source-1'],
  coverage_contract:{
    utility_tariff:{state:'SCREENING_EVIDENCE_PRESENT'},
    utility_service_area:{state:'SCREENING_EVIDENCE_PRESENT'},
    sessions_utilization:{state:'OBSERVED_VERIFIED'}
  },
  traffic:[{aadt:31000,source:'Proof DOT',source_url:'https://example.invalid/traffic'}],
  traffic_profiles:[{period:'weekday_pm',aadt:31000}],
  traffic_source_status:'ok',
  traffic_source_name:'Proof DOT',
  traffic_source_url:'https://example.invalid/traffic',
  traffic_available_dimensions:['aadt','temporal_profile'],
  traffic_semantics:'Proof temporal traffic.',
  freight_context:{state:'CONNECTED'},
  chargers:[{name:'Proof charger',kw:150}],
  charger_source_status:'ok',
  charger_source_name:'Proof charging source',
  charger_source_license:'Proof public license',
  zip_charging_price_benchmark:{median_price_per_kwh:0.42},
  nearby_observed_usage:[{evidence_state:'observed',sessions:12,energy_kwh:245}],
  utility_rate_candidates:[{utility:'Proof Utility',rate:'EV-1'}],
  utility_rate_candidate_utilities:['Proof Utility'],
  utility_rate_source_status:'ok',
  utility_rate_semantics:'Screening tariff evidence.',
  washington_utility_service_area_candidates:[{utility:'Proof Utility'}],
  washington_utility_service_area_status:'ok',
  washington_pacific_power_ev_tariff_context:{state:'SCREENING'},
  washington_pacific_power_ev_tariff_status:'ok',
  washington_pacific_power_program_watch:{state:'MONITORED'},
  washington_pacific_power_current_rate_catalog:{rate:'EV-1'},
  incentives:[{name:'Proof incentive'}],
  incentive_evidence:{state:'CONNECTED'},
  incentive_source_status:'ok',
  new_york_ev_programs:[{name:'Proof NY program'}],
  new_york_program_source_status:'ok',
  california_near_home_charging_gap:{gap_pct:55},
  california_near_home_gap_source_status:'ok',
  california_parcel_planning:{parcel_id:'proof-parcel'},
  california_parcel_planning_status:'ok',
  california_property_adapter_trace:{adapter:'proof'},
  california_county_charging_market:{stations:42},
  california_county_charging_market_status:'ok',
  site_diligence:{parking_fit:'screened'},
  local_ev_stock:{active_ev_phev:4321},
  local_ev_stock_status:'ok',
  dwell_anchors:[{name:'Proof dwell'}],
  dwell_source_status:'ok',
  sales_angles:['Proof commercial angle'],
  deep_benchmark_records:[{name:'Proof benchmark'}],
  deep_market_evidence:[{name:'Proof market evidence'}],
  deep_utility_program_evidence:[{name:'Proof utility evidence'}],
  deep_external_evidence:[{name:'Proof external evidence'}],
  deep_evidence_semantics:'Bounded proof evidence.'
};

const built=buildYardReport({
  address:'333 Strander Blvd, Tukwila, WA 98188',
  sourceSnapshot:source,
  retrievedAt:source.retrieved_at,
  sourceSnapshotSha256:'a'.repeat(64),
  sourceSnapshotRef:'source-snapshots/proof.json'
});

assert.equal(built.source.coverage_schema,'evercraft.rivet.source-coverage.v1');
assert.equal(built.source.required_source_domains,coverageDomains.length);
assert.equal(built.source.source_snapshot_preserved,true);
assert.equal(built.evidence.traffic[0].aadt,31000);
assert.equal(built.evidence.chargers[0].name,'Proof charger');
assert.equal(built.evidence.observed_usage[0].sessions,12);
assert.equal(built.evidence.domains.traffic.profiles[0].period,'weekday_pm');
assert.equal(built.evidence.domains.charging.price_benchmark.median_price_per_kwh,0.42);
assert.equal(built.evidence.domains.utility.rate_candidates[0].rate,'EV-1');
assert.equal(built.evidence.domains.incentives.new_york_programs[0].name,'Proof NY program');
assert.equal(built.evidence.domains.property_planning.california_parcel_planning.parcel_id,'proof-parcel');
assert.equal(built.evidence.domains.market.local_ev_stock.active_ev_phev,4321);
assert.equal(built.evidence.domains.market.deep_market_evidence[0].name,'Proof market evidence');
assert.equal(built.evidence.domains.provenance.source_record_ids[0],'proof-source-1');

const root=fs.mkdtempSync(path.join(os.tmpdir(),'rivet-domain-proof-'));
try{
  const progress=[];
  const record=await generateYardReport({
    address:'333 Strander Blvd, Tukwila, WA 98188',
    sourceUrl:'https://source.invalid/report',
    systemiaMachineKey:'proof-machine-key',
    stateDir:root,
    sourceFetch:async()=>new Response(JSON.stringify(source),{status:200,headers:{'content-type':'application/json'}}),
    onProgress:event=>progress.push(event),
    now:()=>source.retrieved_at
  });
  assert.equal(record.generation_state,'ready');
  assert.equal(record.verification.full_source_snapshot_persisted,true);
  assert.equal(record.verification.full_source_snapshot_reopened_and_verified,true);
  assert.equal(record.verification.source_coverage_verified,true);
  assert.equal(record.verification.required_source_domains_explicit,coverageDomains.length);
  assert.equal(record.verification.report_domain_projection_verified,true);
  assert.equal(record.source_snapshot.coverage_schema,'evercraft.rivet.source-coverage.v1');
  assert.equal(record.source_snapshot.coverage_domains_verified,coverageDomains.length);
  assert.equal(record.report.body.evidence.domains.utility.rate_candidates[0].rate,'EV-1');
  assert.equal(record.report.body.evidence.domains.market.deep_market_evidence[0].name,'Proof market evidence');
  const verified=progress.find(x=>x.stage==='source_verified');
  assert.equal(verified.detail.coverage_domains_verified,coverageDomains.length);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.rivet.report-domain-projection-proof.v1',
    strict_14_domain_contract:true,
    legacy_compatibility_fields_preserved:true,
    rich_report_domains_preserved:true,
    atomic_full_snapshot_persisted:true,
    snapshot_reopened_and_verified:true,
    report_domain_projection_verified:true
  },null,2));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
