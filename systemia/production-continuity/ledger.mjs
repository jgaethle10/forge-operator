/**
 * Systemia Production Continuity: pure, non-actuating inventory audit.
 * Runs against a PRIVATE ledger. It never dispatches agents, edits canon,
 * contacts outside parties, or releases anything.
 */
export const LEDGER_SCHEMA = 'evercraft.production.continuity.v1';

export const STATES = Object.freeze([
  'ACTIVE',
  'WAITING_ON_AGENT',
  'WAITING_ON_EVIDENCE',
  'EDITORIAL_QA',
  'FOUNDER_DECISION',
  'READY_FOR_RELEASE',
  'RELEASED_VERIFIED',
  'PARKED_INTENTIONALLY',
]);

const TERMINAL = new Set(['RELEASED_VERIFIED', 'PARKED_INTENTIONALLY']);
const PROTECTED_GATES = new Set(['canon', 'rights', 'publication', 'outreach', 'spending']);

function at(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function verifyReceipt(receipt, now) {
  if (!receipt || typeof receipt !== 'object' || receipt.verified !== true) return null;
  if (!receipt.receipt_id || !receipt.artifact_ref || !receipt.source) return null;
  const timestamp = at(receipt.verified_at);
  if (timestamp === null || timestamp > now) return null;
  return timestamp;
}

function validNextAction(action) {
  return Boolean(action && typeof action === 'object'
    && typeof action.kind === 'string' && action.kind.trim()
    && typeof action.owner === 'string' && action.owner.trim());
}

function add(actions, projectId, kind, reason, destination = 'internal') {
  if (!actions.some((a) => a.project_id === projectId && a.kind === kind)) {
    actions.push({ project_id: projectId, kind, reason, destination });
  }
}

/**
 * Conservative recovery plan. Output is proposed work, NOT agent dispatch.
 * Privacy: never echo titles, narrative text, raw evidence, or source paths.
 */
export function auditProductionLedger(ledger, { now = Date.now(), staleAfterHours = 24 } = {}) {
  if (!ledger || ledger.schema !== LEDGER_SCHEMA || !Array.isArray(ledger.projects)) {
    throw new Error('Invalid private production ledger schema');
  }
  if (!Number.isFinite(now) || !Number.isFinite(staleAfterHours) || staleAfterHours <= 0) {
    throw new Error('Invalid audit clock/threshold');
  }

  const seen = new Set();
  const items = [];
  const proposed_internal_work = [];
  const founder_decisions = [];
  const limit = staleAfterHours * 60 * 60 * 1000;

  for (const project of ledger.projects) {
    if (!project || typeof project !== 'object') throw new Error('Invalid project entry');
    const id = project.project_id;
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,79}$/.test(id)) {
      throw new Error('Invalid or unsafe project ID');
    }
    if (seen.has(id)) throw new Error(`Duplicate project ID: ${id}`);
    seen.add(id);
    if (!STATES.includes(project.current_stage)) throw new Error(`Unsupported state for ${id}`);
    const status = project.current_stage;
    const receiptTime = verifyReceipt(project.last_verified_receipt, now);
    const hasNext = validNextAction(project.next_action);
    const hasBlocker = typeof project.blocker === 'string' && project.blocker.trim().length > 0;
    const reviewDue = at(project.review_due);
    const overdue = reviewDue !== null && reviewDue <= now;
    const stale = !TERMINAL.has(status) && (receiptTime === null || now - receiptTime > limit);
    const reason_codes = [];
    const mark = (reason) => { if (!reason_codes.includes(reason)) reason_codes.push(reason); };

    // Terminal state is evidence-gated. A GitHub issue or generated draft isn't proof.
    if (status === 'RELEASED_VERIFIED' && !verifyReceipt(project.release_receipt, now)) {
      mark('released_without_verified_release_receipt');
      add(proposed_internal_work, id, 'verify_release_receipt', 'released_without_verified_release_receipt');
    }
    if (status === 'PARKED_INTENTIONALLY' && (!hasBlocker || !project.parked_approved_by)) {
      mark('parked_without_explicit_approval');
      add(founder_decisions, id, 'confirm_intentional_park', 'parked_without_explicit_approval', 'founder');
    }
    if (!TERMINAL.has(status)) {
      if (!hasNext && status !== 'FOUNDER_DECISION') {
        mark('missing_owned_next_action');
        add(proposed_internal_work, id, 'recover_owned_next_action', 'missing_owned_next_action');
      }
      if (stale) {
        mark(receiptTime === null ? 'no_verified_receipt' : 'stale_verified_receipt');
        const kind = status === 'WAITING_ON_EVIDENCE' ? 'refresh_source_evidence' : 'inspect_and_reconcile_receipts';
        add(proposed_internal_work, id, kind, 'stale_or_missing_verified_receipt');
      }
      if (overdue) {
        mark('review_due');
        add(proposed_internal_work, id, 'review_due_state', 'review_due');
      }
      if (status === 'FOUNDER_DECISION') {
        mark('founder_decision_gate');
        add(founder_decisions, id, 'resolve_founder_decision', 'founder_decision_gate', 'founder');
      }
      if (status === 'READY_FOR_RELEASE' && !project.publication_approved) {
        mark('publication_approval_missing');
        add(founder_decisions, id, 'approve_or_hold_publication', 'publication_approval_missing', 'founder');
      }
      const requestedGate = project.next_action?.requires_gate;
      if (hasNext && PROTECTED_GATES.has(requestedGate)) {
        mark('protected_gate_requires_approval');
        add(founder_decisions, id, `authorize_${requestedGate}`, 'protected_gate_requires_approval', 'founder');
      }
    }
    items.push({
      project_id: id,
      current_stage: status,
      alert: reason_codes.length ? 'ATTENTION' : 'NONE',
      stale,
      has_verified_receipt: receiptTime !== null,
      reason_codes,
    });
  }

  return {
    schema: 'evercraft.production.continuity.audit.v1',
    audited_at: new Date(now).toISOString(),
    project_count: items.length,
    attention_count: items.filter((i) => i.alert === 'ATTENTION').length,
    projects: items,
    proposed_internal_work,
    founder_decisions,
    dispatch_performed: false,
    canon_modified: false,
    publication_performed: false,
  };
}
