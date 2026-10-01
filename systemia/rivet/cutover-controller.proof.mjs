import assert from 'node:assert/strict';
import { evaluateRivetCutover } from './cutover-controller.mjs';

const now='2026-09-30T21:00:00.000Z';
const shadowReceipts=Array.from({length:6},(_,i)=>({
  report_id:'shadow-'+i,address_norm:'site '+i,cutover_mode:'shadow_owned',
  selected_runtime:'base44_legacy',yard_configured:true,fallback_used:false,
  result_state:'ready_shadow_owned',yard_report_id:'yard-shadow-'+i,error_code:'',
  created_at:'2026-09-30T20:'+String(10+i).padStart(2,'0')+':00.000Z'
}));
const ownedReceipts=Array.from({length:6},(_,i)=>({
  report_id:'owned-'+i,address_norm:'site '+i,cutover_mode:'owned_primary',
  selected_runtime:'yard_owned',yard_configured:true,fallback_used:false,
  result_state:'ready',yard_report_id:'yard-owned-'+i,error_code:'',
  created_at:'2026-09-30T20:'+String(30+i).padStart(2,'0')+':00.000Z'
}));
const canaries=[
  {report_type:'preliminary_site_opportunity',generation_state:'ready',route_verified:true,source_verified:true,created_at:'2026-09-30T20:40:00.000Z'},
  {report_type:'full_site_opportunity',generation_state:'ready',route_verified:true,source_verified:true,created_at:'2026-09-30T20:41:00.000Z'}
];

const shadow=evaluateRivetCutover({
  currentMode:'shadow_owned',runtimeReceipts:shadowReceipts,canaryReceipts:canaries,
  routeVerified:true,ownedStackHealthy:true,sourceSeedReconciled:true,now
});
assert.equal(shadow.recommended_mode,'owned_primary');
assert.equal(shadow.state,'promote_to_owned_primary');
assert.equal(shadow.evidence.shadow_successes,6);

const owned=evaluateRivetCutover({
  currentMode:'owned_primary',runtimeReceipts:ownedReceipts,canaryReceipts:canaries,
  routeVerified:true,ownedStackHealthy:true,sourceSeedReconciled:true,now
});
assert.equal(owned.recommended_mode,'owned_only');
assert.equal(owned.state,'promote_to_owned_only');

const failure=evaluateRivetCutover({
  currentMode:'owned_primary',
  runtimeReceipts:[...ownedReceipts,{...ownedReceipts[0],report_id:'failed',result_state:'failed',selected_runtime:'yard_owned',created_at:'2026-09-30T20:55:00.000Z'}],
  canaryReceipts:canaries,routeVerified:true,ownedStackHealthy:true,sourceSeedReconciled:true,now
});
assert.equal(failure.recommended_mode,'owned_primary');
assert.equal(failure.state,'hold');
assert.ok(failure.blockers.includes('recent_runtime_failures'));

const fallback=evaluateRivetCutover({
  currentMode:'shadow_owned',
  runtimeReceipts:[...shadowReceipts,{...shadowReceipts[0],report_id:'fallback',fallback_used:true,created_at:'2026-09-30T20:56:00.000Z'}],
  canaryReceipts:canaries,routeVerified:true,ownedStackHealthy:true,sourceSeedReconciled:true,now
});
assert.equal(fallback.recommended_mode,'shadow_owned');
assert.ok(fallback.blockers.includes('recent_legacy_failback'));

const missingTier=evaluateRivetCutover({
  currentMode:'shadow_owned',runtimeReceipts:shadowReceipts,canaryReceipts:[canaries[0]],
  routeVerified:true,ownedStackHealthy:true,sourceSeedReconciled:true,now
});
assert.equal(missingTier.recommended_mode,'shadow_owned');
assert.ok(missingTier.blockers.includes('preliminary_and_full_canary_coverage_required'));

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.rivet.cutover-controller-proof.v1',
  shadow_requires_receipts:true,
  owned_primary_requires_zero_recent_failures:true,
  owned_only_requires_zero_failbacks:true,
  preliminary_and_full_tier_canaries_required:true,
  route_health_and_seed_reconciliation_required:true,
  automatic_mutation:false,
},null,2));
