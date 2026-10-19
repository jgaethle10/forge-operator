import crypto from 'node:crypto';
import { proofFirstState } from './engine.mjs';

const SOURCE_KINDS = new Set(['explicit_public_request', 'direct_inquiry', 'opted_in', 'invited_partner']);
const CHANNELS = new Set(['email', 'dm']);
const MAX_RECORDS = 1000;
const MAX_SOURCE_AGE_DAYS = 30;
const SHA = (value) => 'sha256:' + crypto.createHash('sha256').update(String(value)).digest('hex');
const clean = (value) => String(value ?? '').trim();

function safeEvidenceUrl(value) {
  try {
    const u = new URL(clean(value));
    return u.protocol === 'https:' && !u.username && !u.password && !u.hash;
  } catch { return false; }
}

function validDate(value) {
  const ms = Date.parse(clean(value));
  return Number.isFinite(ms) ? ms : null;
}

function priorityScore(lead, nowMs) {
  // Sorting heuristic, NEVER a prediction of acceptance, conversion, or revenue.
  const amount = Number(lead.budget_usd);
  const budget = Number.isFinite(amount) && amount > 0 ? Math.min(40, Math.round(Math.log10(amount + 1) * 10)) : 0;
  const deadline = validDate(lead.response_deadline);
  const urgent = deadline && deadline > nowMs && deadline - nowMs <= 3 * 86400000 ? 18 : 0;
  const buyer = lead.source_kind === 'direct_inquiry' ? 25 : lead.source_kind === 'explicit_public_request' ? 20 : 12;
  return budget + urgent + buyer;
}

/**
 * Privacy-safe, deterministic CRM qualification queue. This function cannot send messages,
 * create permits, or mutate the Interaction Ledger. A returned 'permit_required' row is
 * NOT send authorization. The caller still needs a single-use exact-message Passport
 * action permit and a separate approved provider with a receipt-backed finalization.
 */
export function evaluateOutreachQueue({ leads = [], ledger = null, actor_ref = '', at = new Date() } = {}) {
  if (!Array.isArray(leads) || leads.length > MAX_RECORDS) throw new Error('outreach_batch_size_invalid');
  const nowMs = new Date(at).getTime();
  if (!Number.isFinite(nowMs)) throw new Error('outreach_at_invalid');
  const now = new Date(nowMs);
  const seen = new Set();
  const records = [];

  for (const lead of leads) {
    const subject = clean(lead?.subject_ref);
    const channel = clean(lead?.channel).toLowerCase();
    const source = clean(lead?.source_url);
    const prospect = clean(lead?.prospect_key);
    const key = SHA(JSON.stringify([subject, channel, source]));
    const messageFingerprint = SHA(clean(lead?.message));
    const keySet = [subject,channel,source].join('\u0000');
    const record = {
      lead_hash: key,
      channel: CHANNELS.has(channel) ? channel : 'unknown',
      offer_key: clean(lead?.offer_key) || null,
      message_fingerprint: messageFingerprint,
      stage: 'held',
      reason: 'unqualified',
      priority_score: priorityScore(lead ?? {}, nowMs),
      permit_required: true,
      send_authorized: false,
    };
    records.push(record);

    if (!subject || !prospect || !clean(lead?.business) || !CHANNELS.has(channel) || !clean(lead?.message) || !clean(actor_ref)) {
      record.reason = 'missing_required_qualification';
      continue;
    }
    if (seen.has(keySet)) { record.reason = 'duplicate_batch_target'; continue; }
    seen.add(keySet);
    if (!SOURCE_KINDS.has(lead.source_kind) || lead.source_verified !== true || !safeEvidenceUrl(source)) {
      record.reason = 'solicitation_evidence_unverified'; continue;
    }
    const posted = validDate(lead.request_posted_at);
    const expires = lead.request_expires_at ? validDate(lead.request_expires_at) : null;
    if (posted === null || posted > nowMs || posted < nowMs - MAX_SOURCE_AGE_DAYS * 86400000 || (lead.request_expires_at && expires === null) || (expires !== null && expires < nowMs)) {
      record.reason = 'request_stale_or_expired'; continue;
    }
    const proof = proofFirstState({
      prospect_key: prospect,
      business: lead.business,
      pain_evidence_state: lead.pain_evidence_state,
      proof_state: lead.proof_state,
      opted_out: lead.opted_out,
      unanswered_outbound: lead.unanswered_outbound,
      last_outbound_at: lead.last_outbound_at,
      human_approval_state: lead.human_approval_state,
      human_approval_ref: lead.human_approval_ref,
    }, now);
    if (proof.state !== 'outreach_ready') {
      record.reason = proof.reason;
      continue;
    }
    if (!ledger || typeof ledger.preflightContact !== 'function') {
      record.reason = 'interaction_ledger_required';
      continue;
    }
    try {
      const decision = ledger.preflightContact({
        subject_ref: subject, channel, actor_ref,
        content_fingerprint: messageFingerprint,
        at: now.toISOString(), minimum_cooldown_minutes: 72 * 60,
        max_unanswered_outbound: 2,
      });
      if (decision?.decision !== 'allow') {
        record.reason = 'ledger_denied';
        record.ledger_reasons = Array.isArray(decision?.reasons) ? [...decision.reasons] : ['unknown'];
        continue;
      }
      // No provider side effect. An exact-message one-time permit still must be minted.
      record.stage = 'permit_required';
      record.reason = 'approved_candidate_requires_exact_message_permit';
    } catch {
      record.reason = 'ledger_preflight_error';
    }
  }
  // Identifiable names, emails, phone numbers, message bodies, and private source URLs
  // are deliberately absent from this summary. Resolve references only within CRM ACLs.
  records.sort((a, b) => b.priority_score - a.priority_score || a.lead_hash.localeCompare(b.lead_hash));
  const counts = records.reduce((obj, row) => { obj[row.reason] = (obj[row.reason] || 0) + 1; return obj; }, {});
  return {
    schema: 'evercraft.proof-first-sales.outreach-queue.v1',
    assessed_at: now.toISOString(),
    total: records.length,
    permit_candidates: records.filter((r) => r.stage === 'permit_required').length,
    send_attempts: 0,
    paid_orders: 0,
    sending_enabled: false,
    reasons: counts,
    records,
  };
}
