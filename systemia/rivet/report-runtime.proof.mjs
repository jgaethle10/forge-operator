import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateYardReport, startRivetReportRuntime } from './report-runtime.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'rivet-yard-report-'));
const coverageDomains=['geocoding','charging_inventory','traffic','traffic_temporal','utility_service_area','utility_tariff','incentives','parcel_planning','local_ev_stock','observed_sessions','freight','dwell_context','deep_market_evidence','provenance'];
const sourceCoverage={
  schema:'evercraft.rivet.source-coverage.v1',
  generated_at:'2026-09-25T20:00:00.000Z',
  domains:Object.fromEntries(coverageDomains.map(key=>[key,{state:'CONNECTED',record_count:1,source_status:'proof'}])),
  semantics:'Missing is never zero.'
};
const sourceSnapshot={
  response_profile:'rivet_report_snapshot_v1',
  evidence_state:'SOURCE_BACKED',
  matched_address:'6405 W Chestnut Ave, Yakima, WA 98908',
  latitude:46.596551,
  longitude:-120.594201,
  state:'WA',
  postal_code:'98908',
  retrieved_at:'2026-09-25T20:00:00.000Z',
  source_coverage_manifest:sourceCoverage,
  coverage_contract:{utility_tariff:{state:'SCREENING_EVIDENCE_PRESENT'},sessions_utilization:{state:'OBSERVED_VERIFIED'}},
  source_record_ids:['proof-source-1'],
  traffic:[{aadt:22100,source:'proof'}],
  traffic_profiles:[{period:'weekday_pm',aadt:22100}],
  traffic_source_status:'ok',
  traffic_source_name:'Proof DOT',
  traffic_source_url:'https://example.invalid/traffic',
  traffic_available_dimensions:['aadt','temporal_profile'],
  traffic_semantics:'AADT is not live traffic.',
  freight_context:{state:'CONNECTED',corridor:'proof-freight'},
  chargers:[{name:'Proof charger',kw:150}],
  charger_source_status:'ok',
  charger_source_name:'Proof charging inventory',
  charger_source_license:'proof',
  zip_charging_price_benchmark:{median_usd_per_kwh:0.42},
  nearby_observed_usage:[{evidence_state:'observed',sessions:12}],
  utility_rate_candidates:[{utility:'Proof Utility',rate:'EV-1'}],
  utility_rate_candidate_utilities:['Proof Utility'],
  utility_rate_source_status:'ok',
  utility_rate_semantics:'Candidate tariff only.',
  washington_utility_service_area_candidates:[{utility:'Proof Utility'}],
  washington_utility_service_area_status:'ok',
  washington_pacific_power_ev_tariff_context:{rate:'DCFC proof'},
  washington_pacific_power_ev_tariff_status:'ok',
  washington_pacific_power_program_watch:{program:'proof-watch'},
  washington_pacific_power_current_rate_catalog:{rate:'proof-current'},
  california_utility_service_area_candidates:[{utility:'Proof CA Utility'}],
  california_utility_service_area_status:'ok',
  california_other_lse_overlap_context:[{utility:'Proof LSE'}],
  california_candidate_tariff_catalog:[{rate:'Proof CA EV'}],
  california_candidate_tariff_status:'ok',
  california_utility_confirmation_paths:[{url:'https://example.invalid/utility-confirm'}],
  incentives:[{name:'Proof program'}],
  incentive_evidence:{state:'CONNECTED'},
  incentive_source_status:'ok',
  new_york_ev_programs:[{name:'Proof NY program'}],
  new_york_program_source_status:'ok',
  california_near_home_charging_gap:{gap_pct:55},
  california_near_home_gap_source_status:'ok',
  california_parcel_planning:{parcel_id:'proof-parcel'},
  california_parcel_planning_status:'ok',
  california_property_adapter_trace:{adapter:'proof'},
  california_county_charging_market:{county:'proof'},
  california_county_charging_market_status:'ok',
  site_diligence:{state:'screened'},
  local_ev_stock:{active_ev_phev:1234},
  local_ev_stock_status:'ok',
  dwell_anchors:[{name:'Proof dwell anchor'}],
  dwell_source_status:'ok',
  sales_angles:['Proof sales angle'],
  deep_benchmark_records:[{name:'Proof benchmark'}],
  deep_market_evidence:[{name:'Proof market evidence'}],
  deep_utility_program_evidence:[{name:'Proof utility evidence'}],
  deep_external_evidence:[{name:'Proof external evidence'}],
  deep_evidence_semantics:'Source-scoped proof evidence.'
};
const sourceFetch=async(_url,options)=>{
  assert.equal(options.headers['x-systemia-machine-key'],'proof-machine-key');
  const body=JSON.parse(options.body);
  assert.equal(body.mode,'rivet_report_snapshot');
  assert.ok(body.address.includes('Chestnut'));
  return new Response(JSON.stringify(sourceSnapshot),{status:200,headers:{'content-type':'application/json'}});
};

const progress=[];
const record=await generateYardReport({
  address:'6405 W Chestnut Ave Yakima WA',
  sourceUrl:'https://source.invalid/energySiteLookup',
  systemiaMachineKey:'proof-machine-key',
  sourceFetch,
  stateDir:root,
  now:()=> '2026-09-25T20:01:00.000Z',
  onProgress:event=>progress.push(event)
});
assert.equal(record.generation_state,'ready');
assert.equal(record.verification.football_opened,true);
assert.equal(record.verification.source_sha256_match,true);
assert.equal(record.report.body.generation_state,'ready');
assert.equal(record.report.body.metrics.max_aadt,22100);
assert.equal(record.verification.source_coverage_verified,true);
assert.equal(record.verification.required_source_domains_verified,coverageDomains.length);
assert.equal(record.source_snapshot.coverage_schema,'evercraft.rivet.source-coverage.v1');
assert.equal(record.source_snapshot.body.source_coverage_manifest.domains.observed_sessions.state,'CONNECTED');
assert.equal(record.source_snapshot.body.deep_market_evidence[0].name,'Proof market evidence');
assert.equal(record.report.body.source.coverage_schema,'evercraft.rivet.source-coverage.v1');
assert.equal(record.report.body.source.source_snapshot_preserved,true);
assert.equal(record.report.body.evidence.traffic.profiles[0].period,'weekday_pm');
assert.equal(record.report.body.evidence.charging.observed_usage[0].sessions,12);
assert.equal(record.report.body.evidence.utility.rate_candidates[0].rate,'EV-1');
assert.equal(record.report.body.evidence.incentives.new_york_programs[0].name,'Proof NY program');
assert.equal(record.report.body.evidence.property_planning.california_parcel_planning.parcel_id,'proof-parcel');
assert.equal(record.report.body.evidence.market.local_ev_stock.active_ev_phev,1234);
assert.equal(record.report.body.evidence.market.deep_market_evidence[0].name,'Proof market evidence');
assert.equal(record.report.body.evidence.provenance.source_record_ids[0],'proof-source-1');
assert.deepEqual(progress.map(x=>x.stage),['address_admitted','site_intelligence','source_verified','football_packing','football_transfer','evidence_integrity','report_render','ready']);
assert.deepEqual(progress.map(x=>x.percent),[13,25,38,50,63,75,88,100]);
assert.equal(progress.find(x=>x.stage==='source_verified').detail.charger_records,1);
assert.equal(progress.find(x=>x.stage==='football_transfer').transfer.percent,100);
assert.ok(progress.find(x=>x.stage==='football_transfer').transfer.bytes_total>0);
assert.equal(progress.find(x=>x.stage==='source_verified').detail.coverage_domains_verified,coverageDomains.length);

const incompleteSnapshot=structuredClone(sourceSnapshot);
delete incompleteSnapshot.source_coverage_manifest.domains.observed_sessions;
await assert.rejects(
  generateYardReport({
    address:'6405 W Chestnut Ave Yakima WA',
    sourceUrl:'https://source.invalid/energySiteLookup',
    systemiaMachineKey:'proof-machine-key',
    sourceFetch:async()=>new Response(JSON.stringify(incompleteSnapshot),{status:200,headers:{'content-type':'application/json'}}),
    stateDir:path.join(root,'negative')
  }),
  /source_coverage_incomplete:observed_sessions/
);

const runtime=await startRivetReportRuntime({
  stateDir:path.join(root,'runtime'),
  sourceUrl:'https://source.invalid/energySiteLookup',
  systemiaMachineKey:'proof-machine-key',
  teamToken:'proof-team-token',
  sourceFetch
});
try{
  const health=await fetch(runtime.service_url+'/health').then(r=>r.json());
  assert.equal(health.ok,true);
  assert.equal(health.source_coverage_schema,'evercraft.rivet.source-coverage.v1');
  assert.equal(health.required_source_domains,coverageDomains.length);

  const denied=await fetch(runtime.service_url+'/v1/reports',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({address:'6405 W Chestnut Ave Yakima WA'})
  });
  assert.equal(denied.status,401);

  const created=await fetch(runtime.service_url+'/v1/reports',{
    method:'POST',
    headers:{'content-type':'application/json','authorization':'Bearer proof-team-token'},
    body:JSON.stringify({address:'6405 W Chestnut Ave Yakima WA'})
  });
  assert.equal(created.status,201);
  const made=await created.json();
  assert.equal(made.generation_state,'ready');
  assert.equal(made.verification.football_opened,true);
  assert.equal(made.progress.stage,'ready');
  assert.equal(made.progress.percent,100);
  assert.ok(made.job_id);

  const jobProgress=await fetch(runtime.service_url+'/v1/report-jobs/'+encodeURIComponent(made.job_id)+'/progress',{
    headers:{'authorization':'Bearer proof-team-token'}
  });
  assert.equal(jobProgress.status,200);
  const jobState=await jobProgress.json();
  assert.equal(jobState.current.stage,'ready');
  assert.equal(jobState.current.percent,100);
  assert.equal(jobState.events.length,8);
  assert.ok(jobState.events.find(x=>x.stage==='football_transfer').transfer.bytes_total>0);

  const fetched=await fetch(runtime.service_url+'/v1/reports/'+encodeURIComponent(made.report_id),{
    headers:{'authorization':'Bearer proof-team-token'}
  });
  assert.equal(fetched.status,200);
  const stored=await fetched.json();
  assert.equal(stored.report.sha256,made.report.sha256);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.rivet.yard-report-proof.v1',
    address_to_ready_report:true,
    beast_football_source_snapshot:true,
    team_auth_fail_closed:true,
    exact_source_hash_verified:true,
    complete_source_coverage_gate:true,
    full_source_snapshot_preserved:true,
    report_domain_projection_verified:true,
    report_id:made.report_id
  },null,2));
}finally{
  await runtime.close();
  fs.rmSync(root,{recursive:true,force:true});
}
