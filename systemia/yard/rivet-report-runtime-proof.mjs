import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { YardOperator } from './operator.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'yard-rivet-runtime-'));
const computeRoot=path.join(root,'compute');
const stateDir=path.join(root,'yard');

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
  traffic:[{aadt:22100,source:'yard-proof'}],
  chargers:[{name:'Yard proof charger'}],
  incentives:[{name:'Yard proof incentive'}],
  nearby_observed_usage:[{evidence_state:'observed'}]
};

const source=http.createServer(async(req,res)=>{
  if(req.method!=='POST') { res.writeHead(405); res.end(); return; }
  const auth=String(req.headers['x-systemia-machine-key']||'');
  assert.equal(auth,'yard-proof-machine-key');
  const chunks=[]; for await(const chunk of req) chunks.push(chunk);
  const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  assert.equal(body.mode,'rivet_report_snapshot');
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify(sourceSnapshot));
});
await new Promise((resolve,reject)=>{source.once('error',reject);source.listen(0,'127.0.0.1',resolve);});
const addr=source.address();
const sourceUrl='http://127.0.0.1:'+addr.port+'/energySiteLookup';

const oldMachine=process.env.SYSTEMIA_MACHINE_KEY;
const oldTeam=process.env.RIVET_YARD_TEAM_TOKEN;
process.env.SYSTEMIA_MACHINE_KEY='yard-proof-machine-key';
process.env.RIVET_YARD_TEAM_TOKEN='yard-proof-team-token';

const node=await startEvercraftComputeNode({root:computeRoot,nodeId:'rivet-yard-proof-node'});
const yard=new YardOperator({stateDir});

try{
  const deployment=await yard.deployRelease({
    deploymentId:'rivet-report-runtime-proof',
    releaseRef:'58d17315961483c0ab86be94b181d070eb6ea45e',
    workloadClass:'systemia.rivet-report-runtime.v1',
    capacityEndpoint:node.endpoint,
    input:{state_root:path.join(computeRoot,'rivet-state'),source_url:sourceUrl},
    rollbackTarget:'proof:previous-rivet-runtime',
    leaseTtlMs:120000
  });

  assert.equal(deployment.state,'ready');
  assert.equal(deployment.receipt.health_verification,'healthy');
  assert.equal(deployment.receipt.route_verification,'private_rivet_report_runtime_health_verified');
  assert.ok(deployment.result.private_runtime_url);

  const denied=await fetch(deployment.result.private_runtime_url+'/v1/reports',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({address:'6405 W Chestnut Ave Yakima WA'})
  });
  assert.equal(denied.status,401);

  const created=await fetch(deployment.result.private_runtime_url+'/v1/reports',{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'authorization':'Bearer yard-proof-team-token'
    },
    body:JSON.stringify({address:'6405 W Chestnut Ave Yakima WA'})
  });
  assert.equal(created.status,201);
  const report=await created.json();
  assert.equal(report.ok,true);
  assert.equal(report.generation_state,'ready');
  assert.equal(report.verification.football_opened,true);
  assert.equal(report.report.body.metrics.max_aadt,22100);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.yard.rivet-report-runtime-proof.v1',
    systemia_yard_deployment_ready:true,
    evercraft_compute_used:true,
    private_health_verified:true,
    address_to_ready_report:true,
    beast_football_snapshot_verified:true,
    team_auth_fail_closed:true,
    report_id:report.report_id,
    deployment_receipt:deployment.receipt.receipt_hash
  },null,2));
}finally{
  await node.close();
  await new Promise(resolve=>source.close(()=>resolve()));
  if(oldMachine===undefined) delete process.env.SYSTEMIA_MACHINE_KEY; else process.env.SYSTEMIA_MACHINE_KEY=oldMachine;
  if(oldTeam===undefined) delete process.env.RIVET_YARD_TEAM_TOKEN; else process.env.RIVET_YARD_TEAM_TOKEN=oldTeam;
  fs.rmSync(root,{recursive:true,force:true});
}
