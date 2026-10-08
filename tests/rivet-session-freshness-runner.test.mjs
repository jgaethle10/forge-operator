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

test('only exact approved compatibility route can receive machine credential',()=>{
  assert.equal(validateRefreshEndpoint(ENDPOINT),ENDPOINT);
  assert.equal(validateRefreshEndpoint('http://aliev.base44.app/api/functions/refreshSessionFreshness'),null);
  assert.equal(validateRefreshEndpoint('https://evil.example/api/functions/refreshSessionFreshness'),null);
  assert.equal(validateRefreshEndpoint(ENDPOINT+'?token=abc'),null);
  assert.equal(validateRefreshEndpoint('https://aliev.base44.app@evil.example/api/functions/refreshSessionFreshness'),null);
});

test('holds if origin or machine key missing',async()=>{
  assert.equal((await runSessionFreshnessOnce({token:'k'})).state,'held_missing_refresh_url');
  assert.equal((await runSessionFreshnessOnce({url:ENDPOINT})).state,'held_missing_systemia_machine_key');
});

test('makes authenticated no-redirect POST and checks receipt',async()=>{
  let target,cfg;
  const response=await runSessionFreshnessOnce({
    url:ENDPOINT,token:'hidden',now:()=>NOW,
    fetchImpl:async(u,options)=>{target=u;cfg=options;return {ok:true,status:200,json:async()=>good()}}
  });
  assert.equal(response.ok,true);
  assert.equal(response.state,'verified');
  assert.equal(response.historical_sweep_hours,6);
  assert.equal(target,ENDPOINT);
  assert.equal(cfg.method,'POST');
  assert.equal(cfg.redirect,'manual');
  assert.equal(cfg.headers['x-systemia-machine-key'],'hidden');
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

test('holds on unauthorized source response without leaking credentials',async()=>{
  const result=await runSessionFreshnessOnce({
    url:ENDPOINT,token:'super-secret',fetchImpl:async()=>({ok:false,status:401})
  });
  assert.equal(result.state,'held_refresh_http_error');
  assert.equal(result.http_status,401);
  assert.equal(JSON.stringify(result).includes('super-secret'),false);
});
