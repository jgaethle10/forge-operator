import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  validateRefreshEndpoint, invokeSessionRefresh, runOwnedFreshnessOnce,
  utcSlot, startOwnedSessionFreshnessResident
} from './session-freshness-resident.mjs';

const endpoint='https://api.example.org/api/apps/69b9b64d86a732029ce0db81/functions/refreshSessionFreshness';
const at='2026-10-08T01:32:00.000Z';
const responseAt='2026-10-08T01:32:05.000Z';
const cycle={
  ok:true,state:'refreshed',refreshed_at:'2026-10-08T01:32:03.000Z',
  receipt_source_record_id:'source-receipt-verified',
  results:[{name:'ingestNYCPlugNYCObservedUsage',ok:true},{name:'ingestNYCPlugNYCSessions',ok:true},{name:'penndot_nevi_observed_usage',ok:true},{name:'ingestCaryObservedUsage',ok:true}],
  historical_watch:{eligible_source_count:133,probed_source_count:23,estimated_full_sweep_hours:6,warning_count:0},
  failed_sources:[]
};
const mock=(body, status=200)=>async (_url,req)=>{
  assert.equal(req.method,'POST');
  assert.equal(req.headers['x-systemia-machine-key'],'fake-unit-test-key');
  assert.deepEqual(JSON.parse(req.body),{force:false});
  return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
};
const clocks=()=>{let n=0;return ()=>++n===1?at:responseAt};

test('rejects unsafe endpoint shapes and missing machine identity',async()=>{
  for(const candidate of ['http://api.example.org/functions/refreshSessionFreshness','https://127.0.0.1/functions/refreshSessionFreshness','https://api.example.org/functions/another','https://u:p@api.example.org/functions/refreshSessionFreshness']){
    assert.throws(()=>validateRefreshEndpoint(candidate));
  }
  await assert.rejects(()=>invokeSessionRefresh({endpoint,machineKey:'',fetchImpl:mock(cycle)}),/SYSTEMIA_MACHINE_KEY_required/);
});
test('verified owned invocation requires upstream persisted source receipt',async()=>{
  const result=await invokeSessionRefresh({endpoint,machineKey:'fake-unit-test-key',fetchImpl:mock(cycle),now:clocks()});
  assert.equal(result.state,'VERIFIED');
  assert.equal(result.source_receipt_id,'source-receipt-verified');
  assert.equal(result.historical_watch.estimated_full_sweep_hours,6);
  assert.equal(result.latest_observed_at,null);
  assert.match(result.observation_semantics,/source-native/);
});
test('historical warnings degrade even if response is HTTP 200',async()=>{
  const result=await invokeSessionRefresh({
    endpoint,machineKey:'fake-unit-test-key',fetchImpl:mock({...cycle,historical_watch:{...cycle.historical_watch,warning_count:2}}),now:clocks()
  });
  assert.equal(result.state,'DEGRADED');assert.equal(result.ok,false);
});
test('missing receipt and stale refresh time fail closed',async()=>{
  await assert.rejects(()=>invokeSessionRefresh({endpoint,machineKey:'fake-unit-test-key',fetchImpl:mock({...cycle,receipt_source_record_id:''}),now:clocks()}),/source_cycle_receipt_id_required/);
  await assert.rejects(()=>invokeSessionRefresh({endpoint,machineKey:'fake-unit-test-key',fetchImpl:mock({...cycle,refreshed_at:'2020-01-01T00:00:00Z'}),now:clocks()}),/refresh_timestamp_outside_invocation_window/);
});
test('API authorization failure does not become a fake success',async()=>{
  await assert.rejects(()=>invokeSessionRefresh({endpoint,machineKey:'fake-unit-test-key',fetchImpl:mock({error:'denied'},401),now:clocks()}),/refresh_http_401/);
});
test('dedupe skip means no new evidence',async()=>{
  const result=await invokeSessionRefresh({endpoint,machineKey:'fake-unit-test-key',fetchImpl:mock({state:'skipped_recent_cycle',last_refreshed_at:at}),now:clocks()});
  assert.equal(result.state,'SKIPPED_NOT_NEW_EVIDENCE');assert.equal(result.ok,false);
});
test('durable receipts record failed operations without secrets',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'owned-freshness-test-'));
  try{
    const file=path.join(directory,'receipts.jsonl');
    const result=await runOwnedFreshnessOnce({endpoint,machineKey:'fake-unit-test-key',fetchImpl:mock({error:'denied'},401),now:()=>at,ledgerPath:file});
    assert.equal(result.state,'FAILED');
    const rows=fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(rows.length,1);assert.equal(rows[0].state,'FAILED');
    assert.equal(fs.readFileSync(file,'utf8').includes('fake-unit-test-key'),false);
  }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
test('UTC shadow slot only once per distinct hour',async()=>{
  assert.equal(utcSlot(new Date('2026-10-08T01:12:00Z')),null);
  assert.equal(utcSlot(new Date('2026-10-08T01:32:00Z')),'2026-10-08T01Z');
  const clockValues=['2026-10-08T01:32:00Z','2026-10-08T01:32:30Z','2026-10-08T01:33:00Z','2026-10-08T02:32:00Z'];
  let count=0;let i=0;
  const resident=await startOwnedSessionFreshnessResident({enabled:true,periodMs:3600000,clock:()=>new Date(clockValues[Math.min(i++,clockValues.length-1)]),run:async()=>{count++}});
  await resident.tick();await resident.tick();await resident.tick();
  resident.close();
  assert.equal(count,2);
});
test('production resident is disabled by default',async()=>{
  await assert.rejects(()=>startOwnedSessionFreshnessResident({enabled:false}),/resident_disabled_until_explicit_enablement/);
});

test('missing dynamic or historical receipt coverage is never VERIFIED',async()=>{
  await assert.rejects(()=>invokeSessionRefresh({endpoint,machineKey:'fake-unit-test-key',fetchImpl:mock({...cycle,results:undefined}),now:clocks()}),/dynamic_source_results_contract_required/);
  await assert.rejects(()=>invokeSessionRefresh({endpoint,machineKey:'fake-unit-test-key',fetchImpl:mock({...cycle,historical_watch:undefined}),now:clocks()}),/historical_watch_contract_required/);
});
test('breached historical sweep SLA is degraded even with zero HTTP errors',async()=>{
  const result=await invokeSessionRefresh({endpoint,machineKey:'fake-unit-test-key',fetchImpl:mock({...cycle,historical_watch:{...cycle.historical_watch,estimated_full_sweep_hours:14}}),now:clocks()});
  assert.equal(result.state,'DEGRADED');assert.equal(result.ok,false);
});
