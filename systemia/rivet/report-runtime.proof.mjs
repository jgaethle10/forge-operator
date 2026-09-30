import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateYardReport, startRivetReportRuntime } from './report-runtime.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'rivet-yard-report-'));
const sourceSnapshot={
  response_profile:'rivet_report_snapshot_v1',
  evidence_state:'SOURCE_BACKED',
  matched_address:'6405 W Chestnut Ave, Yakima, WA 98908',
  latitude:46.596551,
  longitude:-120.594201,
  state:'WA',
  postal_code:'98908',
  retrieved_at:'2026-09-25T20:00:00.000Z',
  coverage_contract:{utility_tariff:{state:'SCREENING_EVIDENCE_PRESENT'}},
  source_coverage_manifest:{
  schema:'evercraft.rivet.source-coverage.v1',
  generated_at:'2026-09-25T20:00:00.000Z',
  domains:Object.fromEntries([
    'geocoding','charging_inventory','traffic','traffic_temporal','utility_service_area','utility_tariff','incentives',
    'parcel_planning','local_ev_stock','observed_sessions','freight','dwell_context','deep_market_evidence','provenance'
  ].map(key=>[key,{state:'CONNECTED',record_count:1,source_status:'proof'}])),
  semantics:'Every report-relevant source domain is explicit. Missing is never zero.'
},
  traffic:[{aadt:22100,source:'proof'}],
  chargers:[{name:'Proof charger'}],
  incentives:[{name:'Proof program'}],
  nearby_observed_usage:[{evidence_state:'observed'}]
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
assert.equal(record.verification.full_source_snapshot_persisted,true);
assert.equal(record.verification.full_source_snapshot_reopened_and_verified,true);
assert.equal(record.verification.source_coverage_manifest_verified,true);
assert.ok(record.source_snapshot.store_ref.startsWith('source-snapshots/'));
assert.equal(record.source_snapshot.coverage_manifest.schema,'evercraft.rivet.source-coverage.v1');
assert.equal(Object.keys(record.source_snapshot.coverage_manifest.domains).length,14);
assert.equal(record.report.body.source.snapshot_sha256,record.source_snapshot.sha256);
assert.equal(record.report.body.source.snapshot_ref,record.source_snapshot.store_ref);
assert.deepEqual(progress.map(x=>x.stage),['address_admitted','site_intelligence','source_verified','football_packing','football_transfer','evidence_integrity','report_render','ready']);
assert.deepEqual(progress.map(x=>x.percent),[13,25,38,50,63,75,88,100]);
assert.equal(progress.find(x=>x.stage==='source_verified').detail.charger_records,1);
assert.equal(progress.find(x=>x.stage==='football_transfer').transfer.percent,100);
assert.ok(progress.find(x=>x.stage==='football_transfer').transfer.bytes_total>0);

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
  assert.equal(health.full_source_snapshot_persistence,true);
  assert.equal(health.source_coverage_manifest_required,true);

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

  const source=await fetch(runtime.service_url+'/v1/reports/'+encodeURIComponent(made.report_id)+'/source',{
    headers:{'authorization':'Bearer proof-team-token'}
  });
  assert.equal(source.status,200);
  const sourceBody=await source.json();
  assert.equal(sourceBody.sha256,made.source_snapshot.sha256);
  assert.equal(sourceBody.byte_count,made.source_snapshot.byte_count);
  assert.equal(sourceBody.source_snapshot.response_profile,'rivet_report_snapshot_v1');
  assert.equal(sourceBody.source_snapshot.source_coverage_manifest.schema,'evercraft.rivet.source-coverage.v1');

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.rivet.yard-report-proof.v1',
    address_to_ready_report:true,
    beast_football_source_snapshot:true,
    team_auth_fail_closed:true,
    exact_source_hash_verified:true,
    full_source_snapshot_persisted:true,
    source_retrieval_verified:true,
    explicit_source_coverage_verified:true,
    report_id:made.report_id
  },null,2));
}finally{
  await runtime.close();
  fs.rmSync(root,{recursive:true,force:true});
}
