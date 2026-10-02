import crypto from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assignmentForIndex } from './multiplier.mjs';
import { evaluateSwarmQuality } from './quality-gate.mjs';
import { runNodeSeedAssignmentPool } from './nodeseed-pool.mjs';
import { negotiateCompute, normalizeComputeDemand } from './compute-exchange.mjs';

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

async function runNegotiatedAdapterPool({
  adapter,
  lease,
  poolOptions,
}={}){
  if(!adapter||typeof adapter.execute!=='function'){
    throw new Error('acquired_adapter_execution_not_supported');
  }
  const assignments=poolOptions.assignments||[];
  const results=new Array(assignments.length);
  const failures=[];
  const events=[];
  let cursor=0;
  const workerCount=Math.max(
    1,
    Math.min(
      assignments.length,
      Math.max(1,Number(poolOptions.maxConcurrencyPerNode||1))
    )
  );

  async function worker(){
    while(true){
      const index=cursor++;
      if(index>=assignments.length) return;
      const assignment=assignments[index];
      const startedAt=Date.now();
      try{
        const response=await adapter.execute({
          lease,
          workload_class:'saban.multiplier-assignment.v1',
          input:{
            software:poolOptions.software,
            assignment,
          },
          idempotency_key:assignment.idempotency_key||null,
          checkpoint:null,
          timeoutMs:poolOptions.assignmentTimeoutMs||120000,
        });
        const duration=Math.max(0,Date.now()-startedAt);
        results[index]={
          status:'completed',
          assignment,
          idempotency_key:assignment.idempotency_key||null,
          node_id:lease.provider_id||'negotiated-provider',
          attempts:1,
          duration_ms:duration,
          failover:false,
          checkpoint:response?.checkpoint||null,
          result:response?.result??null,
          compute_receipt:response?.result_receipt||lease.receipt||null,
          deduplicated:false,
          artifacts:[],
        };
        events.push({
          type:'assignment.completed',
          agent_id:assignment.agent_id,
          node_id:lease.provider_id||'negotiated-provider',
          attempts:1,
          duration_ms:duration,
          execution_fabric:'negotiated_adapter',
        });
      }catch(error){
        const duration=Math.max(0,Date.now()-startedAt);
        const reason=String(error?.message||error);
        results[index]={
          status:'failed',
          assignment,
          idempotency_key:assignment.idempotency_key||null,
          attempts:1,
          duration_ms:duration,
          last_node_id:lease.provider_id||'negotiated-provider',
          reason,
        };
        failures.push({
          assignment,
          attempts:1,
          last_node_id:lease.provider_id||'negotiated-provider',
          reason,
        });
        events.push({
          type:'node.assignment.failed',
          agent_id:assignment.agent_id,
          node_id:lease.provider_id||'negotiated-provider',
          attempt:1,
          reason,
          execution_fabric:'negotiated_adapter',
        });
      }
    }
  }

  try{
    await Promise.all(Array.from({length:workerCount},()=>worker()));
  }finally{
    if(typeof adapter.release==='function'){
      try{await adapter.release({lease});}
      catch(error){
        events.push({
          type:'lease.release.failed',
          reason:String(error?.message||error),
          execution_fabric:'negotiated_adapter',
        });
      }
    }
  }

  const completed=results.filter((row)=>row?.status==='completed');
  return {
    schema:'evercraft.saban.negotiated-adapter-pool-receipt.v1',
    generated_at:new Date().toISOString(),
    software:poolOptions.software,
    requested_assignments:assignments.length,
    completed_assignments:completed.length,
    failed_assignments:failures.length,
    failover_assignments:0,
    nodes:[{
      node_id:lease.provider_id||'negotiated-provider',
      endpoint:null,
      capacity_hint:null,
      placement_labels:['negotiated','adapter-execution'],
      node_attestation_verified:false,
      device_fingerprint:null,
      field_claim:null,
      healthy_at_end:failures.length===0,
    }],
    rejected_nodes:[],
    lease_failures:[],
    events,
    lease_renewals:null,
    portable_artifacts:0,
    results,
    failures,
  };
}

async function runPoolWithAcquisition({
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
    const negotiation=await negotiateCompute({
      demand,
      adapters:acquisition.adapters||[],
      quoteAuthority:acquisition.quoteAuthority||null,
      leaseAuthority:acquisition.leaseAuthority||null,
    });
    const lease=negotiation.lease;
    if(!lease){
      const held=new Error('compute_acquisition_not_granted');
      held.compute_negotiation=negotiation;
      throw held;
    }
    const selectedMarket=String(
      negotiation.selected_offer?.market||lease.market||''
    ).toLowerCase();
    const selectedAdapter=(acquisition.adapters||[]).find((adapter)=>
      String(adapter?.market||'').toLowerCase()===selectedMarket
    );

    if(
      lease.execution_ready===true &&
      lease.capacity_endpoint &&
      lease.runtime_authority?.allocator_token
    ){
      const acquiredEndpoint=String(lease.capacity_endpoint);
      const allocatorTokens={
        ...(poolOptions.allocatorTokens||{}),
        [acquiredEndpoint]:lease.runtime_authority.allocator_token,
      };
      const poolReceipt=await runNodeSeedAssignmentPool({
        ...poolOptions,
        endpoints:[acquiredEndpoint],
        discover:false,
        allocatorToken:'',
        allocatorTokens,
      });
      return {
        poolReceipt,
        acquisition:{
          schema:'evercraft.saban.distributed-capacity-acquisition.v1',
          trigger_reason:reason,
          demand_hash:demand.demand_hash,
          market:selectedMarket||null,
          provider_id:negotiation.selected_offer?.provider_id||null,
          negotiation_receipt:negotiation.receipt_hash,
          lease_receipt:lease.receipt||null,
          execution_ready:true,
          execution_fabric:'evercraft.nodeseed-pool.v1',
        },
      };
    }

    if(
      lease.execution_ready===true &&
      selectedAdapter &&
      typeof selectedAdapter.execute==='function'
    ){
      const poolReceipt=await runNegotiatedAdapterPool({
        adapter:selectedAdapter,
        lease,
        poolOptions,
      });
      return {
        poolReceipt,
        acquisition:{
          schema:'evercraft.saban.distributed-capacity-acquisition.v1',
          trigger_reason:reason,
          demand_hash:demand.demand_hash,
          market:selectedMarket||null,
          provider_id:negotiation.selected_offer?.provider_id||null,
          negotiation_receipt:negotiation.receipt_hash,
          lease_receipt:lease.receipt||null,
          execution_ready:true,
          execution_fabric:'evercraft.negotiated-adapter-pool.v1',
        },
      };
    }

    const pending=new Error('acquired_compute_not_execution_ready');
    pending.compute_negotiation=negotiation;
    throw pending;
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
    execution_fabric:
      poolRun.acquisition?.execution_fabric ||
      'evercraft.nodeseed-pool.v1',
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
