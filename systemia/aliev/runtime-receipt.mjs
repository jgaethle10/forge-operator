import { REQUIRED_RUNTIME_CANARIES } from './runtime-certification.mjs';

function clean(value) { return String(value ?? '').trim(); }

export function normalizeRuntimeReceipt(input, { now = new Date().toISOString() } = {}) {
  const canary = clean(input?.canary);
  if (!REQUIRED_RUNTIME_CANARIES.includes(canary)) throw new Error('runtime_receipt_canary_invalid');

  const evidenceRefs = Array.isArray(input?.evidence_refs)
    ? Array.from(new Set(input.evidence_refs.map(clean).filter(Boolean)))
    : [];
  if (!evidenceRefs.length) throw new Error('runtime_receipt_evidence_required');

  const status = clean(input?.status).toLowerCase();
  if (!['pass', 'fail', 'blocked'].includes(status)) throw new Error('runtime_receipt_status_invalid');

  return {
    schema: 'evercraft.aliev-rivet.runtime-receipt.v1',
    canary,
    status,
    authenticated: input?.authenticated === true,
    source_backed: input?.source_backed === true,
    evidence_refs: evidenceRefs,
    observed_at: clean(input?.observed_at) || now,
    actor: clean(input?.actor) || 'systemia',
    notes: clean(input?.notes) || null
  };
}

export function upsertRuntimeReceipt(existing = [], receiptInput, options) {
  const receipt = normalizeRuntimeReceipt(receiptInput, options);
  const rows = Array.isArray(existing) ? existing.filter((row) => row?.canary !== receipt.canary) : [];
  rows.push(receipt);
  return rows.sort((a, b) => a.canary.localeCompare(b.canary));
}
