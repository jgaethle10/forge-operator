import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateRentalPreflight,simulateLifecycle} from './fallen-vast-rental-guard.mjs';
const quote={
  job:{mission:'evercraft-fallen-commercial-studio-flagship-20261027',ownerApproved:true,totalBudgetUsd:3,maxRuntimeHours:2,diskGb:24},
  source:{quotedAtUtc:'2026-10-27T17:00:00Z',provider:'Vast.ai',mode:'READ_ONLY'},
  offer:{id:40912225,gpu:'RTX 4090',gpuCount:1,usdPerHour:0.383,reliability:0.997,gpuRamMb:24564,cpuRamMb:32219},
  pricing:{storageUsdPerGbHour:0.002,egressUsdPerGb:0.05,egressMaxGb:1,ingressUsdPerGb:0,ingressMaxGb:1,otherMaxUsd:0.2},
  controls:{
    noOtherActiveMissionInstance:true,hostVerificationCheckedAtRental:true,
    providerBillingReadback:true,independentWatchdogActive:true,
    destroyPathTested:true,destroyFailureAlertAndRetry:true,
    orphanReconciliationReady:true,missionInstanceIdentityGuard:true,
    artifactExportReady:true,assetRightsVerified:true,
  }
};
const copy=x=>structuredClone(x);
const at=Date.parse('2026-10-27T17:05:00Z');
test('sample eligible quote is not creation authorization',()=>{
  const r=evaluateRentalPreflight(copy(quote),{nowMs:at});
  assert.equal(r.status,'ELIGIBLE_FOR_MANUAL_REVIEW');
  assert.equal(r.creationAuthorized,false);
  assert.equal(r.rentalStarted,false);
  assert.equal(r.computedEstimateUsd.total,1.112);
});
test('read-only historical discovery cannot authorize a rental',()=>{
  const i=copy(quote);
  i.source.quotedAtUtc='2026-10-27T16:22:14Z';
  i.controls.hostVerificationCheckedAtRental=false;
  i.controls.independentWatchdogActive=false;
  i.controls.providerBillingReadback=false;
  i.controls.assetRightsVerified=false;
  const r=evaluateRentalPreflight(i,{nowMs:Date.parse('2026-10-27T18:00:00Z')});
  assert.equal(r.status,'HOLD');
  for(const reason of ['quote_missing_or_stale','host_not_independently_verified','watchdog_not_independent','billing_not_metered','asset_rights_unknown'])assert.ok(r.blockers.includes(reason));
});
test('all provider fee components must be known, no guessed zeroes',()=>{
  for(const field of ['storageUsdPerGbHour','egressUsdPerGb','ingressUsdPerGb','otherMaxUsd']){
    const i=copy(quote); delete i.pricing[field];
    const r=evaluateRentalPreflight(i,{nowMs:at});
    assert.equal(r.status,'HOLD',field);
    assert.ok(r.blockers.includes('budget_bound_missing_or_exceeded'));
  }
});
test('budget and memory caps stop oversized rentals',()=>{
  const i=copy(quote);i.offer.usdPerHour=0.74;i.job.diskGb=32;i.pricing.otherMaxUsd=2;
  assert.ok(evaluateRentalPreflight(i,{nowMs:at}).blockers.includes('budget_bound_missing_or_exceeded'));
  i.offer.gpuRamMb=20000;
  assert.ok(evaluateRentalPreflight(i,{nowMs:at}).blockers.includes('gpu_ram_below_floor'));
});
test('missing independent watchdog or deletion receipt blocks even cheap machine',()=>{
  for(const key of ['destroyPathTested','destroyFailureAlertAndRetry','orphanReconciliationReady','missionInstanceIdentityGuard']){
    const i=copy(quote);i.controls[key]=false;
    assert.equal(evaluateRentalPreflight(i,{nowMs:at}).status,'HOLD',key);
  }
});
test('simulated successful lifecycle deletes exact created ID and verifies absence',async()=>{
  const seen=[];const client={
    create:async()=>({id:8675309}),
    render:async id=>{seen.push(['render',id])},
    destroy:async id=>{seen.push(['destroy',id])},
    exists:async id=>{seen.push(['exists',id]);return false},
  };
  const r=await simulateLifecycle({client,job:{},now:()=> 'test'});
  assert.equal(r.status,'FINISHED_DELETED');
  assert.deepEqual(seen,[['render',8675309],['destroy',8675309],['exists',8675309]]);
  assert.equal(r.providerMockOnly,true);
});
test('simulated render failure still deletes and verifies',async()=>{
  const seen=[];const client={
    create:async()=>({id:999}),
    render:async()=>{throw Error('render crashed')},
    destroy:async id=>{seen.push(id)},
    exists:async()=>false,
  };
  const r=await simulateLifecycle({client,job:{}});
  assert.equal(r.status,'JOB_FAILED_CLEANLY');
  assert.deepEqual(seen,[999]);
});
test('simulated destroy failure raises critical reconciliation, not success',async()=>{
  const client={
    create:async()=>({id:444}),
    render:async()=>{},
    destroy:async()=>{throw Error('provider unavailable')},
    exists:async()=>true,
  };
  const r=await simulateLifecycle({client,job:{}});
  assert.equal(r.status,'CRITICAL_RECONCILIATION_REQUIRED');
  assert.match(r.cleanupError,/unavailable/);
});
test('provider says destroy succeeded but resource still exists: critical',async()=>{
  const client={
    create:async()=>({id:445}),
    render:async()=>{},
    destroy:async()=>{},
    exists:async()=>true,
  };
  const r=await simulateLifecycle({client,job:{}});
  assert.equal(r.status,'CRITICAL_RECONCILIATION_REQUIRED');
  assert.match(r.cleanupError,/deletion_not_verified/);
});
test('create response lacks instance ID: possible orphan, never clean',async()=>{
  const client={create:async()=>({success:true}),render:async()=>{},destroy:async()=>{throw Error('should not be called')}};
  const r=await simulateLifecycle({client,job:{}});
  assert.equal(r.status,'CRITICAL_RECONCILIATION_REQUIRED');
  assert.equal(r.possibleOrphan,true);
});
