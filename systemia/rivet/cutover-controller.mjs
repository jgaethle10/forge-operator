const MODES=['legacy_only','shadow_owned','owned_primary','owned_only'];

const clean=(v)=>String(v??'').trim();
const ms=(v)=>{const n=Date.parse(String(v||''));return Number.isFinite(n)?n:null;};

function recent(receipt,nowMs,maxAgeMs){
  const at=ms(receipt?.created_at);
  return at!==null && nowMs-at>=0 && nowMs-at<=maxAgeMs;
}
function isOwnedSuccess(row){
  return row?.selected_runtime==='yard_owned' &&
    row?.result_state==='ready' &&
    row?.fallback_used!==true &&
    clean(row?.yard_report_id);
}
function isShadowSuccess(row){
  return row?.cutover_mode==='shadow_owned' &&
    row?.result_state==='ready_shadow_owned' &&
    row?.fallback_used!==true &&
    clean(row?.yard_report_id) &&
    !clean(row?.error_code);
}

export function evaluateRivetCutover({
  currentMode='legacy_only',
  runtimeReceipts=[],
  canaryReceipts=[],
  routeVerified=false,
  ownedStackHealthy=false,
  sourceSeedReconciled=false,
  now=new Date().toISOString(),
  policy={},
}={}){
  if(!MODES.includes(currentMode)) throw new Error('current_mode_invalid');
  const nowMs=ms(now);
  if(nowMs===null) throw new Error('now_invalid');
  const maxAgeMs=Math.max(60_000,Number(policy.max_age_ms||6*60*60*1000));
  const minShadow=Math.max(1,Number(policy.min_shadow_successes||6));
  const minOwned=Math.max(1,Number(policy.min_owned_successes||6));
  const requireTierCoverage=policy.require_tier_coverage!==false;
  const runtime=runtimeReceipts.filter(r=>recent(r,nowMs,maxAgeMs));
  const canaries=canaryReceipts.filter(r=>recent(r,nowMs,maxAgeMs));
  const failures=runtime.filter(r=>r?.result_state==='failed');
  const fallbacks=runtime.filter(r=>r?.fallback_used===true);
  const shadow=runtime.filter(isShadowSuccess);
  const owned=runtime.filter(isOwnedSuccess);
  const canaryReady=canaries.filter(r=>r?.generation_state==='ready'&&r?.route_verified===true&&r?.source_verified===true);
  const tiers=new Set(canaryReady.map(r=>clean(r?.report_type)).filter(Boolean));
  const tierCoverage=!requireTierCoverage || (
    tiers.has('preliminary_site_opportunity') &&
    tiers.has('full_site_opportunity')
  );
  const foundational=Boolean(routeVerified&&ownedStackHealthy&&sourceSeedReconciled);
  const zeroRecentFailures=failures.length===0;
  const zeroRecentFallbacks=fallbacks.length===0;

  let recommended=currentMode;
  let state='hold';
  const blockers=[];

  if(!routeVerified) blockers.push('public_route_not_verified');
  if(!ownedStackHealthy) blockers.push('owned_stack_not_healthy');
  if(!sourceSeedReconciled) blockers.push('source_seed_not_reconciled');
  if(!zeroRecentFailures) blockers.push('recent_runtime_failures');
  if(!zeroRecentFallbacks) blockers.push('recent_legacy_failback');
  if(!tierCoverage) blockers.push('preliminary_and_full_canary_coverage_required');

  if(currentMode==='legacy_only'){
    if(foundational){
      recommended='shadow_owned';
      state='promote_to_shadow';
    }
  }else if(currentMode==='shadow_owned'){
    if(foundational&&zeroRecentFailures&&zeroRecentFallbacks&&tierCoverage&&shadow.length>=minShadow&&canaryReady.length>=2){
      recommended='owned_primary';
      state='promote_to_owned_primary';
    }
  }else if(currentMode==='owned_primary'){
    if(foundational&&zeroRecentFailures&&zeroRecentFallbacks&&tierCoverage&&owned.length>=minOwned&&canaryReady.length>=2){
      recommended='owned_only';
      state='promote_to_owned_only';
    }
  }else if(currentMode==='owned_only'){
    recommended='owned_only';
    state=foundational&&zeroRecentFailures?'hold_owned_only':'owned_only_degraded';
  }

  return {
    schema:'evercraft.rivet.cutover-evaluation.v1',
    current_mode:currentMode,
    recommended_mode:recommended,
    state,
    auto_mutation_executed:false,
    policy:{
      max_age_ms:maxAgeMs,
      min_shadow_successes:minShadow,
      min_owned_successes:minOwned,
      require_tier_coverage:requireTierCoverage,
    },
    evidence:{
      recent_runtime_receipts:runtime.length,
      recent_failures:failures.length,
      recent_fallbacks:fallbacks.length,
      shadow_successes:shadow.length,
      owned_successes:owned.length,
      ready_canaries:canaryReady.length,
      canary_report_tiers:[...tiers].sort(),
      route_verified:Boolean(routeVerified),
      owned_stack_healthy:Boolean(ownedStackHealthy),
      source_seed_reconciled:Boolean(sourceSeedReconciled),
    },
    blockers,
    observed_at:now,
  };
}
