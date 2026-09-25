#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const DEFAULT_REGISTRY = 'systemia/saban/multiplication-registry.json';

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function argValue(argv, flag, fallback = null) {
  const index = argv.indexOf(flag);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

function hasFlag(argv, flag) {
  return argv.includes(flag);
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function hashInt(value) {
  const digest = crypto.createHash('sha256').update(String(value)).digest();
  return digest.readUInt32BE(0);
}

function arrayAtPath(value, field) {
  const parts = String(field || '').split('.').filter(Boolean);
  let cursor = value;
  for (const part of parts) cursor = cursor?.[part];
  return Array.isArray(cursor) ? cursor : [];
}

export function loadMultiplicationRegistry(registryPath = DEFAULT_REGISTRY) {
  const registry = readJson(registryPath);
  if (!registry || !Array.isArray(registry.software)) {
    throw new Error(`Invalid Saban multiplication registry: ${registryPath}`);
  }
  return registry;
}

export function resolveMultiplicationContract(software, registry = loadMultiplicationRegistry()) {
  const wanted = normalizeName(software);
  const found = registry.software.find((entry) => {
    const names = [entry.software_id, entry.name, ...(entry.aliases || [])].map(normalizeName);
    return names.includes(wanted);
  });
  if (!found) {
    throw new Error(
      `Software "${software}" is not registered for Saban multiplication. ` +
      'Register a bounded multiplication contract before execution; arbitrary side-effect duplication is intentionally blocked.'
    );
  }
  return {
    ...registry.defaults,
    ...found,
    side_effects: {
      default: registry.defaults?.side_effect_policy || 'deny_unless_declared',
      ...(found.side_effects || {})
    }
  };
}

export function loadWorkItems(contract, rootDir = process.cwd(), extraItems = []) {
  const items = [];
  for (const source of contract.work_sources || []) {
    const file = path.resolve(rootDir, source.file);
    const payload = readJson(file, null);
    if (!payload) continue;
    const rows = arrayAtPath(payload, source.field);
    for (let index = 0; index < rows.length; index += 1) {
      const raw = rows[index];
      const key =
        raw?.[source.key_field] ??
        raw?.product_key ??
        raw?.public_id ??
        raw?.name ??
        `${source.kind || 'item'}-${index}`;
      items.push({
        kind: source.kind || 'item',
        key: String(key),
        source_file: source.file,
        raw
      });
    }
  }

  for (const item of extraItems || []) {
    if (!item) continue;
    const kind = item.kind || 'external_inventory';
    const key = item.key || item.product_key || item.public_id || item.name;
    if (!key) continue;
    items.push({
      kind,
      key: String(key),
      source_file: item.source_file || null,
      raw: item.raw || item
    });
  }

  const deduped = new Map();
  for (const item of items) {
    const fingerprint = `${item.kind}:${item.key}`;
    if (!deduped.has(fingerprint)) deduped.set(fingerprint, item);
  }
  return [...deduped.values()];
}

export function expandPartitionedWorkItems(contract, workItems) {
  const partitioner = contract.partitioner;
  if (!partitioner || partitioner.type !== 'media_time_windows') return workItems;

  const windowSeconds = clampInteger(partitioner.window_seconds, 1, 86400, 300);
  const overlapSeconds = clampInteger(partitioner.overlap_seconds, 0, windowSeconds - 1, 5);
  const stepSeconds = Math.max(1, windowSeconds - overlapSeconds);
  const expanded = [];

  for (const item of workItems) {
    if (item.kind !== 'media_job') {
      expanded.push(item);
      continue;
    }
    const duration = Number(item.raw?.duration_seconds);
    if (!Number.isFinite(duration) || duration <= 0) {
      expanded.push(item);
      continue;
    }
    let shard = 0;
    for (let start = 0; start < duration; start += stepSeconds) {
      const end = Math.min(duration, start + windowSeconds);
      expanded.push({
        kind: 'media_shard',
        key: `${item.key}:t${Math.floor(start)}-${Math.floor(end)}`,
        source_file: item.source_file,
        raw: {
          parent_key: item.key,
          media_ref: item.raw?.media_ref || null,
          start_seconds: start,
          end_seconds: end,
          duration_seconds: end - start,
          requested_outputs: item.raw?.requested_outputs || [],
          provenance: item.raw?.provenance || null,
          shard_index: shard
        }
      });
      shard += 1;
      if (end >= duration) break;
    }
  }
  return expanded;
}

export function assignmentForIndex(plan, workItems, index) {
  const logicalNumber = index + 1;
  const roles = plan.roles.length ? plan.roles : ['worker'];
  const role = roles[index % roles.length];
  const workIndex = workItems.length
    ? hashInt(`${plan.software_id}:${logicalNumber}`) % workItems.length
    : -1;
  const item = workIndex >= 0 ? workItems[workIndex] : {
    kind: 'portfolio',
    key: 'portfolio-wide',
    source_file: null,
    raw: null
  };

  return {
    agent_id: `${plan.software_id}-${String(logicalNumber).padStart(5, '0')}`,
    logical_index: index,
    physical_worker: (index % plan.physical_workers) + 1,
    role,
    lease_seconds: plan.lease_seconds,
    work: {
      kind: item.kind,
      key: item.key,
      source_file: item.source_file
    },
    item
  };
}

export function buildMultiplicationPlan({
  contract,
  logicalAgents,
  physicalWorkers,
  workItems = [],
  generatedAt = new Date().toISOString()
}) {
  const maxLogical = Number(contract.max_logical_agents || 10000);
  const defaultLogical = Number(contract.default_logical_agents || 10);
  const maxPhysical = Number(contract.max_physical_workers || 64);
  const defaultPhysical = Number(contract.default_physical_workers || 8);

  const logical = clampInteger(logicalAgents, 1, maxLogical, defaultLogical);
  const physical = clampInteger(
    physicalWorkers,
    1,
    Math.min(maxPhysical, logical),
    Math.min(defaultPhysical, logical)
  );

  const roles = Array.isArray(contract.roles) && contract.roles.length ? contract.roles : ['worker'];
  const plan = {
    schema: 'evercraft.saban.multiplication-plan.v1',
    generated_at: generatedAt,
    software_id: contract.software_id,
    software_name: contract.name || contract.software_id,
    logical_agents: logical,
    physical_workers: physical,
    lease_seconds: Number(contract.lease_seconds || 300),
    roles,
    work_item_count: workItems.length,
    assignment_strategy: 'deterministic_hash_shard',
    execution_model: 'bounded_physical_pool_with_logical_agents',
    side_effects: contract.side_effects || { default: 'deny' },
    adapter: contract.adapter || null,
    sample_assignments: []
  };

  const sampleSize = Math.min(24, logical);
  for (let index = 0; index < sampleSize; index += 1) {
    const assignment = assignmentForIndex(plan, workItems, index);
    plan.sample_assignments.push({
      agent_id: assignment.agent_id,
      physical_worker: assignment.physical_worker,
      role: assignment.role,
      work: assignment.work
    });
  }
  return plan;
}

async function runBounded(assignments, physicalWorkers, fn) {
  const results = new Array(assignments.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= assignments.length) return;
      try {
        results[index] = await fn(assignments[index]);
      } catch (error) {
        results[index] = {
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(physicalWorkers, assignments.length || 1)) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

function summarizeResults(results) {
  const statuses = {};
  const actions = {};
  for (const result of results) {
    const status = String(result?.status || 'unknown');
    statuses[status] = (statuses[status] || 0) + 1;
    for (const action of result?.actions || []) {
      const key = typeof action === 'string' ? action : action?.type;
      if (!key) continue;
      actions[key] = (actions[key] || 0) + 1;
    }
  }
  return { statuses, actions };
}

export async function executeMultiplicationPlan({
  contract,
  plan,
  workItems,
  rootDir = process.cwd(),
  reconcile = false
}) {
  if (!contract.adapter) {
    throw new Error(`No execution adapter declared for ${contract.software_id}`);
  }

  const adapterPath = path.resolve(rootDir, contract.adapter);
  const adapter = await import(pathToFileURL(adapterPath).href);
  if (typeof adapter.runAssignment !== 'function') {
    throw new Error(`Adapter ${contract.adapter} must export runAssignment()`);
  }

  const assignments = Array.from(
    { length: plan.logical_agents },
    (_, index) => assignmentForIndex(plan, workItems, index)
  );

  const results = await runBounded(assignments, plan.physical_workers, (assignment) =>
    adapter.runAssignment({ assignment, plan, contract, rootDir })
  );

  let reconciliation = null;
  if (reconcile) {
    if (contract.reconciler?.once_per_swarm !== true) {
      throw new Error('Reconciliation requested but contract does not permit once-per-swarm reconciliation.');
    }
    const exportName = contract.reconciler?.adapter_export || 'reconcile';
    if (typeof adapter[exportName] !== 'function') {
      throw new Error(`Adapter ${contract.adapter} does not export ${exportName}()`);
    }
    reconciliation = await adapter[exportName]({ plan, contract, rootDir, results });
  }

  return {
    schema: 'evercraft.saban.multiplication-receipt.v1',
    generated_at: new Date().toISOString(),
    software_id: plan.software_id,
    logical_agents: plan.logical_agents,
    physical_workers: plan.physical_workers,
    work_item_count: plan.work_item_count,
    result_summary: summarizeResults(results),
    sample_results: results.slice(0, 24),
    reconciliation
  };
}

export function loadPrivateInventory(inventoryPath) {
  if (!inventoryPath) return [];
  const payload = readJson(inventoryPath, null);
  if (!payload) throw new Error(`Could not read inventory: ${inventoryPath}`);
  const rows = Array.isArray(payload) ? payload : payload.apps || payload.products || payload.items || payload.jobs || [];
  return rows
    .filter(Boolean)
    .map((row, index) => ({
      kind: row.kind || 'external_inventory',
      key: String(row.key || row.product_key || row.public_id || row.name || row.id || `inventory-${index}`),
      source_file: inventoryPath,
      raw: row.raw || row
    }));
}

async function main() {
  const argv = process.argv.slice(2);
  const software = argValue(argv, '--software', 'chum');
  const registryPath = argValue(argv, '--registry', DEFAULT_REGISTRY);
  const inventoryPath = argValue(argv, '--inventory', null);
  const execute = hasFlag(argv, '--execute');
  const reconcile = hasFlag(argv, '--reconcile');
  const rootDir = process.cwd();

  const registry = loadMultiplicationRegistry(registryPath);
  const contract = resolveMultiplicationContract(software, registry);
  const extraItems = loadPrivateInventory(inventoryPath);
  const workItems = expandPartitionedWorkItems(
    contract,
    loadWorkItems(contract, rootDir, extraItems)
  );
  const plan = buildMultiplicationPlan({
    contract,
    logicalAgents: argValue(argv, '--agents', contract.default_logical_agents),
    physicalWorkers: argValue(argv, '--workers', contract.default_physical_workers),
    workItems
  });

  let receipt = {
    schema: 'evercraft.saban.multiplication-receipt.v1',
    generated_at: new Date().toISOString(),
    mode: 'plan_only',
    plan
  };

  if (execute) {
    receipt = {
      ...(await executeMultiplicationPlan({
        contract,
        plan,
        workItems,
        rootDir,
        reconcile
      })),
      mode: reconcile ? 'execute_and_reconcile' : 'execute',
      plan
    };
  }

  const outDir = path.resolve(rootDir, 'artifacts/saban-multiplier');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${contract.software_id}-latest.json`);
  fs.writeFileSync(outFile, JSON.stringify(receipt, null, 2) + '\n');

  console.log(JSON.stringify({
    software: contract.software_id,
    logical_agents: plan.logical_agents,
    physical_workers: plan.physical_workers,
    work_items: plan.work_item_count,
    mode: receipt.mode,
    out: path.relative(rootDir, outFile)
  }));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
