import {
  goalSnapshot,
  recordGoalOutcome,
  startGoalWork,
} from './goal-runtime.mjs';

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function unique(values, limit = 100) {
  return [...new Set((values || []).map(clean).filter(Boolean))].slice(0, limit);
}

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new Error('adapter object is required');
  const key = clean(adapter.capability_key);
  if (!key) throw new Error('adapter capability_key is required');
  const workTypes = unique(adapter.work_types || []);
  if (workTypes.length === 0) throw new Error(`adapter ${key} requires at least one work_type`);
  if (typeof adapter.execute !== 'function') throw new Error(`adapter ${key} requires execute()`);
  return {
    ...adapter,
    capability_key: key,
    work_types: workTypes.map((value) => value.toLowerCase()),
    human_gate_required: Boolean(adapter.human_gate_required),
    authority: clean(adapter.authority || 'bounded'),
  };
}

export function createCapabilityRegistry(adapters = []) {
  const byKey = new Map();
  for (const raw of adapters) {
    const adapter = validateAdapter(raw);
    if (byKey.has(adapter.capability_key)) throw new Error(`duplicate capability adapter ${adapter.capability_key}`);
    byKey.set(adapter.capability_key, adapter);
  }
  return {
    schema: 'evercraft.capability-runtime.registry.v1',
    adapters: byKey,
  };
}

export function selectCapabilityAdapter(registry, work) {
  if (!registry || registry.schema !== 'evercraft.capability-runtime.registry.v1') {
    throw new Error('valid capability registry is required');
  }
  const explicit = clean(work?.capability_key);
  if (explicit) return registry.adapters.get(explicit) || null;

  const workType = clean(work?.work_type).toLowerCase();
  const matches = [...registry.adapters.values()]
    .filter((adapter) => adapter.work_types.includes(workType));

  if (matches.length === 1) return matches[0];
  return null;
}

export async function executeGoalWorkWithAdapter({
  state,
  workKey,
  registry,
  context = {},
  now = new Date(),
}) {
  const work = state?.tasks?.find((task) => task.work_key === clean(workKey));
  if (!work) throw new Error(`unknown work_key ${clean(workKey)}`);

  const adapter = selectCapabilityAdapter(registry, work);
  if (!adapter) {
    return {
      ok: false,
      executed: false,
      reason: 'no_adapter',
      state,
      receipt: {
        schema: 'evercraft.capability-route-receipt.v1',
        work_key: work.work_key,
        result: 'unavailable',
        capability_key: clean(work.capability_key),
        observed_at: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
      },
    };
  }

  if (adapter.human_gate_required && !work.human_gate_required) {
    return {
      ok: false,
      executed: false,
      reason: 'adapter_requires_human_gate',
      state,
      receipt: {
        schema: 'evercraft.capability-route-receipt.v1',
        work_key: work.work_key,
        result: 'held',
        capability_key: adapter.capability_key,
        authority: adapter.authority,
        observed_at: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
      },
    };
  }

  const started = startGoalWork({ state, workKey: work.work_key, now });
  const liveWork = started.tasks.find((task) => task.work_key === work.work_key);

  let outcome;
  try {
    outcome = await adapter.execute({
      work: structuredClone(liveWork),
      goal: goalSnapshot(started),
      context: structuredClone(context),
    });
  } catch (error) {
    outcome = {
      result: 'blocked',
      blocker: error instanceof Error ? error.message : String(error),
    };
  }

  const result = clean(outcome?.result).toLowerCase();
  if (!['complete', 'blocked', 'retry', 'skipped'].includes(result)) {
    throw new Error(`adapter ${adapter.capability_key} returned unsupported result ${result || '<empty>'}`);
  }

  const receiptRef = clean(outcome?.receipt_ref);
  const evidenceRefs = unique(outcome?.evidence_refs || []);
  const blocker = clean(outcome?.blocker);
  const next = recordGoalOutcome({
    state: started,
    workKey: work.work_key,
    result,
    receiptRef,
    evidenceRefs,
    blocker,
    now,
  });

  const output = outcome && Object.prototype.hasOwnProperty.call(outcome, 'output')
    ? structuredClone(outcome.output)
    : null;

  return {
    ok: result === 'complete' || result === 'skipped',
    executed: true,
    reason: result,
    state: next,
    output,
    receipt: {
      schema: 'evercraft.capability-route-receipt.v1',
      work_key: work.work_key,
      result,
      capability_key: adapter.capability_key,
      authority: adapter.authority,
      human_gate_required: adapter.human_gate_required,
      execution_receipt_ref: receiptRef,
      evidence_refs: evidenceRefs,
      output,
      observed_at: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
    },
  };
}
