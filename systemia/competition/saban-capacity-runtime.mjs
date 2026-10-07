import { createHash } from "node:crypto";
import { normalizeComputeDemand, negotiateCompute } from "../saban/compute-exchange.mjs";
import { createEvercraftBrokerMarketAdapter } from "../saban/markets/evercraft-broker.mjs";
import { createEvercraftYardMarketAdapter } from "../saban/markets/evercraft-yard.mjs";

const sha256=(value)=>"sha256:"+createHash("sha256").update(
  typeof value==="string"?value:JSON.stringify(value)
).digest("hex");

export function competitionWorkerDemand({
  demandId="evercraft-production-competition-worker",
  leaseSeconds=1800,
}={}){
  return normalizeComputeDemand({
    demand_id:demandId,
    workload_class:"systemia.evercraft-web-browser.v1",
    container_image:"ghcr.io/jgaethle10/evercraft-browser-worker:main",
    cpu_units:2,
    memory_mb:3072,
    storage_gb:10,
    require_persistent_storage:true,
    minimum_uptime_7d:0.95,
    valid_version_only:true,
    negotiation_level:"lease",
    prefer_zero_cost:true,
    max_total_usd:0,
    max_hourly_usd:0,
    duration_seconds:Math.max(300,Number(leaseSeconds||1800)),
  });
}

function receipt(state,extra={}){
  const body={
    schema:"evercraft.systemia.competition-saban-capacity.v1",
    state,
    route:["systemia","competition_control_plane","saban","yard","evercraft_compute"],
    zero_spend_only:true,
    paid_market_order_authorized:false,
    paid_lease_authorized:false,
    payment_attempted:false,
    authority_material_persisted:false,
    base44_used:false,
    observed_at:new Date().toISOString(),
    ...extra,
  };
  return {...body,receipt_hash:sha256(body)};
}

const READY_CAPACITY_STATES=new Set([
  "deployed_zero_spend_capacity",
  "renewed_ready",
  "already_ready",
]);

const SAFE_NEXT_ACTIONS=new Set([
  "continue_saban_capacity_discovery",
  "bind_current_browser_worker_release",
  "repair_yard_lease_renewal",
  "repair_or_reacquire_competition_capacity",
]);

export function buildCompetitionCapacityMissionSnapshot(
  capacityReceipt={},
  previousSnapshot=null
){
  const capacityState=String(capacityReceipt?.state||"unknown");
  const ready=READY_CAPACITY_STATES.has(capacityState);
  const nextAction=SAFE_NEXT_ACTIONS.has(String(capacityReceipt?.next_action||""))
    ? String(capacityReceipt.next_action)
    : null;
  const evidenceRefs=[
    capacityReceipt?.receipt_hash,
    capacityReceipt?.deployment_receipt_hash,
    capacityReceipt?.lease_renewal_receipt_hash,
    capacityReceipt?.negotiation_receipt_hash,
  ].filter((value)=>typeof value==="string"&&value.startsWith("sha256:"));
  const previousState=String(previousSnapshot?.capacity_state||"");
  const previousAction=String(previousSnapshot?.next_action||"");
  const materialChange=
    !previousSnapshot ||
    previousState!==capacityState ||
    previousAction!==String(nextAction||"");

  return {
    schema:"evercraft.kaidance.mission-snapshot.v1",
    snapshot_ref:"competition-saban-capacity:"+sha256({
      capacity_state:capacityState,
      next_action:nextAction,
      evidence_refs:evidenceRefs,
    }).slice("sha256:".length,24),
    observed_at:capacityReceipt?.observed_at||new Date().toISOString(),
    mission_key:"competition-autonomous-capacity-v1",
    workflow_key:"competition-saban-capacity",
    state:ready?"healthy":"held",
    capacity_state:capacityState,
    workload_class:"systemia.evercraft-web-browser.v1",
    zero_spend_capacity_ready:ready,
    paid_capacity_authorized:false,
    founder_action_required:false,
    human_gate_required:false,
    next_action:nextAction,
    counts:{
      scanned:Math.max(1,Number(capacityReceipt?.discovered_offer_count||0)),
      changed:materialChange?1:0,
      admitted:ready&&materialChange?1:0,
      held:!ready&&materialChange?1:0,
    },
    evidence_refs:evidenceRefs,
    privacy:{
      node_identity_exposed:false,
      capacity_endpoint_exposed:false,
      allocator_authority_exposed:false,
      provider_identity_exposed:false,
    },
    material_change:materialChange,
  };
}

export async function discoverCompetitionWorkerCapacity({
  yard,
  brokerDeploymentId,
  demand=competitionWorkerDemand(),
}={}){
  if(!yard) throw new Error("competition_capacity_yard_required");

  const adapters=[
    createEvercraftYardMarketAdapter({yard}),
  ];
  const allowedMarkets=["evercraft-yard"];
  if(String(brokerDeploymentId||"").trim()){
    adapters.push(createEvercraftBrokerMarketAdapter({
      yard,
      brokerDeploymentId:String(brokerDeploymentId).trim(),
    }));
    allowedMarkets.push("evercraft-broker");
  }
  const leaseAuthority={
    schema:"evercraft.saban.compute-authority.v1",
    approved:true,
    demand_id:demand.demand_id,
    allowed_markets:allowedMarkets,
    allow_spend:false,
    max_total_usd:0,
  };
  const negotiation=await negotiateCompute({
    demand,
    adapters,
    leaseAuthority,
  });

  if(!negotiation.lease?.execution_ready){
    return {
      state:"held_no_authorized_zero_spend_capacity",
      demand,
      negotiation,
      lease:null,
    };
  }

  return {
    state:"capacity_acquired",
    demand,
    negotiation,
    lease:negotiation.lease,
  };
}

export async function ensureCompetitionBrowserCapacity({
  yard,
  brokerDeploymentId,
  deploymentId="competition-browser-worker",
  releaseRef="",
  rollbackTarget="",
  leaseTtlMs=30*60_000,
}={}){
  if(!yard) throw new Error("competition_capacity_yard_required");
  const demand=competitionWorkerDemand({
    leaseSeconds:Math.ceil(Number(leaseTtlMs||30*60_000)/1000),
  });

  let staleRecovery=null;
  const existing=typeof yard.deploymentStatus==="function"
    ? yard.deploymentStatus(deploymentId)
    : null;
  if(
    existing?.state==="ready" &&
    existing?.receipt?.workload_class===demand.workload_class
  ){
    if(typeof yard.renewDeploymentLease!=="function"){
      return receipt("held_lease_renewal_unavailable",{
        deployment_id:deploymentId,
        workload_class:demand.workload_class,
        capacity_node_id:existing.receipt?.capacity_node_id||null,
        deployment_receipt_hash:existing.receipt?.receipt_hash||null,
        next_action:"repair_yard_lease_renewal",
      });
    }
    try{
      const renewed=await yard.renewDeploymentLease(deploymentId,{
        ttlMs:Number(leaseTtlMs||30*60_000),
      });
      return receipt("renewed_ready",{
        deployment_id:deploymentId,
        workload_class:demand.workload_class,
        capacity_node_id:existing.receipt?.capacity_node_id||null,
        deployment_receipt_hash:existing.receipt?.receipt_hash||null,
        health_state:existing.receipt?.health_state||null,
        lease_expires_at:renewed?.expires_at||null,
        lease_renewal_receipt_hash:renewed?.receipt_hash||null,
      });
    }catch(error){
      const errorCode=String(error?.message||"lease_renewal_failed").slice(0,160);
      let stopState="not_attempted";
      if(typeof yard.stopDeployment==="function"){
        try{
          await yard.stopDeployment(deploymentId,{
            reason:"competition_lease_renewal_failed",
          });
          stopState="stopped";
        }catch{
          stopState="stop_failed";
        }
      }

      if(typeof yard.invalidateDeployment!=="function"){
        return receipt("held_lease_renewal_failed",{
          deployment_id:deploymentId,
          workload_class:demand.workload_class,
          capacity_node_id:existing.receipt?.capacity_node_id||null,
          deployment_receipt_hash:existing.receipt?.receipt_hash||null,
          error_code:errorCode,
          stop_state:stopState,
          next_action:"repair_or_reacquire_competition_capacity",
        });
      }

      try{
        const invalidated=yard.invalidateDeployment(deploymentId,{
          reason:"competition_lease_renewal_failed",
          evidence:{
            error_code:errorCode,
            stop_state:stopState,
          },
        });
        if(invalidated?.ok!==true){
          return receipt("held_lease_renewal_failed",{
            deployment_id:deploymentId,
            workload_class:demand.workload_class,
            capacity_node_id:existing.receipt?.capacity_node_id||null,
            deployment_receipt_hash:existing.receipt?.receipt_hash||null,
            error_code:errorCode,
            stop_state:stopState,
            next_action:"repair_or_reacquire_competition_capacity",
          });
        }
        staleRecovery={
          previous_deployment_receipt_hash:
            existing.receipt?.receipt_hash||null,
          invalidation_receipt_hash:invalidated.receipt_hash||null,
          stop_state:stopState,
          error_code:errorCode,
        };
      }catch(invalidationError){
        return receipt("held_lease_renewal_failed",{
          deployment_id:deploymentId,
          workload_class:demand.workload_class,
          capacity_node_id:existing.receipt?.capacity_node_id||null,
          deployment_receipt_hash:existing.receipt?.receipt_hash||null,
          error_code:errorCode,
          invalidation_error_code:String(
            invalidationError?.message||"deployment_invalidation_failed"
          ).slice(0,160),
          stop_state:stopState,
          next_action:"repair_or_reacquire_competition_capacity",
        });
      }
    }
  }

  const immutableRelease=String(releaseRef||"").trim();
  if(!immutableRelease){
    return receipt("held_immutable_release_missing",{
      deployment_id:deploymentId,
      workload_class:demand.workload_class,
      demand_hash:demand.demand_hash,
      next_action:"bind_current_browser_worker_release",
    });
  }

  const acquired=await discoverCompetitionWorkerCapacity({
    yard,
    brokerDeploymentId,
    demand,
  });
  if(acquired.state!=="capacity_acquired"){
    return receipt(acquired.state,{
      deployment_id:deploymentId,
      workload_class:demand.workload_class,
      demand_hash:demand.demand_hash,
      discovered_offer_count:acquired.negotiation.discovered_offer_count,
      eligible_offer_count:acquired.negotiation.eligible_offer_count,
      negotiation_receipt_hash:acquired.negotiation.receipt_hash,
      stale_deployment_invalidated:staleRecovery!==null,
      stale_invalidation_receipt_hash:
        staleRecovery?.invalidation_receipt_hash||null,
      next_action:"continue_saban_capacity_discovery",
    });
  }

  const allocatorToken=acquired.lease?.runtime_authority?.allocator_token||"";
  if(!acquired.lease.capacity_endpoint||!allocatorToken){
    return receipt("held_capacity_runtime_authority_missing",{
      deployment_id:deploymentId,
      workload_class:demand.workload_class,
      demand_hash:demand.demand_hash,
      acquired_provider_id:acquired.lease.provider_id||null,
      negotiation_receipt_hash:acquired.negotiation.receipt_hash,
    });
  }

  const deployed=await yard.deployRelease({
    deploymentId,
    releaseRef:immutableRelease,
    workloadClass:demand.workload_class,
    capacityEndpoint:acquired.lease.capacity_endpoint,
    input:{
      competition_mode:true,
      final_submission_authority:false,
      new_terms_authority:false,
      payment_authority:false,
      staking_authority:false,
    },
    rollbackTarget:String(rollbackTarget||immutableRelease),
    leaseTtlMs:Number(leaseTtlMs||30*60_000),
    allocatorToken,
  });

  return receipt("deployed_zero_spend_capacity",{
    deployment_id:deploymentId,
    workload_class:demand.workload_class,
    demand_hash:demand.demand_hash,
    acquired_provider_id:acquired.lease.provider_id||null,
    capacity_node_id:deployed.receipt?.capacity_node_id||null,
    negotiation_receipt_hash:acquired.negotiation.receipt_hash,
    deployment_receipt_hash:deployed.receipt?.receipt_hash||null,
    health_state:deployed.receipt?.health_state||null,
    route_verification:deployed.receipt?.route_verification||null,
    stale_deployment_recovered:staleRecovery!==null,
    stale_invalidation_receipt_hash:
      staleRecovery?.invalidation_receipt_hash||null,
    previous_deployment_receipt_hash:
      staleRecovery?.previous_deployment_receipt_hash||null,
  });
}
