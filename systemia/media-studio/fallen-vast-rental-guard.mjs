/**
 * Fallen Studios / Vast rental admission. Pure logic; no provider calls.
 * Rental creation is deliberately NOT implemented here.
 *
 * The $3 owner allocation is NOT a provider-enforced hard spending limit.
 * A separate persistent watchdog with verified destruction is required.
 */
const n=x=>typeof x==='number'&&Number.isFinite(x)?x:NaN;
const yes=x=>x===true;
const money=x=>Math.round((x+Number.EPSILON)*10000)/10000;
export const POLICY=Object.freeze({
  mission:'evercraft-fallen-commercial-studio-flagship-20261027',
  maxAllocationUsd:3,
  maxGpuRateUsdHr:0.75,
  maxDurationHr:2,
  maxQuoteAgeMs:15*60*1000,
  maxDiskGb:32,
  minReliability:0.95,
  minGpuRamMb:23000,
  minCpuRamMb:32000,
});

export function evaluateRentalPreflight(input,{nowMs=Date.now()}={}){
  const failures=[];
  const fail=(code,ok)=>{if(!ok)failures.push(code)};
  const job=input?.job||{};
  const offer=input?.offer||{};
  const pricing=input?.pricing||{};
  const controls=input?.controls||{};
  const source=input?.source||{};
  fail('mission_invalid',job.mission===POLICY.mission);
  fail('owner_allocation_not_confirmed',yes(job.ownerApproved));
  fail('cost_cap_invalid',n(job.totalBudgetUsd)===POLICY.maxAllocationUsd);
  fail('instance_not_unique',yes(controls.noOtherActiveMissionInstance));
  const epoch=Date.parse(source.quotedAtUtc||'');
  fail('quote_missing_or_stale',Number.isFinite(epoch)&&Number.isFinite(nowMs)&&nowMs>=epoch&&nowMs-epoch<=POLICY.maxQuoteAgeMs);
  fail('quote_not_from_provider',source.provider==='Vast.ai'&&source.mode==='READ_ONLY');
  fail('offer_id_invalid',Number.isSafeInteger(offer.id)&&offer.id>0);
  fail('gpu_not_one_4090',offer.gpu==='RTX 4090'&&offer.gpuCount===1);
  fail('host_not_independently_verified',yes(controls.hostVerificationCheckedAtRental));
  fail('reliability_below_floor',n(offer.reliability)>=POLICY.minReliability);
  fail('gpu_ram_below_floor',n(offer.gpuRamMb)>=POLICY.minGpuRamMb);
  fail('cpu_ram_below_floor',n(offer.cpuRamMb)>=POLICY.minCpuRamMb);
  const rate=n(offer.usdPerHour),hours=n(job.maxRuntimeHours),disk=n(job.diskGb);
  fail('gpu_rate_exceeds_limit',Number.isFinite(rate)&&rate>0&&rate<=POLICY.maxGpuRateUsdHr);
  fail('runtime_outside_limit',Number.isFinite(hours)&&hours>0&&hours<=POLICY.maxDurationHr);
  fail('disk_outside_limit',Number.isFinite(disk)&&disk>0&&disk<=POLICY.maxDiskGb);
  fail('storage_rate_unknown',Number.isFinite(n(pricing.storageUsdPerGbHour))&&pricing.storageUsdPerGbHour>=0);
  fail('egress_price_or_bound_unknown',Number.isFinite(n(pricing.egressUsdPerGb))&&pricing.egressUsdPerGb>=0&&Number.isFinite(n(pricing.egressMaxGb))&&pricing.egressMaxGb>=0);
  fail('ingress_price_or_bound_unknown',Number.isFinite(n(pricing.ingressUsdPerGb))&&pricing.ingressUsdPerGb>=0&&Number.isFinite(n(pricing.ingressMaxGb))&&pricing.ingressMaxGb>=0);
  fail('other_charges_not_bounded',Number.isFinite(n(pricing.otherMaxUsd))&&pricing.otherMaxUsd>=0);
  fail('billing_not_metered',yes(controls.providerBillingReadback));
  fail('watchdog_not_independent',yes(controls.independentWatchdogActive));
  fail('delete_not_tested',yes(controls.destroyPathTested));
  fail('watchdog_no_retry_or_alert',yes(controls.destroyFailureAlertAndRetry));
  fail('orphan_reconciliation_missing',yes(controls.orphanReconciliationReady));
  fail('instance_identity_not_scoped',yes(controls.missionInstanceIdentityGuard));
  fail('output_not_durable_before_delete',yes(controls.artifactExportReady));
  fail('asset_rights_unknown',yes(controls.assetRightsVerified));

  const compute=Number.isFinite(rate*hours)?money(rate*hours):null;
  const storage=Number.isFinite(n(pricing.storageUsdPerGbHour)*disk*hours)?money(pricing.storageUsdPerGbHour*disk*hours):null;
  const network=Number.isFinite(n(pricing.egressUsdPerGb)*n(pricing.egressMaxGb)+n(pricing.ingressUsdPerGb)*n(pricing.ingressMaxGb))
    ?money(pricing.egressUsdPerGb*pricing.egressMaxGb+pricing.ingressUsdPerGb*pricing.ingressMaxGb):null;
  const other=Number.isFinite(n(pricing.otherMaxUsd))?money(pricing.otherMaxUsd):null;
  const estimatedMax=[compute,storage,network,other].every(v=>v!==null)?money(compute+storage+network+other):null;
  fail('budget_bound_missing_or_exceeded',estimatedMax!==null&&estimatedMax<=POLICY.maxAllocationUsd);

  return {
    schema:'evercraft.fallen.vast.rental-preflight.v1',
    status:failures.length?'HOLD':'ELIGIBLE_FOR_MANUAL_REVIEW',
    rentalStarted:false,
    creationAuthorized:false, // This pure function MUST NEVER authorize provider mutations.
    ownerAllocationUsd:POLICY.maxAllocationUsd,
    computedEstimateUsd:{compute,storage,network,other,total:estimatedMax},
    blockers:failures,
    disclaimer:'A planned bound is not a provider-enforced cap. No rental without independent watchdog and actual provider billing controls.'
  };
}

/**
 * Mockable cleanup lifecycle. Never call this using a production provider
 * until isolated resource identity and a separately scheduled watchdog exist.
 * Only cleans up the exact ID returned by this create call.
 */
export async function simulateLifecycle({client,job,now=()=>new Date().toISOString()}){
  let instanceId=null;
  const events=[];
  let primaryError=null,cleanupError=null,possibleOrphan=false;
  try{
    const created=await client.create(job);
    if(!Number.isSafeInteger(created?.id)||created.id<=0)throw Error('instance_identity_missing');
    instanceId=created.id;
    events.push({at:now(),event:'CREATED',instanceId});
    try{
      await client.render(instanceId,job);
      events.push({at:now(),event:'RENDERED',instanceId});
    }catch(e){
      primaryError=String(e.message||e);
      events.push({at:now(),event:'RENDER_FAILED',instanceId});
    }
  }catch(e){
    primaryError=String(e.message||e);
    possibleOrphan=true;
    events.push({at:now(),event:'CREATE_OR_ID_FAILED_ORPHAN_AUDIT_REQUIRED'});
  }finally{
    if(instanceId!==null){
      try{
        await client.destroy(instanceId);
        const live=await client.exists(instanceId);
        if(live!==false)throw Error('deletion_not_verified');
        events.push({at:now(),event:'DELETE_VERIFIED',instanceId});
      }catch(e){
        cleanupError=String(e.message||e);
        events.push({at:now(),event:'DELETE_UNVERIFIED_ALERT_REQUIRED',instanceId});
      }
    }
  }
  return {
    status:cleanupError||possibleOrphan?'CRITICAL_RECONCILIATION_REQUIRED':primaryError?'JOB_FAILED_CLEANLY':'FINISHED_DELETED',
    instanceId,primaryError,cleanupError,possibleOrphan,events,
    providerMockOnly:true
  };
}
