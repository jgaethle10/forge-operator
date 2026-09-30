import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateYardReport } from '../systemia/rivet/report-runtime.mjs';

const REQUIRED=[
  'geocoding','charging_inventory','traffic','traffic_temporal','utility_service_area','utility_tariff','incentives',
  'parcel_planning','local_ev_stock','observed_sessions','freight','dwell_context','deep_market_evidence','provenance'
];

const root=fs.mkdtempSync(path.join(os.tmpdir(),'rivet-large-source-'));
const manifest={
  schema:'evercraft.rivet.source-coverage.v1',
  generated_at:'2026-09-30T18:00:00.000Z',
  domains:Object.fromEntries(REQUIRED.map(key=>[key,{state:'CONNECTED',record_count:1,source_status:'regression'}])),
  semantics:'Every report-relevant source domain is explicit. Missing is never zero.'
};
const largeEvidence=Array.from({length:600},(_,i)=>({
  id:'deep-'+i,
  source_url:'https://example.invalid/source/'+i,
  note:'Evidence payload regression row '+i+' '+('x'.repeat(220)),
  evidence_state:'observed'
}));
const snapshot={
  response_profile:'rivet_report_snapshot_v1',
  evidence_state:'SOURCE_BACKED',
  access_policy:{commercial_access:true},
  matched_address:'19820 International Boulevard, SeaTac, WA 98188',
  latitude:47.4239385,
  longitude:-122.2955482,
  state:'WA',
  postal_code:'98188',
  retrieved_at:'2026-09-30T18:00:00.000Z',
  source_coverage_manifest:manifest,
  coverage_contract:Object.fromEntries(REQUIRED.map(key=>[key,{state:'CONNECTED'}])),
  traffic:[{aadt:42000,source:'regression'}],
  traffic_profiles:[{profile_type:'hourly',source:'regression'}],
  chargers:[{name:'Regression fast charger',dc_fast_ports:8}],
  incentives:[{name:'Regression incentive'}],
  nearby_observed_usage:[{charging_sessions_count:250,period_start:'2026-08-01',period_granularity:'month',evidence_state:'observed'}],
  washington_utility_service_area_candidates:[{name:'Regression utility'}],
  utility_rate_candidates:[{name:'Regression rate'}],
  local_ev_stock:{count:1000},
  freight_context:{state:'CONNECTED'},
  dwell_anchors:[{name:'Airport'}],
  deep_external_evidence:largeEvidence,
  source_record_ids:largeEvidence.map(x=>x.id)
};

try{
  const record=await generateYardReport({
    address:'19820 International Boulevard, SeaTac, WA 98188',
    sourceUrl:'https://source.invalid/energySiteLookup',
    systemiaMachineKey:'proof',
    sourceFetch:async()=>new Response(JSON.stringify(snapshot),{status:200,headers:{'content-type':'application/json'}}),
    stateDir:root,
    now:()=> '2026-09-30T18:01:00.000Z'
  });

  assert.equal(record.generation_state,'ready');
  assert.equal(record.verification.full_source_snapshot_persisted,true);
  assert.equal(record.verification.full_source_snapshot_reopened_and_verified,true);
  assert.equal(record.verification.source_coverage_manifest_verified,true);
  assert.ok(record.source_snapshot.byte_count>100000,'source snapshot should exceed legacy inline-field scale');
  assert.equal(record.source_snapshot.evidence_index.deep_market_evidence,largeEvidence.length);
  assert.ok(record.source_snapshot.store_ref.startsWith('source-snapshots/'));

  const storedPath=path.join(root,record.source_snapshot.store_ref);
  assert.equal(fs.existsSync(storedPath),true);
  const stored=JSON.parse(fs.readFileSync(storedPath,'utf8'));
  assert.equal(stored.deep_external_evidence.length,largeEvidence.length);
  assert.equal(Object.keys(stored.source_coverage_manifest.domains).length,14);
  assert.equal(record.report.body.source.snapshot_sha256,record.source_snapshot.sha256);
  assert.equal(record.report.body.source.snapshot_ref,record.source_snapshot.store_ref);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.rivet.large-source-regression.v1',
    address:record.report.body.address,
    source_bytes:record.source_snapshot.byte_count,
    deep_evidence_rows:stored.deep_external_evidence.length,
    generation_state:record.generation_state,
    legacy_inline_field_dependency:false,
    full_source_snapshot_verified:true
  },null,2));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
