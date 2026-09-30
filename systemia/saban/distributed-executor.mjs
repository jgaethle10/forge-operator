import crypto from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assignmentForIndex } from './multiplier.mjs';
import { evaluateSwarmQuality } from './quality-gate.mjs';
import { runNodeSeedAssignmentPool } from './nodeseed-pool.mjs';
import { normalizeComputeDemand } from './compute-exchange.mjs';
import { acquireResourceCapacity } from './resource-acquirer.mjs';
import { buildComputeMarketAdapters } from './market-factory.mjs';

async function reconcileResults({ contract, plan, results, rootDir }) {
  if (contract.reconciler?.once_per_swarm !== true) {
    throw new Error('Distributed reconciliation requested but contract does not permit it.');
  }

  const adapterPath = path.resolve(rootDir, contract.adapter);
  const adapter = await import(pathToFileURL(adapterPath).href);
  const exportName = contract.reconciler?.adapter_export || 'reconcile';
  if (typeof adapter[exportName] !== 'function') {
    throw new Error(`Adapter ${contract.adapter} does not export ${exportName}()`);
  }

  return adapter[exportName]({
    plan,
    contract,
    rootDir,
    results
  });
}

const ACQUISITION_RETRYABLE_POOL_ERRORS=new Set([
  'no_eligible_nodeseed_capacity',
  'no_nodeseed_capacity_meets_resource_profile',
  'no_nodeseed_leases_granted',
]);

export function computeDemandFromDistributedPlan({
  contract,
  plan,
  acquisition={},
}={}){
  const resources=contract?.resources||{};
  return normalizeComputeDemand({
    demand_id:acquisition.demand_id||
      `distributed:${contract?.software_id||'unknown'}:${plan?.generated_at||Date.now()}`,
    workload_class:'saban.multiplier-assignment.v1',
    container_image:acquisition.container_image||null,
    cpu_units:acquisition.cpu_units||
      resources.minimum_node_cpu_units||
      resources.cpu_units_per_worker||
      1,
    memory_mb:acquisition.memory_mb||
      resources.minimum_node_memory_mb||
      resources.memory_mb_per_worker||
      512,
    storage_gb:acquisition.storage_gb||0,
    gpu_count:acquisition.gpu_count||0,
    gpu_models:acquisition.gpu_models||[],
    regions:acquisition.regions||[],
    countries:acquisition.countries||[],
    require_public_ingress:acquisition.require_public_ingress===true,
    require_persistent_storage:acquisition.require_persistent_storage===true,
    minimum_uptime_7d:acquisition.minimum_uptime_7d||0,
    audited_only:acquisition.audited_only===true,
    valid_version_only:acquisition.valid_version_only!==false,
    prefer_zero_cost:acquisition.prefer_zero_cost!==false,
    max_total_usd:acquisition.max_total_usd??null,
    max_hourly_usd:acquisition.max_hourly_usd??null,
    market_price_ceiling:acquisition.market_price_ceiling||{},
    duration_seconds:acquisition.duration_seconds||
      Math.max(300,Number(plan?.lease_seconds||300)),
    negotiation_level:acquisition.negotiation_level||'lease',
  });
}

export async function runPoolWithAcquisition({
  poolOptions,
  contract,
  plan,
  acquisition=null,
}={}){
  try{
    return {
      poolReceipt:await runNodeSeedAssignmentPool(poolOptions),
      acquisition:null,
    };
  }catch(error){
    const reason=String(error?.message||error);
    if(
      acquisition?.enabled!==true ||
      !ACQUISITION_RETRYABLE_POOL_ERRORS.has(reason)
    ){
      throw error;
    }

    const demand=computeDemandFromDistributedPlan({
      contract,
      plan,
      acquisition,
    });
    const need={
      need_id:demand.demand_id,
      workload_class:demand.workload_class,
      topology:'single_node',
      memory_semantics:'local',
      resources:{
        cpu_units:demand.resources.cpu_units,
        memory_mb:demand.resources.memory_mb,
        storage_gb:demand.resources.storage_gb,
        gpu_units:demand.resources.gpu_count,
        gpu_models:demand.resources.gpu_models,
        vram_mb:Number(acquisition.vram_mb||0),
      },
      required_labels:acquisition.required_labels||[],
      forbidden_labels:acquisition.forbidden_labels||[],
      required_transports:acquisition.required_transports||[],
      max_hourly_usd:demand.economics.max_hourly_usd,
      external_spend_requires_human_approval:true,
    };

    const marketFactory=buildComputeMarketAdapters({acquisition});
    const resourceAcquisition=await acquireResourceCapacity({
      need,
      candidates:acquisition.candidates||[],
      runtimeAuthorities:acquisition.runtimeAuthorities||{},
      spawnAdapters:acquisition.spawnAdapters||{},
      marketAdapters:marketFactory.adapters,
      quoteAuthority:acquisition.quoteAuthority||acquisition.quote_authority||null,
      leaseAuthority:acquisition.leaseAuthority||acquisition.lease_authority||null,
      computeDemand:demand,
    });

    if(
      resourceAcquisition.state!=='ready' ||
      !Array.isArray(resourceAcquisition.execution_leases) ||
      resourceAcquisition.execution_leases.length===0
    ){
      const held=new Error(
        resourceAcquisition.next_action==='reconcile_uncertain_external_lease_before_retry'
          ? 'compute_acquisition_reconciliation_required'
          : 'compute_acquisition_not_granted'
      );
      held.compute_negotiation=resourceAcquisition.exchange||null;
      held.resource_acquisition=resourceAcquisition;
      throw held;
    }

    const endpoints=resourceAcquisition.execution_leases.map((lease)=>String(lease.capacity_endpoint));
    const allocatorTokens={
      ...(poolOptions.allocatorTokens||{}),
    };
    for(const lease of resourceAcquisition.execution_leases){
      allocatorTokens[String(lease.capacity_endpoint)]=lease.runtime_authority.allocator_token;
    }

    const poolReceipt=await runNodeSeedAssignmentPool({
      ...poolOptions,
      endpoints,
      discover:false,
      allocatorToken:'',
      allocatorTokens,
    });
    return {
      poolReceipt,
      acquisition:{
        schema:'evercraft.saban.distributed-capacity-acquisition.v2',
        trigger_reason:reason,
        resource_acquisition_receipt:resourceAcquisition.receipt_hash,
        resource_mode:resourceAcquisition.mode,
        resource_field_receipt:resourceAcquisition.resource_field_receipt,
        acquired_endpoint_count:endpoints.length,
        market_factory:{
          markets:marketFactory.markets,
          diagnostics:marketFactory.diagnostics,
        },
        market:resourceAcquisition.exchange?.selected_offer?.market||
          resourceAcquisition.exchange?.selected_market||
          null,
        provider_id:resourceAcquisition.exchange?.selected_offer?.provider_id||
          resourceAcquisition.exchange?.selected_provider||
          null,
        negotiation_receipt:resourceAcquisition.exchange?.receipt_hash||
          resourceAcquisition.exchange?.negotiation_receipt||
          null,
        lease_receipts:resourceAcquisition.execution_leases
          .map((lease)=>lease.receipt_hash||lease.receipt||null)
          .filter(Boolean),
        execution_ready:true,
      },
    };
  }
}

function schedulerSummary(poolReceipt) {
  const completed = Number(poolReceipt.completed_assignments || 0);
  const failed = Number(poolReceipt.failed_assignments || 0);
  const results = poolReceipt.results || [];
  const durations = results
    .map((row) => Number(row?.duration_ms))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  const p95Index = durations.length
    ? Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1)
    : -1;

  return {
    total: Number(poolReceipt.requested_assignments || completed + failed),
    counts: {
      completed,
      ...(failed ? { dead_letter: failed } : {})
    },
    checkpointed: results.filter((row) => row?.checkpoint).length,
    retried: results.filter((row) => Number(row?.attempts || 0) > 1).length,
    timing: {
      measured_jobs: durations.length,
      total_duration_ms: durations.reduce((sum, value) => sum + value, 0),
      average_duration_ms: durations.length
        ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
        : null,
      p95_duration_ms: p95Index >= 0 ? durations[p95Index] : null
    }
  };
}

export async function executeDistributedMultiplicationPlan({
  contract,
  plan,
  workItems,
  rootDir = process.cwd(),
  reconcile = false,
  nodePool = {}
}) {
  const assignments = Array.from(
    { length: plan.logical_agents },
    (_, index) => assignmentForIndex(plan, workItems, index)
  );

  let prepareAssignment = null;
  if (contract.transport?.adapter) {
    const transportPath = path.resolve(rootDir, contract.transport.adapter);
    const transport = await import(pathToFileURL(transportPath).href);
    if (typeof transport.prepareRemoteAssignment !== 'function') {
      throw new Error(
        `Transport adapter ${contract.transport.adapter} must export prepareRemoteAssignment()`
      );
    }
    prepareAssignment = (context) =>
      transport.prepareRemoteAssignment({
        ...context,
        rootDir,
        contract
      });
  }

  const poolOptions={
    software: contract.software_id,
    assignments,
    endpoints: nodePool.endpoints || [],
    discover: nodePool.discover === true,
    discoveryOptions: nodePool.discoveryOptions || {},
    allocatorToken:
      nodePool.allocatorToken ||
      process.env.EVERCRAFT_ALLOCATOR_TOKEN ||
      '',
    allocatorTokens: nodePool.allocatorTokens || {},
    maxAttempts: Number(nodePool.maxAttempts || contract.max_attempts_per_job || 3),
    maxConcurrencyPerNode: Number(nodePool.maxConcurrencyPerNode || 2),
    timeoutMs: Number(nodePool.timeoutMs || 3000),
    assignmentTimeoutMs: Number(nodePool.assignmentTimeoutMs || 120000),
    requestedTtlMs: Number(nodePool.requestedTtlMs || Math.max(300000, plan.lease_seconds * 1000)),
    leaseRenewalIntervalMs: nodePool.leaseRenewalIntervalMs || null,
    artifactReturnRoot:
      nodePool.artifactReturnRoot ||
      path.resolve(rootDir, 'artifacts/saban-return', contract.software_id),
    resourceProfile: contract.resources || null,
    stageAuthorizedSources:
      !prepareAssignment &&
      contract.transport?.stage_authorized_sources === true,
    prepareAssignment,
    onEvent: nodePool.onEvent || null
  };
  const poolRun=await runPoolWithAcquisition({
    poolOptions,
    contract,
    plan,
    acquisition:nodePool.acquisition||null,
  });
  const poolReceipt=poolRun.poolReceipt;

  const results = (poolReceipt.results || [])
    .filter((row) => row?.status === 'completed')
    .map((row) => row?.result?.result)
    .filter(Boolean);

  let reconciliation = null;
  if (reconcile) {
    reconciliation = await reconcileResults({
      contract,
      plan,
      results,
      rootDir
    });
  }

  const scheduler = schedulerSummary(poolReceipt);
  const quality = evaluateSwarmQuality({
    contract,
    plan,
    results,
    schedulerSummary: scheduler,
    reconciliation
  });
  const resultsDigest = 'sha256:' + crypto
    .createHash('sha256')
    .update(JSON.stringify(results))
    .digest('hex');

  return {
    schema: 'evercraft.saban.distributed-multiplication-receipt.v1',
    generated_at: new Date().toISOString(),
    software_id: plan.software_id,
    logical_agents: plan.logical_agents,
    physical_workers: plan.physical_workers,
    work_item_count: plan.work_item_count,
    execution_fabric: 'evercraft.nodeseed-pool.v1',
    results_digest: resultsDigest,
    scheduler_summary: scheduler,
    pool_summary: {
      nodes: poolReceipt.nodes,
      rejected_nodes: poolReceipt.rejected_nodes,
      lease_failures: poolReceipt.lease_failures,
      failover_assignments: poolReceipt.failover_assignments,
      lease_renewals: poolReceipt.lease_renewals || null,
      portable_artifacts: Number(poolReceipt.portable_artifacts || 0),
      capacity_acquisition: poolRun.acquisition,
    },
    sample_results: results.slice(0, 24),
    reconciliation,
    quality,
    node_pool_receipt: poolReceipt
  };
}
