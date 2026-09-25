import crypto from 'node:crypto';
import { resolveMultiplicationContract } from './multiplier.mjs';

function stableKey(request) {
  const raw = request.dedupe_key || [
    request.parent_node_id || 'root',
    request.software || '',
    request.reason || '',
    request.scope_key || ''
  ].join(':');
  return crypto.createHash('sha256').update(String(raw)).digest('hex').slice(0, 24);
}

function positive(value, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function createSpawnLedger({
  maxDepth = 4,
  maxChildren = 256,
  maxTotalLogicalAgents = 20000,
  maxLogicalAgentsPerChild = 10000
} = {}) {
  return {
    schema: 'evercraft.saban.spawn-ledger.v1',
    limits: {
      max_depth: maxDepth,
      max_children: maxChildren,
      max_total_logical_agents: maxTotalLogicalAgents,
      max_logical_agents_per_child: maxLogicalAgentsPerChild
    },
    total_logical_agents: 0,
    children: [],
    dedupe_keys: []
  };
}

export function admitSpawnRequest({ ledger, request, registry }) {
  const key = stableKey(request);
  if (ledger.dedupe_keys.includes(key)) {
    return {
      admitted: false,
      reason: 'duplicate_spawn_request',
      dedupe_key: key
    };
  }

  const depth = positive(request.depth, 1);
  if (depth > ledger.limits.max_depth) {
    return {
      admitted: false,
      reason: 'max_spawn_depth_exceeded',
      dedupe_key: key
    };
  }

  if (ledger.children.length >= ledger.limits.max_children) {
    return {
      admitted: false,
      reason: 'max_children_exceeded',
      dedupe_key: key
    };
  }

  let contract;
  try {
    contract = resolveMultiplicationContract(request.software, registry);
  } catch {
    return {
      admitted: false,
      reason: 'software_not_registered_for_multiplication',
      dedupe_key: key
    };
  }

  const logicalAgents = Math.min(
    positive(request.logical_agents, contract.default_logical_agents || 1),
    positive(contract.max_logical_agents, 1),
    ledger.limits.max_logical_agents_per_child
  );

  if (ledger.total_logical_agents + logicalAgents > ledger.limits.max_total_logical_agents) {
    return {
      admitted: false,
      reason: 'total_spawn_budget_exceeded',
      dedupe_key: key
    };
  }

  const physicalWorkers = Math.min(
    positive(request.physical_workers, contract.default_physical_workers || 1),
    positive(contract.max_physical_workers, 1),
    logicalAgents
  );

  const child = {
    spawn_id: `spawn-${key}`,
    dedupe_key: key,
    parent_node_id: request.parent_node_id || null,
    software: contract.software_id,
    depth,
    logical_agents: logicalAgents,
    physical_workers: physicalWorkers,
    reason: request.reason || null,
    scope_key: request.scope_key || null,
    auto: request.auto === true,
    reconcile: request.reconcile === true
  };

  ledger.dedupe_keys.push(key);
  ledger.children.push(child);
  ledger.total_logical_agents += logicalAgents;

  return {
    admitted: true,
    reason: 'admitted',
    child
  };
}

export function summarizeSpawnLedger(ledger) {
  const bySoftware = {};
  for (const child of ledger.children) {
    bySoftware[child.software] = (bySoftware[child.software] || 0) + 1;
  }
  return {
    children: ledger.children.length,
    total_logical_agents: ledger.total_logical_agents,
    by_software: bySoftware,
    limits: ledger.limits
  };
}
