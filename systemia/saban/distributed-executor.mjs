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
  return {
    total: Number(poolReceipt.requested_assignments || completed + failed),
    counts: {
      completed,
      ...(failed ? { dead_letter: failed } : {})
    },
    checkpointed: results.filter((row) => row?.checkpoint).length,
    retried: results.filter((row) => Number(row?.attempts || 0) > 1).length
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
    resourceProfile: contract.resources || null,
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
      failover_assignments: poolReceipt.failover_assignments
    },
    sample_results: results.slice(0, 24),
    reconciliation,
    quality,
    node_pool_receipt: poolReceipt
  };
}
