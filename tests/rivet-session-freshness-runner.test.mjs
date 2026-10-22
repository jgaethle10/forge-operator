import test from 'node:test';
import assert from 'node:assert/strict';
import {assessFreshnessReceipt,runSessionFreshnessOnce,validateRefreshEndpoint} from '../systemia/organism/rivet-session-freshness-runner.mjs';

const ENDPOINT='https://aliev.base44.app/api/functions/refreshSessionFreshness';
const NOW=Date.parse('2026-10-08T01:50:00Z');
const good=()=>({
  ok:true,state:'refreshed',refreshed_at:'2026-10-08T01:48:00Z',
  receipt_source_record_id:'a-real-receipt',
  results:[{name:'nyc',ok:true},{name:'penndot',ok:true}],
  historical_watch:{
    eligible_source_count:133,probed_source_count:23,estimated_full_sweep_hours:6,
    inventory_may_be_truncated:false,warning_count:0
  }
});

test('no old provider or unverified replacement route is allowed to receive a machine credential',()=>{
 assert.equal(validateRefreshEndpoint(ENDPOINT),null);
 assert.equal(validateRefreshEndpoint('https://fabric.systemiacommandcenters.com/not-yet-admitted'),null);
 assert.equal(validateRefreshEndpoint('https://evil.example/refresh'),null);
});

test('hourly session refresh remains held until independently attested owned ingest',async()=>{
 for(const url of [undefined,ENDPOINT,'https://fabric.systemiacommandcenters.com/not-yet-admitted']){
  let requests=0;
  const response=await runSessionFreshnessOnce({url,token:'not-exported',
   fetchImpl:async()=>{requests++;throw Error('Forbidden network request');}});
  assert.equal(response.ok,false);
  assert.equal(response.state,'held_owned_freshness_source_required');
  assert.equal(response.receipt_verified,false);
  assert.equal(response.external_requests,0);
  assert.equal(requests,0);
  assert.equal(JSON.stringify(response).includes('not-exported'),false);
 }
});

test('never claims receipt verified on recent skip',()=>{
  const v=assessFreshnessReceipt({ok:true,state:'skipped_recent_cycle',last_refreshed_at:'2026-10-08T01:48:00Z'},NOW);
  assert.equal(v.state,'recent_cycle_skipped');
  assert.equal(v.receipt_verified,false);
});

test('fails closed on missing receipt, source failure, stale data or truncated inventory',()=>{
  const noReceipt=good();delete noReceipt.receipt_source_record_id;
  assert.equal(assessFreshnessReceipt(noReceipt,NOW).state,'held_missing_receipt_id');
  const fail=good();fail.results.push({name:'nyc-raw',ok:false});
  assert.equal(assessFreshnessReceipt(fail,NOW).state,'held_partial_dynamic_refresh');
  const stale=good();stale.refreshed_at='2026-10-01T00:00:00Z';
  assert.equal(assessFreshnessReceipt(stale,NOW).state,'held_bad_refresh_timestamp');
  const trunc=good();trunc.historical_watch.inventory_may_be_truncated=true;
  assert.equal(assessFreshnessReceipt(trunc,NOW).state,'held_historical_inventory_truncated');
});

test('history warnings remain warnings, not fabricated clean success',()=>{
  const payload=good();payload.historical_watch.warning_count=2;
  const result=assessFreshnessReceipt(payload,NOW);
  assert.equal(result.ok,true);
  assert.equal(result.state,'verified_with_historical_warnings');
  assert.equal(result.historical_watch_warnings,2);
});

