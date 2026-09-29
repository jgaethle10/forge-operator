function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso(now = new Date()) {
  return (now instanceof Date ? now : new Date(now)).toISOString();
}

function getTask(state, workKey) {
  return state.tasks?.find((task) => task.work_key === workKey) || null;
}

function dependenciesComplete(state, task) {
  return (task.dependency_keys || []).every((key) => getTask(state, key)?.state === 'completed');
}

export function readyFulfillmentTasks(state) {
  return (state.tasks || [])
    .filter((task) => task.state !== 'completed')
    .filter((task) => dependenciesComplete(state, task))
    .filter((task) => !task.human_gate_required || Boolean(task.authorization_ref))
    .map((task) => task.work_key);
}

export function authorizeFulfillmentTask(state, workKey, authorizationRef, now = new Date()) {
  const next = clone(state);
  const task = getTask(next, workKey);
  if (!task) throw new Error('unknown_work_key');
  if (!task.human_gate_required) throw new Error('task_is_not_human_gated');
  if (!String(authorizationRef || '').trim()) throw new Error('authorization_ref_required');
  task.authorization_ref = String(authorizationRef).trim();
  task.authorized_at = nowIso(now);
  next.revision = Number(next.revision || 0) + 1;
  next.updated_at = nowIso(now);
  return next;
}

export function startFulfillmentTask(state, workKey, now = new Date()) {
  const next = clone(state);
  const task = getTask(next, workKey);
  if (!task) throw new Error('unknown_work_key');
  if (task.state === 'completed') throw new Error('task_already_completed');
  if (!dependenciesComplete(next, task)) throw new Error('dependencies_incomplete');
  if (task.human_gate_required && !task.authorization_ref) throw new Error('human_gate_unresolved');
  task.state = 'in_progress';
  task.started_at = nowIso(now);
  next.state = 'in_progress';
  next.revision = Number(next.revision || 0) + 1;
  next.updated_at = nowIso(now);
  return next;
}

export function completeFulfillmentTask(state, workKey, {
  evidence_refs = [],
  artifact_refs = [],
  notes = '',
  now = new Date()
} = {}) {
  const next = clone(state);
  const task = getTask(next, workKey);
  if (!task) throw new Error('unknown_work_key');
  if (!['in_progress','ready','blocked_dependency'].includes(task.state)) throw new Error('task_not_completable');
  if (!dependenciesComplete(next, task)) throw new Error('dependencies_incomplete');
  if (task.human_gate_required && !task.authorization_ref) throw new Error('human_gate_unresolved');
  task.state = 'completed';
  task.completed_at = nowIso(now);
  task.evidence_refs = [...new Set([...(task.evidence_refs || []), ...evidence_refs].filter(Boolean))];
  task.artifact_refs = [...new Set([...(task.artifact_refs || []), ...artifact_refs].filter(Boolean))];
  if (notes) task.notes = String(notes);

  for (const candidate of next.tasks || []) {
    if (candidate.state === 'blocked_dependency' && dependenciesComplete(next, candidate)) {
      candidate.state = 'ready';
    }
  }

  next.revision = Number(next.revision || 0) + 1;
  next.updated_at = nowIso(now);
  next.state = next.tasks.every((row) => row.state === 'completed') ? 'completed' : 'in_progress';
  return next;
}

export function attachCompletionReceipt(state, receipt, now = new Date()) {
  const next = clone(state);
  if (!receipt?.receipt_key) throw new Error('delivery_receipt_required');
  const deliveryTask = getTask(next, 'customer-delivery');
  if (!deliveryTask || deliveryTask.state !== 'completed') throw new Error('customer_delivery_incomplete');
  const receiptTask = getTask(next, 'completion-receipt');
  if (!receiptTask) throw new Error('completion_receipt_task_missing');
  if (!dependenciesComplete(next, receiptTask)) throw new Error('completion_receipt_dependencies_incomplete');

  receiptTask.state = 'completed';
  receiptTask.completed_at = nowIso(now);
  receiptTask.evidence_refs = [...new Set([...(receiptTask.evidence_refs || []), receipt.receipt_key, receipt.integrity_digest].filter(Boolean))];
  next.completion_receipt = receipt;
  for (const candidate of next.tasks || []) {
    if (candidate.state === 'blocked_dependency' && dependenciesComplete(next, candidate)) candidate.state = 'ready';
  }
  next.revision = Number(next.revision || 0) + 1;
  next.updated_at = nowIso(now);
  next.state = 'delivered';
  return next;
}
