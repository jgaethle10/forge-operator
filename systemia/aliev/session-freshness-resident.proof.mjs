import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  validateRefreshEndpoint, invokeSessionRefresh, runOwnedFreshnessOnce,
  utcSlot, startOwnedSessionFreshnessResident
} from './session-freshness-resident.mjs';
import {claimFreshnessSlot,finishFreshnessSlot,inspectFreshnessSlot} from './session-freshness-slot.mjs';

const endpoint='https://api.example.org/api/apps/69b9b64d86a732029ce0db81/functions/refreshSessionFreshness';
const trustedOrigin='https://api.example.org';
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
    assert.throws(()=>validateRefreshEndpoint(candidate,{trustedOrigin}));
  }
  await assert.rejects(()=>invokeSessionRefresh({endpoint,trustedOrigin,machineKey:'',fetchImpl:mock(cycle)}),/SYSTEMIA_MACHINE_KEY_required/);
});
test('verified owned invocation requires upstream persisted source receipt',async()=>{
  const result=await invokeSessionRefresh({endpoint,trustedOrigin,machineKey:'fake-unit-test-key',fetchImpl:mock(cycle),now:clocks()});
  assert.equal(result.state,'VERIFIED');
  assert.equal(result.source_receipt_id,'source-receipt-verified');
  assert.equal(result.historical_watch.estimated_full_sweep_hours,6);
  assert.equal(result.latest_observed_at,null);
  assert.match(result.observation_semantics,/source-native/);
});
test('historical warnings degrade even if response is HTTP 200',async()=>{
  const result=await invokeSessionRefresh({
    endpoint,trustedOrigin,machineKey:'fake-unit-test-key',fetchImpl:mock({...cycle,historical_watch:{...cycle.historical_watch,warning_count:2}}),now:clocks()
  });
  assert.equal(result.state,'DEGRADED');assert.equal(result.ok,false);
});
test('missing receipt and stale refresh time fail closed',async()=>{
  await assert.rejects(()=>invokeSessionRefresh({endpoint,trustedOrigin,machineKey:'fake-unit-test-key',fetchImpl:mock({...cycle,receipt_source_record_id:''}),now:clocks()}),/source_cycle_receipt_id_required/);
  await assert.rejects(()=>invokeSessionRefresh({endpoint,trustedOrigin,machineKey:'fake-unit-test-key',fetchImpl:mock({...cycle,refreshed_at:'2020-01-01T00:00:00Z'}),now:clocks()}),/refresh_timestamp_outside_invocation_window/);
});
test('API authorization failure does not become a fake success',async()=>{
  await assert.rejects(()=>invokeSessionRefresh({endpoint,trustedOrigin,machineKey:'fake-unit-test-key',fetchImpl:mock({error:'denied'},401),now:clocks()}),/refresh_http_401/);
});
test('dedupe skip means no new evidence',async()=>{
  const result=await invokeSessionRefresh({endpoint,trustedOrigin,machineKey:'fake-unit-test-key',fetchImpl:mock({state:'skipped_recent_cycle',last_refreshed_at:at}),now:clocks()});
  assert.equal(result.state,'SKIPPED_NOT_NEW_EVIDENCE');assert.equal(result.ok,false);
});
test('durable receipts record failed operations without secrets',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'owned-freshness-test-'));
  try{
    const file=path.join(directory,'receipts.jsonl');
    const result=await runOwnedFreshnessOnce({endpoint,trustedOrigin,machineKey:'fake-unit-test-key',fetchImpl:mock({error:'denied'},401),now:()=>at,ledgerPath:file});
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
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'owned-freshness-slots-'));
  try{
    const resident=await startOwnedSessionFreshnessResident({enabled:true,slotStateDir:dir,periodMs:3600000,clock:()=>new Date(clockValues[Math.min(i++,clockValues.length-1)]),run:async()=>{count++;return {ok:true,state:'VERIFIED',source_receipt_id:'test-'+count}}});
    await resident.tick();await resident.tick();await resident.tick();
    resident.close();
    assert.equal(count,2);
    assert.equal(inspectFreshnessSlot({stateDir:dir,slot:'2026-10-08T01Z'}).state,'VERIFIED');
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('production resident is disabled by default',async()=>{
  await assert.rejects(()=>startOwnedSessionFreshnessResident({enabled:false}),/resident_disabled_until_explicit_enablement/);
});

test('missing dynamic or historical receipt coverage is never VERIFIED',async()=>{
  await assert.rejects(()=>invokeSessionRefresh({endpoint,trustedOrigin,machineKey:'fake-unit-test-key',fetchImpl:mock({...cycle,results:undefined}),now:clocks()}),/dynamic_source_results_contract_required/);
  await assert.rejects(()=>invokeSessionRefresh({endpoint,trustedOrigin,machineKey:'fake-unit-test-key',fetchImpl:mock({...cycle,historical_watch:undefined}),now:clocks()}),/historical_watch_contract_required/);
});
test('breached historical sweep SLA is degraded even with zero HTTP errors',async()=>{
  const result=await invokeSessionRefresh({endpoint,trustedOrigin,machineKey:'fake-unit-test-key',fetchImpl:mock({...cycle,historical_watch:{...cycle.historical_watch,estimated_full_sweep_hours:14}}),now:clocks()});
  assert.equal(result.state,'DEGRADED');assert.equal(result.ok,false);
});

test('durable slot rejects same-hour restart and second resident on this host',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'owned-freshness-multi-'));
  try{
    const slot='2026-10-08T04Z';
    const first=claimFreshnessSlot({stateDir:dir,slot});
    assert.equal(first.admitted,true);
    const second=claimFreshnessSlot({stateDir:dir,slot});
    assert.equal(second.admitted,false);
    const done=finishFreshnessSlot(first,{receipt:{ok:true,state:'VERIFIED',source_receipt_id:'receipt-04'}});
    assert.equal(done.state,'VERIFIED');
    assert.equal(inspectFreshnessSlot({stateDir:dir,slot}).refresh_receipt_id,'receipt-04');
    assert.equal(claimFreshnessSlot({stateDir:dir,slot}).admitted,false);
    assert.equal(claimFreshnessSlot({stateDir:dir,slot:'2026-10-08T05Z'}).admitted,true);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('interrupted slot remains STARTED and requires explicit inspection',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'owned-freshness-crash-'));
  try{
    claimFreshnessSlot({stateDir:dir,slot:'2026-10-08T06Z'});
    assert.equal(inspectFreshnessSlot({stateDir:dir,slot:'2026-10-08T06Z'}).state,'STARTED');
    assert.equal(claimFreshnessSlot({stateDir:dir,slot:'2026-10-08T06Z'}).admitted,false);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('resident marks rejected execution FAILED without replaying the same hour',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'owned-freshness-error-'));
  let called=0;let errors=0;
  try{
    const resident=await startOwnedSessionFreshnessResident({
      enabled:true,slotStateDir:dir,periodMs:3600000,
      clock:()=>new Date('2026-10-08T07:32:04Z'),
      run:async()=>{called++;throw new Error('injected-run-failure')},
      onError:()=>{errors++}
    });
    await resident.tick();
    resident.close();
    assert.equal(called,1);
    assert.equal(errors,1);
    assert.equal(inspectFreshnessSlot({stateDir:dir,slot:'2026-10-08T07Z'}).state,'FAILED');
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('resident requires durable slot storage before activating',async()=>{
  await assert.rejects(()=>startOwnedSessionFreshnessResident({enabled:true,slotStateDir:''}),/durable_slot_state_directory_required/);
});

test('required dynamic source absence is not concealed by unrelated green operations',async()=>{
  const unrelated=Array.from({length:5},(_,i)=>({name:'other_'+i,ok:true}));
  await assert.rejects(()=>invokeSessionRefresh({endpoint,trustedOrigin,machineKey:'fake-unit-test-key',
    fetchImpl:mock({...cycle,results:unrelated}),now:clocks()}),/required_dynamic_sources_not_reconciled/);
});
test('failed child operation overrides an inconsistent green parent',async()=>{
  const results=cycle.results.map(row=>row.name==='ingestCaryObservedUsage'?{...row,ok:false}:row);
  const result=await invokeSessionRefresh({endpoint,trustedOrigin,machineKey:'fake-unit-test-key',
    fetchImpl:mock({...cycle,results,failed_sources:[],ok:true}),now:clocks()});
  assert.equal(result.state,'DEGRADED');
  assert.deepEqual(result.critical_failed_sources,['ingestCaryObservedUsage']);
});
test('missing, contradictory, or malformed historical source counts fail closed',async()=>{
  for(const watch of [
    {...cycle.historical_watch,eligible_source_count:null},
    {...cycle.historical_watch,probed_source_count:134},
    {...cycle.historical_watch,estimated_full_sweep_hours:null}
  ]){
    const result=await invokeSessionRefresh({endpoint,trustedOrigin,machineKey:'fake-unit-test-key',
      fetchImpl:mock({...cycle,historical_watch:watch}),now:clocks()});
    assert.equal(result.state,'DEGRADED');
  }
});

test('empty historical inventory or zero probes is not VERIFIED',async()=>{
  for(const watch of [
    {...cycle.historical_watch,eligible_source_count:0,probed_source_count:0,estimated_full_sweep_hours:0},
    {...cycle.historical_watch,probed_source_count:0}
  ]){
    const result=await invokeSessionRefresh({endpoint,trustedOrigin,machineKey:'fake-unit-test-key',fetchImpl:mock({...cycle,historical_watch:watch}),now:clocks()});
    assert.equal(result.state,'DEGRADED');
  }
});

test('unapproved HTTPS origin is rejected before sending the private machine key',async()=>{
  let called=0;
  const rogue='https://example-attacker.invalid/api/apps/69b9b64d86a732029ce0db81/functions/refreshSessionFreshness';
  assert.throws(()=>validateRefreshEndpoint(rogue,{trustedOrigin}),/refresh_endpoint_origin_not_admitted/);
  await assert.rejects(()=>invokeSessionRefresh({
    endpoint:rogue,trustedOrigin,machineKey:'fake-unit-test-key',
    fetchImpl:async()=>{called++;throw new Error('should-not-run')}
  }),/refresh_endpoint_origin_not_admitted/);
  assert.equal(called,0);
});
test('untrusted or malformed origin cannot pass explicit admission',()=>{
  assert.throws(()=>validateRefreshEndpoint(endpoint),/trusted_refresh_origin_required/);
  assert.throws(()=>validateRefreshEndpoint(endpoint,{trustedOrigin:'https://api.example.org/private'}),/trusted_refresh_origin_invalid/);
  assert.throws(()=>validateRefreshEndpoint(endpoint,{trustedOrigin:'http://api.example.org'}),/trusted_refresh_origin_invalid/);
  assert.throws(()=>validateRefreshEndpoint(endpoint,{trustedOrigin:'https://api.example.org.evil.invalid'}),/refresh_endpoint_origin_not_admitted/);
});
test('arbitrary remote errors cannot serialize the machine secret into the local ledger',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'owned-freshness-secret-test-'));
  try{
    const file=path.join(directory,'receipts.jsonl');
    const result=await runOwnedFreshnessOnce({endpoint,trustedOrigin,machineKey:'fake-unit-test-key',
      fetchImpl:async()=>{throw new Error('upstream error fake-unit-test-key https://private.example.net/')},
      now:()=>at,ledgerPath:file});
    assert.equal(result.state,'FAILED');
    assert.equal(result.error_code,'owned_refresh_invocation_failed');
    const raw=fs.readFileSync(file,'utf8');
    assert(!raw.includes('fake-unit-test-key'));
    assert(!raw.includes('private.example.net'));
  }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
