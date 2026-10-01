const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

export function emptySourceHealthState() {
  return {
    schema: 'evercraft.systemia-radar.source-health.v1',
    sources: {},
    updated_at: null
  };
}

export function updateSourceHealth(inputState, receipts = [], {
  at = new Date().toISOString(),
  degrade_after_failures = 3
} = {}) {
  const state = structuredClone(inputState || emptySourceHealthState());

  for (const receipt of receipts || []) {
    const id = clean(receipt.collector);
    if (!id) continue;

    const prior = state.sources[id] || {
      collector: id,
      total_runs: 0,
      pass_count: 0,
      failure_count: 0,
      consecutive_failures: 0,
      observation_count: 0,
      last_success_at: null,
      last_failure_at: null,
      last_error: null,
      state: 'unknown'
    };

    const passed = receipt.status === 'pass';
    const current = {
      ...prior,
      total_runs: prior.total_runs + 1,
      pass_count: prior.pass_count + (passed ? 1 : 0),
      failure_count: prior.failure_count + (passed ? 0 : 1),
      consecutive_failures: passed ? 0 : prior.consecutive_failures + 1,
      observation_count: prior.observation_count + Number(receipt.observation_count || 0),
      last_success_at: passed ? (receipt.finished_at || at) : prior.last_success_at,
      last_failure_at: passed ? prior.last_failure_at : (receipt.finished_at || at),
      last_error: passed ? null : clean(receipt.error),
      state: passed
        ? 'healthy'
        : prior.consecutive_failures + 1 >= degrade_after_failures
          ? 'degraded'
          : 'warning'
    };

    state.sources[id] = current;
  }

  state.updated_at = at;
  const rows = Object.values(state.sources);
  const degraded = rows.filter((row) => row.state === 'degraded');
  const warning = rows.filter((row) => row.state === 'warning');

  return {
    state,
    summary: {
      schema: 'evercraft.systemia-radar.source-health-summary.v1',
      updated_at: at,
      source_count: rows.length,
      healthy_count: rows.filter((row) => row.state === 'healthy').length,
      warning_count: warning.length,
      degraded_count: degraded.length,
      overall_state: degraded.length ? 'degraded' : warning.length ? 'warning' : rows.length ? 'healthy' : 'unknown',
      degraded_sources: degraded.map((row) => row.collector),
      warning_sources: warning.map((row) => row.collector)
    }
  };
}

export function publicSourceHealthProjection(state) {
  const rows = Object.values(state?.sources || {});
  return {
    schema: 'evercraft.systemia-radar.source-health.public.v1',
    updated_at: state?.updated_at || null,
    source_count: rows.length,
    sources: rows.map((row) => ({
      collector: row.collector,
      state: row.state,
      total_runs: row.total_runs,
      consecutive_failures: row.consecutive_failures,
      last_success_at: row.last_success_at,
      last_failure_at: row.last_failure_at
    }))
  };
}
