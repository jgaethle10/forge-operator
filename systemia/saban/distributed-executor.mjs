import crypto from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assignmentForIndex } from './multiplier.mjs';
import { evaluateSwarmQuality } from './quality-gate.mjs';
import { runNodeSeedAssignmentPool } from './nodeseed-pool.mjs';

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

  const poolReceipt = await runNodeSeedAssignmentPool({
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
  });

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
      portable_artifacts: Number(poolReceipt.portable_artifacts || 0)
    },
    sample_results: results.slice(0, 24),
    reconciliation,
    quality,
    node_pool_receipt: poolReceipt
  };
}
