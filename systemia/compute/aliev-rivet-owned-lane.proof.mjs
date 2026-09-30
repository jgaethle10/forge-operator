import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startEvercraftComputeNode } from './runtime-node.mjs';
import { YardOperator } from '../yard/operator.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'aliev-rivet-owned-lane-'));
const computeRoot=path.join(root,'compute');
const yardState=path.join(root,'yard');
const allocatorToken='owned-lane-allocator';
const machineKey='owned-lane-machine';
const ingestToken='owned-lane-ingest';
const teamToken='owned-lane-team';
const coverageKeys=[
  'geocoding','charging_inventory','traffic','traffic_temporal','utility_service_area','utility_tariff','incentives',
  'parcel_planning','local_ev_stock','observed_sessions','freight','dwell_context','deep_market_evidence','provenance'
];
const snapshot={
  response_profile:'rivet_report_snapshot_v1',
  evidence_state:'SOURCE_BACKED',
  access_policy:{commercial_access:true},
  matched_address:'19820 International Boulevard, SeaTac, WA 98188',
  address_aliases:['19820 International Blvd, SeaTac, WA 98188'],
  latitude:47.4239385,
  longitude:-122.2955482,
  state:'WA',
  postal_code:'98188',
  retrieved_at:'2026-09-30T20:30:00.000Z',
  source_coverage_manifest:{
    schema:'evercraft.rivet.source-coverage.v1',
    generated_at:'2026-09-30T20:30:00.000Z',
    domains:Object.fromEntries(coverageKeys.map(key=>[key,{state:'CONNECTED',record_count:1,source_status:'owned-lane-proof'}])),
    semantics:'Missing is never zero.'
  },
  source_record_ids:['owned-source-001'],
  coverage_contract:{utility_tariff:{state:'SCREENING_EVIDENCE_PRESENT'},sessions_utilization:{state:'OBSERVED_VERIFIED'}},
  traffic:[{aadt:52000,source:'owned-source'}],
  traffic_profiles:[{profile_type:'peak_hour_volume',daily_total:52000}],
  chargers:[{name:'Owned AliEV charger',ports:12,power_kw:250}],
  incentives:[{name:'Owned AliEV incentive'}],
  nearby_observed_usage:[{evidence_state:'observed',charging_sessions_count:144}],
  utility_rate_candidates:[{utility_name:'Owned utility',rate_name:'EV proof'}],
  local_ev_stock:{bev_count:236400},
  freight_context:{state:'CONNECTED'},
  dwell_anchors:[{name:'SEA Airport'}],
  deep_market_evidence:[{name:'Owned market evidence'}],
};

const old={
  machine:process.env.SYSTEMIA_MACHINE_KEY,
  ingest:process.env.ALIEV_OWNED_INGEST_TOKEN,
  team:process.env.RIVET_YARD_TEAM_TOKEN,
};
process.env.SYSTEMIA_MACHINE_KEY=machineKey;
process.env.ALIEV_OWNED_INGEST_TOKEN=ingestToken;
process.env.RIVET_YARD_TEAM_TOKEN=teamToken;

const node=await startEvercraftComputeNode({root:computeRoot,nodeId:'owned-aliev-rivet-node',allocatorToken});
const yard=new YardOperator({stateDir:yardState});
try{
  const aliev=await yard.deployRelease({
    deploymentId:'aliev-source-runtime',
    releaseRef:'a'.repeat(40),
    workloadClass:'systemia.aliev-source-runtime.v1',
    capacityEndpoint:node.endpoint,
    allocatorToken,
    input:{state_root:path.join(computeRoot,'aliev-source-state')},
    rollbackTarget:'proof:aliev-source-previous',
    leaseTtlMs:120000,
  });
  assert.equal(aliev.state,'ready');
  assert.equal(aliev.receipt.health_verification,'healthy');
  assert.equal(aliev.receipt.route_verification,'private_aliev_source_health_verified');
  assert.equal(aliev.result.private_source_runtime,true);
  assert.equal(aliev.result.public_route_required,false);
  assert.equal(/base44/i.test(aliev.result.source_url),false);

  const ingested=await fetch(aliev.result.ingest_url,{
    method:'POST',
    headers:{'content-type':'application/json',authorization:'Bearer '+ingestToken},
    body:JSON.stringify({snapshot}),
  });
  assert.equal(ingested.status,201);
  const ingestBody=await ingested.json();
  assert.equal(ingestBody.ok,true);
  assert.equal(ingestBody.address_keys.length,2);

  const direct=await fetch(aliev.result.source_url,{
    method:'POST',
    headers:{'content-type':'application/json','x-systemia-machine-key':machineKey},
    body:JSON.stringify({mode:'rivet_report_snapshot',address:'19820 International Blvd, SeaTac, WA 98188'}),
  });
  assert.equal(direct.status,200);
  const directBody=await direct.json();
  assert.equal(directBody.matched_address,snapshot.matched_address);
  assert.equal(directBody.nearby_observed_usage[0].charging_sessions_count,144);

  const rivet=await yard.deploySiblingRelease({
    sourceDeploymentId:'aliev-source-runtime',
    deploymentId:'rivet-report-runtime',
    releaseRef:'b'.repeat(40),
    workloadClass:'systemia.rivet-report-runtime.v1',
    input:{
      state_root:path.join(computeRoot,'rivet-report-state'),
      source_url:aliev.result.source_url,
    },
    rollbackTarget:'proof:rivet-report-previous',
    leaseTtlMs:120000,
  });
  assert.equal(rivet.state,'ready');
  assert.equal(rivet.receipt.capacity_node_id,aliev.receipt.capacity_node_id);
  assert.equal(rivet.receipt.health_verification,'healthy');
  assert.equal(rivet.receipt.route_verification,'local_rivet_report_health_verified_public_route_unbound');

  const generated=await fetch(rivet.result.local_url+'/v1/reports',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:'Bearer '+teamToken},
    body:JSON.stringify({address:'19820 International Blvd, SeaTac, WA 98188'}),
  });
  assert.equal(generated.status,201);
  const report=await generated.json();
  assert.equal(report.generation_state,'ready');
  assert.equal(report.report.body.source.system,'AliEV');
  assert.equal(report.report.body.metrics.max_aadt,52000);
  assert.equal(report.report.body.evidence.observed_usage[0].charging_sessions_count,144);
  assert.equal(report.verification.full_source_snapshot_persisted,true);
  assert.equal(report.verification.source_coverage_manifest_verified,true);

  const sourceRead=await fetch(rivet.result.local_url+'/v1/reports/'+encodeURIComponent(report.report_id)+'/source',{
    headers:{authorization:'Bearer '+teamToken}
  });
  assert.equal(sourceRead.status,200);
  const sourceBody=await sourceRead.json();
  assert.equal(sourceBody.sha256,report.source_snapshot.sha256);
  assert.equal(sourceBody.source_snapshot.matched_address,snapshot.matched_address);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.aliev-rivet.owned-lane-proof.v1',
    runtime:'Evercraft Compute',
    aliev_private_resident:true,
    rivet_private_resident:true,
    same_owned_compute_node:true,
    base44_request_path_required:false,
    content_addressed_aliev_store:true,
    source_reopen_integrity:true,
    systemia_machine_auth:true,
    team_report_auth:true,
    address_to_ready_report:true,
    observed_session_evidence_preserved:true,
    source_coverage_preserved:true,
    full_report_source_snapshot_preserved:true,
  },null,2));
}finally{
  try{await node.close();}catch{}
  if(old.machine===undefined) delete process.env.SYSTEMIA_MACHINE_KEY; else process.env.SYSTEMIA_MACHINE_KEY=old.machine;
  if(old.ingest===undefined) delete process.env.ALIEV_OWNED_INGEST_TOKEN; else process.env.ALIEV_OWNED_INGEST_TOKEN=old.ingest;
  if(old.team===undefined) delete process.env.RIVET_YARD_TEAM_TOKEN; else process.env.RIVET_YARD_TEAM_TOKEN=old.team;
  fs.rmSync(root,{recursive:true,force:true});
}
