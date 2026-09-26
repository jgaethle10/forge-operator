import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { YardOperator } from './operator.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'rivet-resident-yard-'));
const computeRoot=path.join(root,'compute');
const stateDir=path.join(root,'yard');
const sourceSnapshot={
  response_profile:'rivet_report_snapshot_v1',
  evidence_state:'SOURCE_BACKED',
  access_policy:{commercial_access:true},
  matched_address:'6405 W Chestnut Ave, Yakima, WA 98908',
  latitude:46.596551,
  longitude:-120.594201,
  state:'WA',
  postal_code:'98908',
  retrieved_at:'2026-09-25T20:00:00.000Z',
  coverage_contract:{utility_tariff:{state:'SCREENING_EVIDENCE_PRESENT'}},
  traffic:[{aadt:22100,source:'resident-yard-proof'}],
  chargers:[{name:'Proof charger'}],
  incentives:[{name:'Proof program'}],
  nearby_observed_usage:[{evidence_state:'observed'}]
};

const source=http.createServer(async(req,res)=>{
  const supplied=String(req.headers['x-systemia-machine-key']||'');
  assert.equal(supplied,'resident-proof-machine');
  const chunks=[]; for await(const chunk of req) chunks.push(chunk);
  const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  assert.equal(body.mode,'rivet_report_snapshot');
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify(sourceSnapshot));
});
await new Promise((resolve,reject)=>{source.once('error',reject);source.listen(0,'127.0.0.1',resolve);});
const sourceAddress=source.address();
const sourceUrl='http://127.0.0.1:'+sourceAddress.port+'/energySiteLookup';

const oldMachine=process.env.SYSTEMIA_MACHINE_KEY;
const oldTeam=process.env.RIVET_YARD_TEAM_TOKEN;
process.env.SYSTEMIA_MACHINE_KEY='resident-proof-machine';
process.env.RIVET_YARD_TEAM_TOKEN='resident-proof-team';

const node=await startEvercraftComputeNode({root:computeRoot,nodeId:'rivet-resident-proof-node'});
const yard=new YardOperator({stateDir});

try{
  const deployment=await yard.deployRelease({
    deploymentId:'rivet-resident-report-proof',
    releaseRef:'1c9349db05697a71957e1775cc2397ca7f36728c',
    workloadClass:'systemia.rivet-report-runtime.v1',
    capacityEndpoint:node.endpoint,
    input:{
      state_root:path.join(computeRoot,'rivet-state'),
      source_url:sourceUrl
    },
    rollbackTarget:'proof:rivet-report-previous',
    leaseTtlMs:120000
  });

  assert.equal(deployment.state,'ready');
  assert.equal(deployment.receipt.health_verification,'healthy');
  assert.equal(deployment.receipt.route_verification,'local_rivet_report_health_verified_public_route_unbound');
  assert.equal(deployment.result.authenticated_report_api,true);
  assert.ok(deployment.result.instance_id);
  assert.ok(deployment.result.local_url);

  const localHealth=await fetch(deployment.result.local_url+'/health').then(r=>r.json());
  assert.equal(localHealth.ok,true);
  assert.equal(localHealth.instance_id,deployment.result.instance_id);
  assert.equal(localHealth.deployment_receipt_bound,true);
  assert.equal(localHealth.deployment_receipt_ref,deployment.receipt.receipt_hash);

  const created=await fetch(deployment.result.local_url+'/v1/reports',{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'authorization':'Bearer resident-proof-team'
    },
    body:JSON.stringify({address:'6405 W Chestnut Ave, Yakima, WA 98908'})
  });
  assert.equal(created.status,201);
  const report=await created.json();
  assert.equal(report.generation_state,'ready');
  assert.equal(report.verification.football_opened,true);
  assert.equal(report.verification.source_response_profile_verified,true);

  await assert.rejects(
    yard.verifyPublicRoute('rivet-resident-report-proof',{origin:deployment.result.local_url}),
    /loopback is not a public route/
  );
  const loopback=await yard.verifyPublicRoute('rivet-resident-report-proof',{
    origin:deployment.result.local_url,
    allowLoopbackProof:true
  });
  assert.equal(loopback.scope,'loopback_proof');
  assert.equal(loopback.verified,false);
  assert.equal(loopback.service,'rivet-yard-report-runtime');
  assert.throws(
    ()=>yard.rivetReportRuntimeReceipt('rivet-resident-report-proof'),
    /verified public HTTPS route is required/
  );

  const routeState=await yard.verifyRoute('rivet-resident-report-proof');
  assert.equal(routeState.ok,false);
  assert.equal(routeState.state,'public_route_unbound');
  assert.equal(routeState.local_health_ok,true);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.rivet.resident-yard-proof.v1',
    compute_admission:true,
    deployment_receipt_bound:true,
    address_to_ready_report:true,
    football_verified:true,
    public_https_fails_closed_until_verified:true,
    instance_id:deployment.result.instance_id,
    deployment_receipt:deployment.receipt.receipt_hash
  },null,2));
}finally{
  await node.close();
  await new Promise(resolve=>source.close(()=>resolve()));
  if(oldMachine===undefined) delete process.env.SYSTEMIA_MACHINE_KEY; else process.env.SYSTEMIA_MACHINE_KEY=oldMachine;
  if(oldTeam===undefined) delete process.env.RIVET_YARD_TEAM_TOKEN; else process.env.RIVET_YARD_TEAM_TOKEN=oldTeam;
  fs.rmSync(root,{recursive:true,force:true});
}
