const TERMINAL = new Set(['complete', 'skipped']);

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function uniqueStrings(values, limit = 200) {
  const flattened = (values || []).flatMap((value) => Array.isArray(value) ? value : [value]);
  return [...new Set(flattened.map(clean).filter(Boolean))].slice(0, limit);
}

function nowIso(now) {
  return now instanceof Date ? now.toISOString() : new Date(now || Date.now()).toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertGoalState(state) {
  if (!state || state.schema !== 'evercraft.goal.state.v1' || !clean(state.goal_key)) {
    throw new Error('valid goal state is required');
  }
}

function normalizeTask(raw, goalKey, missionKey) {
  const workKey = clean(raw?.work_key || raw?.key);
  if (!workKey) throw new Error('every goal task requires work_key');
  const humanGateRequired = Boolean(raw?.human_gate_required || raw?.founder_attention_required);
  return {
    mission_key: clean(raw?.mission_key || missionKey || goalKey),
    goal_key: goalKey,
    work_key: workKey,
    dedupe_key: clean(raw?.dedupe_key || `${goalKey}:${workKey}`),
    title: clean(raw?.title || workKey),
    work_type: clean(raw?.work_type || 'execute').toLowerCase(),
    dependency_keys: uniqueStrings(raw?.dependency_keys || []),
    assigned_agents: uniqueStrings(raw?.assigned_agents || [], 50),
    status: 'pending',
    attempt: 0,
    human_gate_required: humanGateRequired,
    human_gate_unresolved: humanGateRequired,
    authorization_refs: [],
    receipt_refs: [],
    evidence_refs: [],
    blockers: [],
    last_result: '',
    updated_at: '',
  };
}

function assertAcyclic(tasks) {
  const byKey = new Map(tasks.map((task) => [task.work_key, task]));
  for (const task of tasks) {
    for (const dep of task.dependency_keys) {
      if (!byKey.has(dep)) throw new Error(`unknown dependency ${dep} for ${task.work_key}`);
      if (dep === task.work_key) throw new Error(`task ${task.work_key} cannot depend on itself`);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(key) {
    if (visiting.has(key)) throw new Error(`dependency cycle detected at ${key}`);
    if (visited.has(key)) return;
    visiting.add(key);
    for (const dep of byKey.get(key).dependency_keys) visit(dep);
    visiting.delete(key);
    visited.add(key);
  }
  for (const key of byKey.keys()) visit(key);
}

function summarize(tasks) {
  return tasks.reduce((acc, task) => {
    acc[task.status] = (acc[task.status] || 0) + 1;
    return acc;
  }, {});
}

function deriveGoalStatus(tasks) {
  if (tasks.length === 0) return 'planning';
  if (tasks.every((task) => TERMINAL.has(task.status))) return 'complete';
  if (tasks.some((task) => task.status === 'executing')) return 'executing';
  if (tasks.some((task) => task.status === 'blocked')) return 'blocked';
  if (tasks.some((task) => task.human_gate_unresolved && task.status !== 'complete')) return 'waiting';
  return 'ready';
}

export function createGoalState({ goalKey, objective, successCondition = '', contextRefs = [], missionKey = '', now = new Date() }) {
  const key = clean(goalKey);
  if (!key) throw new Error('goalKey is required');
  if (!clean(objective)) throw new Error('objective is required');
  const at = nowIso(now);
  return {
    schema: 'evercraft.goal.state.v1',
    goal_key: key,
    mission_key: clean(missionKey || key),
    revision: 1,
    objective: clean(objective),
    success_condition: clean(successCondition),
    status: 'planning',
    tasks: [],
    context_refs: uniqueStrings(contextRefs),
    evidence_refs: [],
    blockers: [],
    next_work_keys: [],
    created_at: at,
    updated_at: at,
  };
}

export function admitGoalPlan({ state, plan = [], now = new Date() }) {
  assertGoalState(state);
  if (!Array.isArray(plan) || plan.length === 0) throw new Error('non-empty plan is required');
  const seen = new Set();
  const tasks = plan.map((raw) => {
    const task = normalizeTask(raw, state.goal_key, state.mission_key);
    if (seen.has(task.work_key)) throw new Error(`duplicate work_key ${task.work_key}`);
    seen.add(task.work_key);
    return task;
  });
  assertAcyclic(tasks);
  const next = clone(state);
  next.tasks = tasks;
  next.revision += 1;
  next.status = deriveGoalStatus(tasks);
  next.updated_at = nowIso(now);
  return refreshGoal(next, now);
}

export function authorizeGoalWork({ state, workKey, authorizationRef, now = new Date() }) {
  assertGoalState(state);
  const key = clean(workKey);
  const ref = clean(authorizationRef);
  if (!ref) throw new Error('authorizationRef is required');
  const next = clone(state);
  const task = next.tasks.find((item) => item.work_key === key);
  if (!task) throw new Error(`unknown work_key ${key}`);
  if (!task.human_gate_required) throw new Error(`${key} does not require a human gate`);
  task.human_gate_unresolved = false;
  task.authorization_refs = uniqueStrings([...(task.authorization_refs || []), ref]);
  task.updated_at = nowIso(now);
  next.revision += 1;
  next.updated_at = nowIso(now);
  return refreshGoal(next, now);
}

export function startGoalWork({ state, workKey, now = new Date() }) {
  assertGoalState(state);
  const refreshed = refreshGoal(clone(state), now);
  const task = refreshed.tasks.find((item) => item.work_key === clean(workKey));
  if (!task) throw new Error(`unknown work_key ${clean(workKey)}`);
  if (!refreshed.next_work_keys.includes(task.work_key)) throw new Error(`${task.work_key} is not ready`);
  task.status = 'executing';
  task.attempt = Number(task.attempt || 0) + 1;
  task.updated_at = nowIso(now);
  refreshed.revision += 1;
  refreshed.updated_at = nowIso(now);
  refreshed.status = 'executing';
  refreshed.next_work_keys = refreshed.next_work_keys.filter((key) => key !== task.work_key);
  return refreshed;
}

export function recordGoalOutcome({ state, workKey, result, receiptRef = '', evidenceRefs = [], blocker = '', now = new Date() }) {
  assertGoalState(state);
  const normalized = clean(result).toLowerCase();
  if (!['complete', 'blocked', 'retry', 'skipped'].includes(normalized)) throw new Error(`unsupported result ${normalized}`);
  const next = clone(state);
  const task = next.tasks.find((item) => item.work_key === clean(workKey));
  if (!task) throw new Error(`unknown work_key ${clean(workKey)}`);
  if (task.status !== 'executing' && !(normalized === 'retry' && task.status === 'blocked')) {
    throw new Error(`${task.work_key} is not executing`);
  }
  const receipt = clean(receiptRef);
  const evidence = uniqueStrings(evidenceRefs);
  if (normalized === 'complete' && !receipt && evidence.length === 0) {
    throw new Error('completion requires an execution receipt or evidence reference');
  }
  if (normalized === 'skipped' && !receipt) {
    throw new Error('skipped work requires a receipt reference');
  }
  task.last_result = normalized;
  task.receipt_refs = uniqueStrings([...(task.receipt_refs || []), receipt]);
  task.evidence_refs = uniqueStrings([...(task.evidence_refs || []), ...evidence]);
  task.updated_at = nowIso(now);
  if (normalized === 'complete' || normalized === 'skipped') {
    task.status = normalized;
    task.blockers = [];
  } else if (normalized === 'blocked') {
    task.status = 'blocked';
    task.blockers = uniqueStrings([...(task.blockers || []), clean(blocker || `${task.work_key} blocked`)]);
  } else {
    task.status = 'pending';
    task.blockers = [];
  }
  next.evidence_refs = uniqueStrings([...(next.evidence_refs || []), receipt, ...evidence]);
  next.revision += 1;
  next.updated_at = nowIso(now);
  return refreshGoal(next, now);
}

export function refreshGoal(state, now = new Date()) {
  assertGoalState(state);
  const next = clone(state);
  const terminal = new Set(next.tasks.filter((task) => TERMINAL.has(task.status)).map((task) => task.work_key));
  const ready = [];
  const blockers = [];
  for (const task of next.tasks) {
    if (TERMINAL.has(task.status) || task.status === 'executing') continue;
    if (task.status === 'blocked') {
      blockers.push(...(task.blockers || []));
      continue;
    }
    if (task.human_gate_unresolved) {
      blockers.push(`Human gate unresolved for ${task.work_key}.`);
      continue;
    }
    if (task.dependency_keys.every((dep) => terminal.has(dep))) ready.push(task.work_key);
  }
  next.next_work_keys = uniqueStrings(ready);
  next.blockers = uniqueStrings(blockers);
  next.status = deriveGoalStatus(next.tasks);
  if (next.status === 'waiting' && next.next_work_keys.length > 0) next.status = 'ready';
  if (next.status === 'blocked' && next.next_work_keys.length > 0) next.status = 'ready';
  next.updated_at = nowIso(now);
  return next;
}

export function goalSnapshot(state) {
  assertGoalState(state);
  const refreshed = refreshGoal(clone(state));
  return {
    schema: 'evercraft.goal.snapshot.v1',
    goal_key: refreshed.goal_key,
    mission_key: refreshed.mission_key,
    revision: refreshed.revision,
    objective: refreshed.objective,
    status: refreshed.status,
    counts: summarize(refreshed.tasks),
    next_work_keys: refreshed.next_work_keys,
    blockers: refreshed.blockers,
    evidence_refs: refreshed.evidence_refs,
    updated_at: refreshed.updated_at,
  };
}

export function createGoalCompletionReceipt({ state, successEvidenceRefs = [], now = new Date() }) {
  assertGoalState(state);
  const refreshed = refreshGoal(clone(state), now);
  if (refreshed.status !== 'complete') throw new Error('goal is not complete');
  const successEvidence = uniqueStrings(successEvidenceRefs);
  const evidence = uniqueStrings([...(refreshed.evidence_refs || []), ...successEvidence]);
  if (evidence.length === 0) throw new Error('goal completion requires evidence');
  return {
    schema: 'evercraft.goal.completion-receipt.v1',
    receipt_key: `goal:${refreshed.goal_key}:r${refreshed.revision}`,
    goal_key: refreshed.goal_key,
    mission_key: refreshed.mission_key,
    objective: refreshed.objective,
    success_condition: refreshed.success_condition,
    completed_at: nowIso(now),
    task_count: refreshed.tasks.length,
    evidence_refs: evidence,
    task_receipts: refreshed.tasks.map((task) => ({
      work_key: task.work_key,
      status: task.status,
      receipt_refs: task.receipt_refs || [],
      evidence_refs: task.evidence_refs || [],
      authorization_refs: task.authorization_refs || [],
    })),
  };
}
