import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { YardOperator } from './operator.mjs';
import { RivetReportEdgeController } from './rivet-report-edge-controller.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'rivet-report-edge-proof-'));
const computeRoot=path.join(root,'compute');
const yardState=path.join(root,'yard');
const controllerState=path.join(root,'controller');
const allocatorToken='proof-allocator';
const teamToken='proof-team';
const machineKey='proof-machine';
const coverageDomains=['geocoding','charging_inventory','traffic','traffic_temporal','utility_service_area','utility_tariff','incentives','parcel_planning','local_ev_stock','observed_sessions','freight','dwell_context','deep_market_evidence','provenance'];
const sourceSnapshot={
  response_profile:'rivet_report_snapshot_v1',
  evidence_state:'SOURCE_BACKED',
  access_policy:{commercial_access:true},
  matched_address:'333 Strander Blvd, Tukwila, WA 98188',
  latitude:47.456,
  longitude:-122.252,
  state:'WA',
  postal_code:'98188',
  retrieved_at:'2026-09-30T16:00:00.000Z',
  source_coverage_manifest:{
    schema:'evercraft.rivet.source-coverage.v1',
    generated_at:'2026-09-30T16:00:00.000Z',
    domains:Object.fromEntries(coverageDomains.map(key=>[key,{state:'CONNECTED',record_count:1,source_status:'proof'}])),
    semantics:'Missing is never zero.'
  },
  source_record_ids:['edge-proof-source'],
  coverage_contract:{
    utility_tariff:{state:'SCREENING_EVIDENCE_PRESENT'},
    utility_service_area:{state:'SCREENING_EVIDENCE_PRESENT'},
    sessions_utilization:{state:'OBSERVED_VERIFIED'}
  },
  traffic:[{aadt:31000,source:'proof'}],
  traffic_profiles:[{period:'weekday_pm',aadt:31000}],
  chargers:[{name:'Edge proof charger',kw:150}],
  incentives:[{name:'Edge proof program'}],
  nearby_observed_usage:[{evidence_state:'observed',sessions:7}],
  utility_rate_candidates:[{utility:'Edge Proof Utility',rate:'EV-1'}],
  local_ev_stock:{active_ev_phev:4321},
  freight_context:{state:'CONNECTED'},
  dwell_anchors:[{name:'Edge proof dwell'}],
  deep_market_evidence:[{name:'Edge proof market evidence'}],
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
const sourceUrl='http://127.0.0.1:'+sourceAddress.port+'/energySiteLookup';

const previousMachine=process.env.SYSTEMIA_MACHINE_KEY;
const previousTeam=process.env.RIVET_YARD_TEAM_TOKEN;
process.env.SYSTEMIA_MACHINE_KEY=machineKey;
process.env.RIVET_YARD_TEAM_TOKEN=teamToken;

const node=await startEvercraftComputeNode({
  root:computeRoot,
  nodeId:'rivet-report-edge-proof-node',
  allocatorToken,
});
const yard=new YardOperator({stateDir:yardState});
const releaseRef='7'.repeat(40);

try{
  const edge=await yard.deployRelease({
    deploymentId:'evercraft-public-edge',
    releaseRef,
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

  const controller=new RivetReportEdgeController({
    yard,
    stateDir:controllerState,
    leaseTtlMs:120000,
    renewEveryMs:60000,
    allowLoopbackProof:true,
    requestedHostname:'rivet-report-proof',
    stableHostname:true,
  });
  const provisioned=await controller.provision({
    releaseRef,
    sourceUrl,
    stateRoot:path.join(computeRoot,'rivet-state'),
    rollbackTarget:'proof:rivet-previous',
  });
  assert.equal(provisioned.action,'provisioned');
  assert.equal(provisioned.runtime_fabric,'Evercraft Compute');
  assert.equal(provisioned.node_id,'rivet-report-edge-proof-node');
  assert.equal(provisioned.route_scope,'loopback_proof');
  assert.equal(provisioned.route_verified,false);
  assert.equal(provisioned.authenticated_report_api,true);
  assert.equal(provisioned.capacity_authority_inherited,true);
  assert.equal(provisioned.capacity_authority_exposed,false);
  assert.match(provisioned.origin,/^http:\/\/127\.0\.0\.1:/);

  const created=await fetch(provisioned.origin+'/v1/reports',{
    method:'POST',
    headers:{
      'content-type':'application/json',
      authorization:'Bearer '+teamToken,
    },
    body:JSON.stringify({address:'333 Strander Blvd, Tukwila, WA 98188'})
  });
  assert.equal(created.status,201);
  const report=await created.json();
  assert.equal(report.generation_state,'ready');
  assert.equal(report.verification.source_coverage_verified,true);
  assert.equal(report.verification.required_source_domains_explicit,coverageDomains.length);
  assert.equal(report.report.body.evidence.utility.rate_candidates[0].rate,'EV-1');
  assert.equal(report.report.body.evidence.market.deep_market_evidence[0].name,'Edge proof market evidence');

  const tick=await controller.tick();
  assert.equal(tick.action,'healthy');
  assert.equal(tick.health_state,'loopback_proof_healthy');
  assert.ok(tick.lease_renewal_receipt);

  const restarted=new RivetReportEdgeController({
    yard:new YardOperator({stateDir:yardState}),
    stateDir:controllerState,
    leaseTtlMs:120000,
    renewEveryMs:60000,
    allowLoopbackProof:true,
  });
  assert.ok(restarted.binding);
  const resumed=await restarted.resume({rebindIfNeeded:true});
  assert.equal(resumed.action,'resumed');
  assert.equal(resumed.health_state,'loopback_proof_healthy');
  assert.equal(resumed.origin,provisioned.origin);

  const stopped=await restarted.close({reason:'proof_complete'});
  assert.equal(stopped.action,'stopped');
  assert.ok(stopped.route_release_receipt);
  await yard.stopDeployment('evercraft-public-edge',{reason:'proof_complete'});

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.rivet.report-edge-controller-proof.v1',
    address_to_ready_report_through_edge:true,
    team_auth_through_edge:true,
    source_coverage_verified:true,
    resident_lease_renewal:true,
    sibling_capacity_authority_reused_privately:true,
    allocator_reentry_required:false,
    restart_resume_without_manual_reprovision:true,
    route_release_proven:true,
    production_https_gate_remains_fail_closed:true,
    founder_login_required:false,
    proof_scope:'loopback_only',
    report_id:report.report_id,
    provision_receipt:provisioned.receipt_hash,
    resume_receipt:resumed.receipt_hash,
  },null,2));
}finally{
  try{await node.close();}catch{}
  await new Promise(resolve=>source.close(()=>resolve()));
  if(previousMachine===undefined) delete process.env.SYSTEMIA_MACHINE_KEY; else process.env.SYSTEMIA_MACHINE_KEY=previousMachine;
  if(previousTeam===undefined) delete process.env.RIVET_YARD_TEAM_TOKEN; else process.env.RIVET_YARD_TEAM_TOKEN=previousTeam;
  fs.rmSync(root,{recursive:true,force:true});
}
