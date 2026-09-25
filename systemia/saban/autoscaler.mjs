function positive(value, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function ratio(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

export function recommendFormation({
  contract,
  workItemCount,
  requestedLogicalAgents = null,
  requestedPhysicalWorkers = null,
  telemetry = {}
}) {
  const roles = Math.max(1, Array.isArray(contract?.roles) ? contract.roles.length : 1);
  const maxLogical = positive(contract?.max_logical_agents, 1);
  const maxPhysical = positive(contract?.max_physical_workers, 1);
  const scaling = contract?.scaling || {};
  const strategy = scaling.strategy || 'bounded_default';
  const minimumPasses = positive(scaling.minimum_role_item_passes, 1);
  const roleItemCoverage = Math.max(1, workItemCount * roles * minimumPasses);

  let logical;
  if (strategy === 'work_conserving') {
    const maxAgentsPerItem = positive(scaling.max_agents_per_item, roles);
    const usefulCeiling = Math.max(1, workItemCount * maxAgentsPerItem);
    logical = Math.min(
      positive(requestedLogicalAgents, usefulCeiling),
      usefulCeiling,
      maxLogical
    );
  } else if (strategy === 'coverage_amplification') {
    logical = Math.min(
      Math.max(
        positive(requestedLogicalAgents, contract.default_logical_agents || roleItemCoverage),
        roleItemCoverage
      ),
      maxLogical
    );
  } else {
    logical = Math.min(
      positive(requestedLogicalAgents, contract.default_logical_agents || roleItemCoverage),
      maxLogical
    );
  }

  const targetPerPhysical = positive(scaling.target_logical_per_physical_worker, 32);
  let physical = Math.min(
    positive(requestedPhysicalWorkers, Math.ceil(logical / targetPerPhysical)),
    maxPhysical,
    logical
  );

  const failureRate = ratio(telemetry.failure_rate);
  const queuePressure = ratio(telemetry.queue_pressure);
  const latencyPressure = ratio(telemetry.latency_pressure);

  const adjustments = [];
  if (failureRate >= 0.25) {
    const previous = physical;
    physical = Math.max(1, Math.floor(physical / 2));
    adjustments.push({
      type: 'backpressure',
      from: previous,
      to: physical,
      reason: 'high_failure_rate'
    });
  } else if (failureRate <= 0.05 && (queuePressure >= 0.75 || latencyPressure >= 0.75)) {
    const previous = physical;
    physical = Math.min(maxPhysical, logical, Math.max(physical + 1, Math.ceil(physical * 1.5)));
    if (physical !== previous) {
      adjustments.push({
        type: 'scale_out',
        from: previous,
        to: physical,
        reason: queuePressure >= latencyPressure ? 'queue_pressure' : 'latency_pressure'
      });
    }
  }

  return {
    schema: 'evercraft.saban.formation-recommendation.v1',
    software_id: contract.software_id,
    strategy,
    work_item_count: workItemCount,
    role_count: roles,
    role_item_coverage_floor: roleItemCoverage,
    logical_agents: logical,
    physical_workers: physical,
    adjustments,
    telemetry: {
      failure_rate: failureRate,
      queue_pressure: queuePressure,
      latency_pressure: latencyPressure
    }
  };
}
