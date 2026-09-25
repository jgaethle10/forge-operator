#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { loadMultiplicationRegistry } from './multiplier.mjs';
import { validateMultiplicationContract } from './admission.mjs';

function inspectContract(contract, rootDir) {
  const validation = validateMultiplicationContract(contract);
  const issues = [...validation.errors];

  if (!['role_item_cartesian', 'deterministic_hash_shard'].includes(contract.assignment_strategy)) {
    issues.push('unsupported_assignment_strategy');
  }

  if (!contract.scaling?.strategy) issues.push('missing_scaling_strategy');
  if (!contract.budget?.max_logical_agents) issues.push('missing_logical_budget');
  if (!contract.budget?.max_physical_workers) issues.push('missing_physical_budget');
  if (!contract.budget?.max_work_items) issues.push('missing_work_item_budget');
  if (!contract.budget?.max_attempts_per_job) issues.push('missing_attempt_budget');

  const adapterPath = contract.adapter ? path.resolve(rootDir, contract.adapter) : null;
  if (!adapterPath || !fs.existsSync(adapterPath)) issues.push('adapter_missing_on_disk');

  if (contract.reconciler?.once_per_swarm === true && !contract.reconciler?.adapter_export) {
    issues.push('missing_reconciler_export');
  }

  if (contract.quality) {
    const ratio = Number(contract.quality.minimum_completion_ratio ?? 1);
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
      issues.push('invalid_quality_completion_ratio');
    }
    if (!['receipt_only', 'fail_execution'].includes(contract.quality.enforcement || 'receipt_only')) {
      issues.push('invalid_quality_enforcement');
    }
    if (contract.quality.require_source_integrity === true && contract.quality.require_reconciliation !== true) {
      issues.push('source_integrity_requires_reconciliation');
    }
  }

  if (contract.inventory_privacy) {
    if (contract.inventory_privacy.redact_identifiers !== true) {
      issues.push('inventory_privacy_must_redact_identifiers');
    }
    if (contract.inventory_privacy.expose_source_path === true) {
      issues.push('private_inventory_source_path_must_stay_redacted');
    }
  }

  if (contract.resources) {
    for (const field of [
      'minimum_node_cpu_units',
      'minimum_node_memory_mb',
      'cpu_units_per_worker',
      'memory_mb_per_worker'
    ]) {
      const value = Number(contract.resources[field] || 0);
      if (!Number.isFinite(value) || value <= 0) {
        issues.push(`invalid_resource_profile_${field}`);
      }
    }
    if (contract.resources.required_executables) {
      if (
        !Array.isArray(contract.resources.required_executables) ||
        contract.resources.required_executables.some(
          (value) => typeof value !== 'string' || !value.trim()
        )
      ) {
        issues.push('invalid_required_executables');
      }
    }
  }

  if (contract.partitioner?.type === 'media_time_windows') {
    const windowSeconds = Number(contract.partitioner.window_seconds);
    const overlapSeconds = Number(contract.partitioner.overlap_seconds);
    if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) issues.push('invalid_partition_window');
    if (!Number.isFinite(overlapSeconds) || overlapSeconds < 0 || overlapSeconds >= windowSeconds) {
      issues.push('invalid_partition_overlap');
    }
  }

  return {
    software_id: contract.software_id,
    name: contract.name,
    adapter: contract.adapter,
    assignment_strategy: contract.assignment_strategy,
    scaling_strategy: contract.scaling?.strategy || null,
    role_count: Array.isArray(contract.roles) ? contract.roles.length : 0,
    max_logical_agents: contract.max_logical_agents,
    max_physical_workers: contract.max_physical_workers,
    issues,
    valid: issues.length === 0
  };
}

const rootDir = process.cwd();
const registry = loadMultiplicationRegistry();
const contracts = registry.software.map((contract) => inspectContract(contract, rootDir));

const receipt = {
  schema: 'evercraft.saban.contract-doctor.v1',
  generated_at: new Date().toISOString(),
  registry_schema: registry.schema,
  summary: {
    contracts: contracts.length,
    valid: contracts.filter((row) => row.valid).length,
    invalid: contracts.filter((row) => !row.valid).length
  },
  contracts
};

fs.mkdirSync('artifacts/saban-multiplier', { recursive: true });
fs.writeFileSync(
  'artifacts/saban-multiplier/contract-doctor.json',
  JSON.stringify(receipt, null, 2) + '\n'
);

console.log(JSON.stringify(receipt.summary));

if (receipt.summary.invalid > 0) {
  for (const row of contracts.filter((contract) => !contract.valid)) {
    console.error(`${row.software_id}: ${row.issues.join(', ')}`);
  }
  process.exitCode = 1;
}
