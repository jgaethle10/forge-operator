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

const record=await generateYardReport({
  address:'6405 W Chestnut Ave Yakima WA',
  sourceUrl:'https://source.invalid/energySiteLookup',
  systemiaMachineKey:'proof-machine-key',
  sourceFetch,
  stateDir:root,
  now:()=> '2026-09-25T20:01:00.000Z'
});
assert.equal(record.generation_state,'ready');
assert.equal(record.verification.football_opened,true);
assert.equal(record.verification.source_sha256_match,true);
assert.equal(record.report.body.generation_state,'ready');
assert.equal(record.report.body.metrics.max_aadt,22100);

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
    report_id:made.report_id
  },null,2));
}finally{
  await runtime.close();
  fs.rmSync(root,{recursive:true,force:true});
}
