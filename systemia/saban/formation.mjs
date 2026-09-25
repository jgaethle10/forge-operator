#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  loadMultiplicationRegistry,
  resolveMultiplicationContract,
  loadWorkItems,
  loadPrivateInventory,
  expandPartitionedWorkItems,
  buildMultiplicationPlan,
  executeMultiplicationPlan
} from './multiplier.mjs';
import { recommendFormation } from './autoscaler.mjs';
import { admitMultiplicationRequest } from './admission.mjs';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function argValue(argv, flag, fallback = null) {
  const index = argv.indexOf(flag);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

function hasFlag(argv, flag) {
  return argv.includes(flag);
}

function safeId(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'formation';
}

export function topologicalOrder(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const children = new Map(nodes.map((node) => [node.id, []]));

  for (const node of nodes) {
    for (const dependency of node.depends_on || []) {
      if (!byId.has(dependency)) {
        throw new Error(`Unknown dependency ${dependency} for node ${node.id}`);
      }
      indegree.set(node.id, indegree.get(node.id) + 1);
      children.get(dependency).push(node.id);
    }
  }

  const queue = [...nodes]
    .filter((node) => indegree.get(node.id) === 0)
    .map((node) => node.id)
    .sort();

  const ordered = [];
  while (queue.length) {
    const id = queue.shift();
    ordered.push(id);
    for (const child of children.get(id) || []) {
      indegree.set(child, indegree.get(child) - 1);
      if (indegree.get(child) === 0) {
        queue.push(child);
        queue.sort();
      }
    }
  }

  if (ordered.length !== nodes.length) {
    throw new Error('Formation dependency graph contains a cycle.');
  }
  return ordered;
}

export function planFormation({ request, rootDir = process.cwd() }) {
  if (!request || !Array.isArray(request.nodes) || request.nodes.length === 0) {
    throw new Error('Formation request must contain nodes.');
  }

  const ids = request.nodes.map((node) => node.id);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    throw new Error('Formation node ids must be present and unique.');
  }

  const registry = loadMultiplicationRegistry();
  const order = topologicalOrder(request.nodes);
  const nodesById = new Map(request.nodes.map((node) => [node.id, node]));

  const planned = order.map((nodeId) => {
    const node = nodesById.get(nodeId);
    const contract = resolveMultiplicationContract(node.software, registry);
    const extra = node.inventory ? loadPrivateInventory(path.resolve(rootDir, node.inventory)) : [];
    const workItems = expandPartitionedWorkItems(
      contract,
      loadWorkItems(contract, rootDir, extra)
    );

    const recommendation = node.auto === true
      ? recommendFormation({
          contract,
          workItemCount: workItems.length,
          requestedLogicalAgents: node.logical_agents ?? null,
          requestedPhysicalWorkers: node.physical_workers ?? null,
          telemetry: node.telemetry || {}
        })
      : null;

    const admission = admitMultiplicationRequest({
      contract,
      requestedLogicalAgents: recommendation?.logical_agents ?? node.logical_agents ?? contract.default_logical_agents,
      requestedPhysicalWorkers: recommendation?.physical_workers ?? node.physical_workers ?? contract.default_physical_workers,
      requestedWorkItems: workItems.length,
      requestedAttempts: node.max_attempts_per_job ?? contract.max_attempts_per_job ?? 3,
      budget: contract.budget || {}
    });

    if (!admission.admitted) {
      throw new Error(`Formation node ${nodeId} denied: ${admission.reason}`);
    }

    const plan = buildMultiplicationPlan({
      contract,
      logicalAgents: admission.grant.logical_agents,
      physicalWorkers: admission.grant.physical_workers,
      workItems
    });
    plan.admission = admission;
    plan.formation_recommendation = recommendation;

    return {
      node_id: nodeId,
      software: node.software,
      depends_on: node.depends_on || [],
      reconcile: node.reconcile === true,
      work_items: workItems,
      contract,
      plan
    };
  });

  return {
    schema: 'evercraft.saban.formation-plan.v1',
    formation_id: safeId(request.formation_id || `formation-${Date.now()}`),
    generated_at: new Date().toISOString(),
    execution_order: order,
    nodes: planned
  };
}

export async function executeFormation({ formation, rootDir = process.cwd() }) {
  const receipts = [];
  const byNode = new Map(formation.nodes.map((node) => [node.node_id, node]));

  for (const nodeId of formation.execution_order) {
    const node = byNode.get(nodeId);
    const dependencyReceipts = receipts.filter((receipt) => node.depends_on.includes(receipt.node_id));
    const blocked = dependencyReceipts.some((receipt) => receipt.status !== 'completed');

    if (blocked) {
      receipts.push({
        node_id: nodeId,
        software_id: node.plan.software_id,
        status: 'blocked_by_dependency'
      });
      continue;
    }

    const statePath = path.join(
      'artifacts',
      'saban-multiplier',
      'formations',
      formation.formation_id,
      `${safeId(nodeId)}-state.json`
    );

    try {
      const receipt = await executeMultiplicationPlan({
        contract: node.contract,
        plan: node.plan,
        workItems: node.work_items,
        rootDir,
        reconcile: node.reconcile,
        statePath,
        resume: false
      });
      receipts.push({
        node_id: nodeId,
        software_id: node.plan.software_id,
        status: receipt.scheduler_summary?.counts?.dead_letter ? 'completed_with_dead_letter' : 'completed',
        receipt
      });
    } catch (error) {
      receipts.push({
        node_id: nodeId,
        software_id: node.plan.software_id,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    schema: 'evercraft.saban.formation-receipt.v1',
    formation_id: formation.formation_id,
    generated_at: new Date().toISOString(),
    execution_order: formation.execution_order,
    nodes: receipts,
    summary: {
      total: receipts.length,
      completed: receipts.filter((row) => row.status === 'completed').length,
      completed_with_dead_letter: receipts.filter((row) => row.status === 'completed_with_dead_letter').length,
      blocked: receipts.filter((row) => row.status === 'blocked_by_dependency').length,
      failed: receipts.filter((row) => row.status === 'failed').length
    }
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const requestPath = argValue(argv, '--request');
  if (!requestPath) throw new Error('--request is required');

  const rootDir = process.cwd();
  const request = readJson(path.resolve(rootDir, requestPath));
  const formation = planFormation({ request, rootDir });
  const execute = hasFlag(argv, '--execute');

  const receipt = execute
    ? await executeFormation({ formation, rootDir })
    : {
        schema: 'evercraft.saban.formation-receipt.v1',
        formation_id: formation.formation_id,
        generated_at: new Date().toISOString(),
        mode: 'plan_only',
        execution_order: formation.execution_order,
        nodes: formation.nodes.map((node) => ({
          node_id: node.node_id,
          software_id: node.plan.software_id,
          logical_agents: node.plan.logical_agents,
          physical_workers: node.plan.physical_workers,
          work_item_count: node.plan.work_item_count,
          depends_on: node.depends_on
        }))
      };

  const outDir = path.join('artifacts', 'saban-multiplier', 'formations', formation.formation_id);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'latest.json'),
    JSON.stringify(receipt, null, 2) + '\n'
  );

  console.log(JSON.stringify({
    formation_id: formation.formation_id,
    nodes: formation.nodes.length,
    mode: execute ? 'execute' : 'plan_only',
    summary: receipt.summary || null
  }));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
