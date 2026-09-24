const ACTIVE_STAGES = new Set(['assigned', 'executing', 'qa']);
const EVIDENCED_TERMINAL_STAGES = new Set(['integrated', 'delivered']);

export function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function uniqueStrings(values, limit = 200) {
  const flattened = values.flatMap((value) => Array.isArray(value) ? value : [value]);
  return [...new Set(flattened.map(clean).filter(Boolean))].slice(0, limit);
}

export function roleForWorkType(workType) {
  const type = clean(workType).toLowerCase();
  if (['qa', 'verify', 'security'].includes(type)) return 'reset';
  if (type === 'memory') return 'reentry';
  if (['research', 'analyze', 'commercial'].includes(type)) return 'support';
  return 'lead';
}

export function memoryStateIsFresh(memoryState, now = Date.now()) {
  if (!memoryState || clean(memoryState.sync_status).toLowerCase() !== 'healthy') return false;
  const syncedAt = Date.parse(clean(memoryState.last_sync_at));
  if (!Number.isFinite(syncedAt)) return false;
  const staleAfterHours = Math.max(1, Number(memoryState.stale_after_hours || 24));
  return now - syncedAt <= staleAfterHours * 60 * 60 * 1000;
}

export function terminalEvidence(work) {
  const evidence = Array.isArray(work?.evidence_refs) ? work.evidence_refs.filter(Boolean) : [];
  const outputs = Array.isArray(work?.output_refs) ? work.output_refs.filter(Boolean) : [];
  const tests = Array.isArray(work?.acceptance_tests) ? work.acceptance_tests.map(clean).filter(Boolean) : [];
  const passed = new Set(Array.isArray(work?.acceptance_passed) ? work.acceptance_passed.map(clean) : []);
  const acceptanceComplete = tests.length > 0 && tests.every((test) => passed.has(test));
  return evidence.length > 0 || outputs.length > 0 || acceptanceComplete;
}

export function createMissionState({ missionKey, objective, successCondition = '', now = new Date().toISOString() }) {
  if (!clean(missionKey)) throw new Error('missionKey is required');
  return {
    schema: 'evercraft.organism.state.v1',
    mission_key: clean(missionKey),
    state_version: 1,
    objective: clean(objective),
    success_condition: clean(successCondition),
    phase: 'admit',
    coordination_mode: 'organism',
    coherence_status: 'amber',
    current_focus: '',
    lead_roles: [],
    support_roles: [],
    reset_roles: [],
    reentry_roles: [],
    active_work_keys: [],
    adjacent_work_keys: [],
    dependency_keys: [],
    blockers: [],
    evidence_refs: [],
    learned_since_last_cycle: [],
    next_collective_action: '',
    duplicate_work_risk: 'unknown',
    founder_gate_required: false,
    last_reconciled_at: now,
    updated_at: now,
  };
}

function exactAssignedMemoryFailure(work, memoryByAgent, nowMs) {
  if (clean(work.work_type).toLowerCase() === 'memory') return null;
  const assigned = uniqueStrings(work.assigned_agents || [], 50);
  for (const label of assigned) {
    const key = clean(label).toLowerCase();
    const memory = memoryByAgent.get(key) ?? [...memoryByAgent.values()]
      .find((row) => clean(row?.agent_name).toLowerCase() === key);
    if (!memory || !memory.must_preflight_memory) continue;
    if (!memoryStateIsFresh(memory, nowMs)) return memory;
  }
  return null;
}

function equivalentConflict(work, workLedger) {
  const missionKey = clean(work.mission_key);
  const dedupeKey = clean(work.dedupe_key);
  if (!missionKey || !dedupeKey) return null;
  return workLedger.find((candidate) => {
    if (clean(candidate.work_key) === clean(work.work_key)) return false;
    if (clean(candidate.mission_key) !== missionKey) return false;
    if (clean(candidate.dedupe_key) !== dedupeKey) return false;
    const stage = clean(candidate.stage).toLowerCase();
    return ACTIVE_STAGES.has(stage) || (EVIDENCED_TERMINAL_STAGES.has(stage) && terminalEvidence(candidate));
  }) ?? null;
}

function appendRole(state, role, workKey) {
  const field = role === 'lead' ? 'lead_roles'
    : role === 'support' ? 'support_roles'
      : role === 'reset' ? 'reset_roles'
        : 'reentry_roles';
  return { ...state, [field]: uniqueStrings([...(state[field] || []), workKey], 200) };
}

export function preflight({
  state,
  work,
  workLedger = [],
  memoryStates = [],
  now = new Date(),
}) {
  if (!state || clean(state.mission_key) !== clean(work?.mission_key)) {
    return { ok: false, hold: 'mission_state_mismatch', state };
  }

  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const workKey = clean(work.work_key);
  const role = roleForWorkType(work.work_type);

  if (work.founder_attention_required || work.human_gate_unresolved) {
    return {
      ok: false,
      hold: 'human_gate_unresolved',
      state: {
        ...state,
        state_version: state.state_version + 1,
        founder_gate_required: true,
        coherence_status: 'amber',
        coordination_mode: 'degraded',
        blockers: uniqueStrings([...(state.blockers || []), `Human gate unresolved for ${workKey}.`]),
        next_collective_action: `Resolve the explicit human gate before ${workKey} can execute.`,
        updated_at: nowIso,
      },
    };
  }

  const memoryByAgent = new Map(memoryStates.map((row) => [clean(row.agent_key).toLowerCase(), row]));
  const staleMemory = exactAssignedMemoryFailure(work, memoryByAgent, nowMs);
  if (staleMemory) {
    const agent = clean(staleMemory.agent_name || staleMemory.agent_key);
    return {
      ok: false,
      hold: 'assigned_agent_memory_stale',
      memory: staleMemory,
      state: {
        ...state,
        state_version: state.state_version + 1,
        coherence_status: 'amber',
        coordination_mode: 'degraded',
        blockers: uniqueStrings([...(state.blockers || []), `Assigned agent memory is not fresh: ${agent}.`]),
        next_collective_action: `Refresh and verify ${agent} memory before ordinary execution; memory-repair work remains admissible.`,
        updated_at: nowIso,
      },
    };
  }

  const conflict = equivalentConflict(work, workLedger);
  if (conflict) {
    return {
      ok: false,
      hold: 'equivalent_work_exists',
      conflict,
      state: {
        ...state,
        state_version: state.state_version + 1,
        coherence_status: 'amber',
        coordination_mode: 'degraded',
        duplicate_work_risk: 'high',
        current_focus: clean(conflict.title || conflict.work_key),
        next_collective_action: `Suppress duplicate ${workKey}; reconcile with ${clean(conflict.work_key)}.`,
        updated_at: nowIso,
      },
    };
  }

  let next = {
    ...state,
    state_version: state.state_version + 1,
    phase: 'execute',
    coordination_mode: 'organism',
    coherence_status: 'amber',
    current_focus: clean(work.title || work.next_action || workKey),
    active_work_keys: uniqueStrings([...(state.active_work_keys || []), workKey]),
    dependency_keys: uniqueStrings([...(state.dependency_keys || []), ...(work.dependency_keys || [])]),
    duplicate_work_risk: 'low',
    founder_gate_required: false,
    next_collective_action: clean(work.next_action || `Execute ${workKey}, then reconcile observed results.`),
    updated_at: nowIso,
  };
  next = appendRole(next, role, workKey);

  return { ok: true, role, state: next };
}

export function postflight({
  state,
  work,
  result,
  executionReceiptKey = '',
  outputRefs = [],
  blocker = '',
  cycleKey = '',
  now = new Date(),
}) {
  if (!state || clean(state.mission_key) !== clean(work?.mission_key)) {
    return { ok: false, reason: 'mission_state_mismatch', state };
  }

  const nowIso = now.toISOString();
  const workKey = clean(work.work_key);
  const normalizedResult = clean(result).toLowerCase() || 'partial';
  const blocked = ['blocked', 'held', 'failed'].includes(normalizedResult);
  const complete = normalizedResult === 'complete';
  const active = uniqueStrings(state.active_work_keys || []).filter((key) => key !== workKey || !complete);
  const evidence = uniqueStrings([
    ...(state.evidence_refs || []),
    ...(work.evidence_refs || []),
    executionReceiptKey,
    ...outputRefs,
    cycleKey ? `cycle:${cycleKey}` : '',
  ]);

  const next = {
    ...state,
    state_version: state.state_version + 1,
    active_work_keys: active,
    adjacent_work_keys: uniqueStrings([...(state.adjacent_work_keys || []), complete ? workKey : '']),
    blockers: blocked
      ? uniqueStrings([...(state.blockers || []), clean(blocker || `${workKey}: ${normalizedResult}`)])
      : uniqueStrings(state.blockers || []).filter((entry) => !entry.includes(workKey)),
    learned_since_last_cycle: uniqueStrings([
      ...(state.learned_since_last_cycle || []),
      complete ? `${workKey} completed with observed evidence.` : '',
      blocked ? `${workKey} returned ${normalizedResult}.` : '',
    ]),
    evidence_refs: evidence,
    coordination_mode: blocked ? 'degraded' : 'organism',
    coherence_status: blocked ? 'amber' : complete ? 'green' : 'amber',
    next_collective_action: complete
      ? 'Advance the next ready complementary lane.'
      : 'Resolve the observed blocker before re-entry.',
    last_reconciled_at: nowIso,
    updated_at: nowIso,
  };

  const receipt = {
    schema: 'evercraft.organism.coordination-receipt.v1',
    receipt_key: `coord:${cycleKey || 'no-cycle'}:${workKey}:v${next.state_version}`,
    mission_key: clean(work.mission_key),
    work_key: workKey,
    cycle_key: clean(cycleKey),
    observed_at: nowIso,
    role: roleForWorkType(work.work_type),
    result: blocked ? 'blocked' : complete ? 'pass' : 'partial',
    coherence_score: blocked ? 60 : complete ? 95 : 80,
    shared_state_reads: 1,
    shared_state_writes: 1,
    evidence_refs: uniqueStrings([executionReceiptKey, ...outputRefs, cycleKey ? `cycle:${cycleKey}` : '']),
  };

  return { ok: true, state: next, receipt };
}
