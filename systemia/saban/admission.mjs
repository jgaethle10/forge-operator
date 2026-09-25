function asPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function validateMultiplicationContract(contract) {
  const errors = [];
  if (!contract?.software_id) errors.push('missing_software_id');
  if (!contract?.adapter) errors.push('missing_adapter');
  if (!Array.isArray(contract?.roles) || contract.roles.length === 0) errors.push('missing_roles');

  const maxLogical = asPositiveInt(contract?.max_logical_agents, 0);
  const maxPhysical = asPositiveInt(contract?.max_physical_workers, 0);
  if (!maxLogical) errors.push('invalid_max_logical_agents');
  if (!maxPhysical) errors.push('invalid_max_physical_workers');
  if (maxPhysical > maxLogical) errors.push('physical_workers_exceed_logical_limit');

  if (!contract?.side_effects || contract.side_effects.default !== 'deny') {
    errors.push('side_effect_default_must_deny');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function admitMultiplicationRequest({
  contract,
  requestedLogicalAgents,
  requestedPhysicalWorkers,
  requestedWorkItems = 0,
  requestedAttempts = 3,
  budget = {}
}) {
  const validation = validateMultiplicationContract(contract);
  if (!validation.valid) {
    return {
      admitted: false,
      reason: 'invalid_contract',
      validation
    };
  }

  const ceiling = {
    logical_agents: Math.min(
      asPositiveInt(contract.max_logical_agents, 1),
      asPositiveInt(budget.max_logical_agents, Number.MAX_SAFE_INTEGER)
    ),
    physical_workers: Math.min(
      asPositiveInt(contract.max_physical_workers, 1),
      asPositiveInt(budget.max_physical_workers, Number.MAX_SAFE_INTEGER)
    ),
    work_items: asPositiveInt(budget.max_work_items, Number.MAX_SAFE_INTEGER),
    attempts_per_job: asPositiveInt(budget.max_attempts_per_job, 3)
  };

  if (requestedWorkItems > ceiling.work_items) {
    return {
      admitted: false,
      reason: 'work_item_budget_exceeded',
      validation,
      ceiling
    };
  }

  const logical = Math.max(
    1,
    Math.min(
      asPositiveInt(requestedLogicalAgents, contract.default_logical_agents || 1),
      ceiling.logical_agents
    )
  );
  const physical = Math.max(
    1,
    Math.min(
      asPositiveInt(requestedPhysicalWorkers, contract.default_physical_workers || 1),
      ceiling.physical_workers,
      logical
    )
  );
  const attempts = Math.max(1, Math.min(asPositiveInt(requestedAttempts, 3), ceiling.attempts_per_job));

  return {
    admitted: true,
    reason: 'admitted',
    validation,
    ceiling,
    grant: {
      logical_agents: logical,
      physical_workers: physical,
      max_attempts_per_job: attempts,
      lease_seconds: asPositiveInt(contract.lease_seconds, 300),
      work_items: requestedWorkItems
    },
    doctrine: {
      bounded_concurrency: true,
      deny_side_effects_unless_declared: true,
      receipts_required: true,
      reconciliation_required_for_composite_outputs: Boolean(contract.reconciler)
    }
  };
}
