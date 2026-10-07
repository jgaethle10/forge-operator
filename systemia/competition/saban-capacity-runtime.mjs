import { createHash } from "node:crypto";
import { normalizeComputeDemand, negotiateCompute } from "../saban/compute-exchange.mjs";
import { createEvercraftBrokerMarketAdapter } from "../saban/markets/evercraft-broker.mjs";

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
    container_image:"ghcr.io/jgaethle10/evercraft-browser-worker:latest",
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

export async function discoverCompetitionWorkerCapacity({
  yard,
  brokerDeploymentId,
  demand=competitionWorkerDemand(),
}={}){
  if(!yard) throw new Error("competition_capacity_yard_required");
  if(!brokerDeploymentId) throw new Error("competition_capacity_broker_deployment_required");

  const adapter=createEvercraftBrokerMarketAdapter({yard,brokerDeploymentId});
  const leaseAuthority={
    schema:"evercraft.saban.compute-authority.v1",
    approved:true,
    demand_id:demand.demand_id,
    allowed_markets:["evercraft-broker"],
    allow_spend:false,
    max_total_usd:0,
  };
  const negotiation=await negotiateCompute({
    demand,
    adapters:[adapter],
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
      return receipt("held_lease_renewal_failed",{
        deployment_id:deploymentId,
        workload_class:demand.workload_class,
        capacity_node_id:existing.receipt?.capacity_node_id||null,
        deployment_receipt_hash:existing.receipt?.receipt_hash||null,
        error_code:String(error?.message||"lease_renewal_failed").slice(0,160),
        next_action:"repair_or_reacquire_competition_capacity",
      });
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
  });
}
