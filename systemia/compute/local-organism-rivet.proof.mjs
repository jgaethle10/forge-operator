import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { startLocalOrganism } from './local-organism.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-local-organism-rivet-'));
const releaseRef='69651272e61fc540e481c53662d949dc8228c5fe';
const sourceSnapshot={
  response_profile:'rivet_report_snapshot_v1',
  evidence_state:'SOURCE_BACKED',
  access_policy:{commercial_access:true},
  matched_address:'6405 W Chestnut Ave, Yakima, WA 98908',
  latitude:46.596551,
  longitude:-120.594201,
  state:'WA',
  postal_code:'98908',
  coverage_contract:{utility_tariff:{state:'SCREENING_EVIDENCE_PRESENT'}},
  traffic:[{aadt:22100,source:'local-organism-proof'}],
  chargers:[{name:'Proof charger'}],
  incentives:[{name:'Proof incentive'}],
  nearby_observed_usage:[{evidence_state:'observed'}]
};
const source=http.createServer(async(req,res)=>{
  assert.equal(String(req.headers['x-systemia-machine-key']||''),'local-organism-machine');
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
process.env.SYSTEMIA_MACHINE_KEY='local-organism-machine';
process.env.RIVET_YARD_TEAM_TOKEN='local-organism-team';

let organism=null;
try{
  organism=await startLocalOrganism({
    root,
    nodeId:'rivet-local-organism-proof',
    releaseRef,
    rivetSourceUrl:sourceUrl
  });
  assert.ok(organism.rivet);
  assert.equal(organism.receipt.rivet_report_runtime.configured,true);
  assert.equal(organism.receipt.rivet_report_runtime.local_health_ok,true);
  assert.equal(organism.receipt.rivet_report_runtime.state,'public_route_unbound');
  assert.equal(organism.receipt.rivet_report_runtime.public_ingress,false);

  const created=await fetch(organism.rivet.result.local_url+'/v1/reports',{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'authorization':'Bearer local-organism-team'
    },
    body:JSON.stringify({address:'6405 W Chestnut Ave, Yakima, WA 98908'})
  });
  assert.equal(created.status,201);
  const report=await created.json();
  assert.equal(report.generation_state,'ready');
  assert.equal(report.verification.football_opened,true);

  const health=await organism.health();
  assert.equal(health.ok,true);
  assert.equal(health.rivet_report_runtime.ok,true);
  assert.equal(health.rivet_report_runtime.public_ingress,false);

  const serialized=JSON.stringify(organism.receipt);
  assert.ok(!serialized.includes('local-organism-machine'));
  assert.ok(!serialized.includes('local-organism-team'));

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.local-organism-rivet-proof.v1',
    rivet_resident_started:true,
    address_to_ready_report:true,
    football_verified:true,
    public_ingress:false,
    secrets_redacted:true
  },null,2));
}finally{
  if(organism){try{await organism.close();}catch{}}
  await new Promise(resolve=>source.close(()=>resolve()));
  if(oldMachine===undefined) delete process.env.SYSTEMIA_MACHINE_KEY; else process.env.SYSTEMIA_MACHINE_KEY=oldMachine;
  if(oldTeam===undefined) delete process.env.RIVET_YARD_TEAM_TOKEN; else process.env.RIVET_YARD_TEAM_TOKEN=oldTeam;
  fs.rmSync(root,{recursive:true,force:true});
}
