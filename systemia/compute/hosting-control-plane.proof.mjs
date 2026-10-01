import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { startEvercraftComputeNode } from './runtime-node.mjs';
import { EvercraftHostingControlPlane, validateEvercraftServiceSpec } from './hosting-control-plane.mjs';
import { YardOperator } from '../yard/operator.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-hosting-proof-'));
const computeRoot=path.join(root,'compute');
const yardState=path.join(root,'yard');
const hostingState=path.join(root,'hosting');
const allocatorToken='hosting-proof-allocator';
const machineKey='hosting-proof-machine';
const teamToken='hosting-proof-team';
const coverageKeys=[
  'geocoding','charging_inventory','traffic','traffic_temporal','utility_service_area','utility_tariff','incentives',
  'parcel_planning','local_ev_stock','observed_sessions','freight','dwell_context','deep_market_evidence','provenance'
];
const sourceSnapshot={
  response_profile:'rivet_report_snapshot_v1',
  evidence_state:'SOURCE_BACKED',
  access_policy:{commercial_access:true},
  matched_address:'19820 International Boulevard, SeaTac, WA 98188',
  latitude:47.4239385,
  longitude:-122.2955482,
  state:'WA',
  postal_code:'98188',
  retrieved_at:'2026-09-30T20:00:00.000Z',
  source_coverage_manifest:{
    schema:'evercraft.rivet.source-coverage.v1',
    generated_at:'2026-09-30T20:00:00.000Z',
    domains:Object.fromEntries(coverageKeys.map(key=>[key,{state:'CONNECTED',record_count:1,source_status:'owned-hosting-proof'}])),
    semantics:'Missing is never zero.'
  },
  source_record_ids:['owned-hosting-proof-source'],
  coverage_contract:{utility_tariff:{state:'SCREENING_EVIDENCE_PRESENT'},sessions_utilization:{state:'OBSERVED_VERIFIED'}},
  traffic:[{aadt:41000,source:'owned-hosting-proof'}],
  traffic_profiles:[{profile_type:'peak_hour_volume',daily_total:41000}],
  chargers:[{name:'Owned source proof charger',ports:8,power_kw:250}],
  incentives:[{name:'Owned source proof incentive'}],
  nearby_observed_usage:[{evidence_state:'observed',charging_sessions_count:88}],
  utility_rate_candidates:[{utility_name:'Owned Proof Utility',rate_name:'EV-1'}],
  local_ev_stock:{bev_count:1000},
  freight_context:{state:'CONNECTED'},
  dwell_anchors:[{name:'SEA Airport'}],
  deep_market_evidence:[{name:'Owned source market evidence'}],
};

const source=http.createServer(async(req,res)=>{
  assert.equal(String(req.headers['x-systemia-machine-key']||''),machineKey);
  const chunks=[]; for await(const chunk of req) chunks.push(chunk);
  const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  assert.equal(body.mode,'rivet_report_snapshot');
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify(sourceSnapshot));
});
await new Promise((resolve,reject)=>{source.once('error',reject);source.listen(0,'127.0.0.1',resolve);});
const sourceAddress=source.address();
const sourceUrl='http://127.0.0.1:'+sourceAddress.port+'/site-snapshot';

const previousMachine=process.env.SYSTEMIA_MACHINE_KEY;
const previousTeam=process.env.RIVET_YARD_TEAM_TOKEN;
const previousSource=process.env.ALIEV_OWNED_SOURCE_URL;
process.env.SYSTEMIA_MACHINE_KEY=machineKey;
process.env.RIVET_YARD_TEAM_TOKEN=teamToken;
process.env.ALIEV_OWNED_SOURCE_URL=sourceUrl;

const node=await startEvercraftComputeNode({
  root:computeRoot,
  nodeId:'evercraft-hosting-proof-node',
  allocatorToken,
});
const yard=new YardOperator({stateDir:yardState});
const hosting=new EvercraftHostingControlPlane({
  yard,
  stateDir:hostingState,
  allowLoopbackProof:true,
  defaultLeaseTtlMs:120000,
  defaultRenewEveryMs:60000,
});

function spec(releaseRef,overrides={}){
  return {
    schema:'evercraft.compute.service-spec.v1',
    service_id:'rivet-report-production',
    release_ref:releaseRef,
    workload_class:'systemia.rivet-report-runtime.v1',
    capacity_source_deployment_id:'evercraft-public-edge',
    input:{state_root:path.join(computeRoot,'rivet-report-state')},
    input_env:{source_url:'ALIEV_OWNED_SOURCE_URL'},
    rollback_target:'evercraft:rivet-report-previous',
    lease_ttl_ms:120000,
    renew_every_ms:60000,
    health:{
      path:'/health',
      expect:{ok:true,service:'rivet-yard-report-runtime',runtime:'Evercraft Compute'}
    },
    route:{
      mode:'public_edge',
      edge_deployment_id:'evercraft-public-edge',
      hostname:'rivet-reports',
      stable_hostname:true,
    },
    ...overrides,
  };
}

try{
  assert.equal(validateEvercraftServiceSpec(spec('1'.repeat(40))),true);
  assert.throws(
    ()=>validateEvercraftServiceSpec({...spec('1'.repeat(40)),input:{api_token:'do-not-store'}}),
    /secret_material_must_not_be_embedded/
  );

  const edge=await yard.deployRelease({
    deploymentId:'evercraft-public-edge',
    releaseRef:'e'.repeat(40),
    workloadClass:'systemia.public-edge.v1',
    capacityEndpoint:node.endpoint,
    allocatorToken,
    input:{
      mode:'proof_loopback',
      control_host:'127.0.0.1',
      control_port:0,
      public_host:'127.0.0.1',
      public_port:0,
      base_domain:'',
      tls_key_path:'',
      tls_cert_path:'',
      allow_private_upstream:false,
    },
    rollbackTarget:'proof:edge-previous',
    leaseTtlMs:120000,
  });
  assert.equal(edge.state,'ready');

  const first=await hosting.apply(spec('1'.repeat(40)));
  assert.equal(first.state,'ready');
  assert.equal(first.action,'created');
  assert.equal(first.health.ok,true);
  assert.equal(first.route.mode,'public_edge');
  assert.equal(first.compatibility_binding.schema,'evercraft.rivet.compatibility-binding.v1');
  assert.match(first.compatibility_binding.reports_url,/\/v1\/reports$/);
  assert.equal(first.compatibility_binding.route_verified,false);
  assert.equal(first.compatibility_binding.credential_source_env,'RIVET_YARD_TEAM_TOKEN');
  assert.equal(first.compatibility_binding.secret_value_embedded,false);
  assert.match(first.route.origin,/^http:\/\/127\.0\.0\.1:/);
  assert.equal(first.route.verified,false);
  assert.equal(first.capacity_node_id,'evercraft-hosting-proof-node');
  assert.equal(first.deployment_generation,1);

  const reportResponse=await fetch(first.route.origin+'/v1/reports',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:'Bearer '+teamToken},
    body:JSON.stringify({address:'19820 International Boulevard, SeaTac, WA 98188'})
  });
  assert.equal(reportResponse.status,201);
  const report=await reportResponse.json();
  assert.equal(report.generation_state,'ready');
  assert.equal(report.verification.full_source_snapshot_persisted,true);
  assert.equal(report.verification.source_coverage_manifest_verified,true);

  const unchanged=await hosting.apply(spec('1'.repeat(40)));
  assert.equal(unchanged.action,'unchanged');
  assert.equal(unchanged.active_deployment_id,first.active_deployment_id);

  const bad=spec('9'.repeat(40),{
    health:{path:'/health',expect:{ok:true,service:'this-service-must-not-exist'}}
  });
  await assert.rejects(()=>hosting.apply(bad),/candidate_health_gate_failed/);
  const afterBad=hosting.status('rivet-report-production');
  assert.equal(afterBad.state,'ready');
  assert.equal(afterBad.active_deployment_id,first.active_deployment_id);

  const second=await hosting.apply(spec('2'.repeat(40)));
  assert.equal(second.state,'ready');
  assert.equal(second.action,'promoted');
  assert.notEqual(second.active_deployment_id,first.active_deployment_id);
  assert.equal(second.previous.release_ref,'1'.repeat(40));
  assert.equal(second.deployment_generation,2);

  const rolled=await hosting.rollback('rivet-report-production');
  assert.equal(rolled.state,'ready');
  assert.equal(rolled.active_release_ref,'1'.repeat(40));
  assert.equal(rolled.deployment_generation,3);

  await yard.stopDeployment(rolled.active_deployment_id,{reason:'simulate_runtime_loss'});
  const healed=await hosting.reconcile('rivet-report-production');
  assert.equal(healed.state,'ready');
  assert.equal(healed.active_release_ref,'1'.repeat(40));
  assert.equal(healed.deployment_generation,4);
  assert.notEqual(healed.active_deployment_id,rolled.active_deployment_id);

  const reconcileAll=await hosting.reconcileAll();
  assert.equal(reconcileAll.service_count,1);
  assert.equal(reconcileAll.healthy_count,1);
  assert.equal(reconcileAll.degraded_count,0);

  const removed=await hosting.remove('rivet-report-production',{reason:'proof_complete'});
  assert.equal(removed.state,'stopped');
  await yard.stopDeployment('evercraft-public-edge',{reason:'proof_complete'});

  const ledger=fs.readFileSync(path.join(hostingState,'hosting-receipts.jsonl'),'utf8');
  assert.match(ledger,/evercraft\.compute\.hosting-receipt\.v1/);
  assert.equal(ledger.includes(machineKey),false);
  assert.equal(ledger.includes(teamToken),false);
  assert.equal(ledger.includes('do-not-store'),false);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.compute.hosting-control-plane-proof.v1',
    runtime:'Evercraft Compute',
    control_plane:'Evercraft Hosting',
    workload:'systemia.rivet-report-runtime.v1',
    immutable_release_required:true,
    embedded_secrets_rejected:true,
    environment_config_resolution:true,
    candidate_health_gate:true,
    failed_candidate_preserves_active_service:true,
    blue_green_promotion:true,
    rollback:true,
    deployment_generations:true,
    same_spec_runtime_recovery:true,
    reconcile_all:true,
    stable_public_route:true,
    rivet_compatibility_binding_receipt:true,
    compatibility_secret_value_not_embedded:true,
    authenticated_rivet_report:true,
    full_source_snapshot_persisted:true,
    source_coverage_verified:true,
    base44_runtime_required:false,
    render_required:false,
    external_hosting_control_plane_required:false,
  },null,2));
}finally{
  try{await node.close();}catch{}
  await new Promise(resolve=>source.close(()=>resolve()));
  if(previousMachine===undefined) delete process.env.SYSTEMIA_MACHINE_KEY; else process.env.SYSTEMIA_MACHINE_KEY=previousMachine;
  if(previousTeam===undefined) delete process.env.RIVET_YARD_TEAM_TOKEN; else process.env.RIVET_YARD_TEAM_TOKEN=previousTeam;
  if(previousSource===undefined) delete process.env.ALIEV_OWNED_SOURCE_URL; else process.env.ALIEV_OWNED_SOURCE_URL=previousSource;
  fs.rmSync(root,{recursive:true,force:true});
}
