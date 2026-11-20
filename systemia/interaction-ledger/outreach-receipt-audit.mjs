import fs from 'node:fs';
import { createHmac } from 'node:crypto';

// A read-only reporting adapter to the canonical Interaction Ledger, never a sender.
// Every row must originate in an authenticated private-provider ingestion process.
export const OUTREACH_AUDIT_SCHEMA = 'evercraft.interaction-ledger.outreach-receipt-audit.v1';
const KINDS = new Set(['sent', 'human_reply', 'auto_reply', 'hard_bounce', 'soft_bounce', 'opt_out']);
const DAY = 86_400_000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function required(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(label + '_required');
  return value.trim();
}
function moment(value, label) {
  const ms = Date.parse(required(value, label));
  if (!Number.isFinite(ms)) throw new Error(label + '_invalid');
  return ms;
}
function emailKey(raw, secret) {
  const email = required(raw, 'contact').toLowerCase();
  if (!EMAIL.test(email)) throw new Error('contact_invalid');
  return createHmac('sha256', secret).update('evercraft:email:v1:' + email).digest('hex');
}

/**
 * Audit *authoritative, privately ingested* mail-provider receipts in memory.
 * The caller MUST map DSNs to actual original recipients; never trust a mail body,
 * snippet, subject, user-supplied JSON, or an AI classification as a provider receipt.
 * This analyzer creates no Passport grant and cannot authorize or send anything.
 * All output identities are keyed HMACs, not raw emails or message contents.
 */
export function auditOutreachReceipts({ events, now, hmacSecret, coverage, softDailyCap = 400 } = {}) {
  if (!Array.isArray(events)) throw new Error('events_array_required');
  if (typeof hmacSecret !== 'string' || Buffer.byteLength(hmacSecret) < 32) {
    throw new Error('private_hmac_secret_at_least_32_bytes_required');
  }
  if (!Number.isSafeInteger(softDailyCap) || softDailyCap < 1 || softDailyCap > 10_000) {
    throw new Error('soft_daily_cap_invalid');
  }
  const at = moment(now, 'now');
  const coverageComplete = coverage?.complete === true &&
    Number.isFinite(Date.parse(coverage.from)) && Number.isFinite(Date.parse(coverage.through)) &&
    Date.parse(coverage.from) <= at - DAY && Date.parse(coverage.through) >= at;
  const contacts = new Map();
  const providerSends = new Set();
  const received = new Set();
  let duplicateEvents = 0;
  for (const item of events) {
    if (item?.source !== 'authenticated_provider') throw new Error('authenticated_provider_source_required');
    const id = required(item.provider_id, 'provider_id');
    const kind = required(item.kind, 'kind');
    if (!KINDS.has(kind)) throw new Error('kind_invalid');
    const ts = moment(item.observed_at, 'observed_at');
    if (ts > at) throw new Error('future_receipt_invalid');
    const key = emailKey(item.contact, hmacSecret);
    const eventKey = id + '\u0000' + key + '\u0000' + kind;
    if (received.has(eventKey)) { duplicateEvents += 1; continue; }
    received.add(eventKey);
    let row = contacts.get(key);
    if (!row) { row = { key, sent: [], replies: [], autos: [], hard: [], soft: [], optouts: [] }; contacts.set(key, row); }
    if (kind === 'sent') {
      row.sent.push(ts);
      if (ts >= at - DAY) providerSends.add(id);
    } else if (kind === 'human_reply') row.replies.push(ts);
    else if (kind === 'auto_reply') row.autos.push(ts);
    else if (kind === 'hard_bounce') row.hard.push(ts);
    else if (kind === 'soft_bounce') row.soft.push(ts);
    else row.optouts.push(ts);
  }

  const decisions = [];
  for (const row of contacts.values()) {
    const lastSend = Math.max(-Infinity, ...row.sent);
    const lastHuman = Math.max(-Infinity, ...row.replies);
    const latestSoft = Math.max(-Infinity, ...row.soft);
    const unanswered = row.sent.filter(t => t > lastHuman);
    const recentUnanswered = unanswered.filter(t => t >= at - 7 * DAY).length;
    let state = 'MANUAL_REVIEW';
    let reason = 'never_auto_authorize_contact';
    if (row.optouts.length) { state = 'DENY'; reason = 'channel_opted_out'; }
    else if (row.hard.length) { state = 'DENY'; reason = 'address_hard_bounced'; }
    else if (latestSoft >= lastSend && row.soft.length) { state = 'HOLD'; reason = 'unresolved_delivery_delay'; }
    else if (recentUnanswered >= 2) { state = 'HOLD'; reason = 'multiple_unanswered_outbounds'; }
    else if (lastSend >= at - 48 * 3_600_000 && lastHuman <= lastSend) {
      state = 'HOLD'; reason = 'recent_outbound_no_human_reply';
    } else if (lastHuman > lastSend) { reason = 'human_reply_requires_owner_review'; }
    decisions.push({ contact_key: row.key, status: state, reason,
      sent_receipts: row.sent.length, human_replies: row.replies.length,
      automatic_replies: row.autos.length, unresolved_soft_bounces: row.soft.length });
  }
  decisions.sort((a,b) => a.contact_key.localeCompare(b.contact_key));
  const recentSends = providerSends.size;
  const capAvailable = coverageComplete ? Math.max(0,softDailyCap-recentSends) : null;
  return {
    schema: OUTREACH_AUDIT_SCHEMA, generated_at: new Date(at).toISOString(),
    send_authority: 'NONE_READ_ONLY',
    coverage: coverageComplete ? 'COMPLETE_FOR_LAST_24_HOURS' : 'UNKNOWN_INCOMPLETE_FAIL_CLOSED',
    summary: { unique_sent_messages_last_24h: recentSends, recipient_count: decisions.length,
      duplicate_receipts_discarded: duplicateEvents, denied: decisions.filter(x => x.status === 'DENY').length,
      held: decisions.filter(x => x.status === 'HOLD').length,
      human_replies_observed: [...contacts.values()].reduce((n,x) => n+x.replies.length,0),
      soft_cap_remaining_if_coverage_complete: capAvailable },
    // Soft cap is NOT a claim about Google's provider quota or permission to contact.
    policy: { soft_daily_cap: softDailyCap, provider_quota_verified: false,
      must_use_passport_and_interaction_ledger_preflight: true,
      no_send_even_if_below_cap: true },
    contacts: decisions,
  };
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  // Private input never leaves local runtime. Output contains HMAC tokens only.
  const i = process.argv.indexOf('--input');
  if (i < 0 || !process.argv[i+1]) {
    console.error('Usage: OUTREACH_AUDIT_HMAC_SECRET=<private-32-byte-secret> node outreach-receipt-audit.mjs --input /private/receipts.json');
    process.exitCode = 2;
  } else {
    try {
      const payload = JSON.parse(fs.readFileSync(process.argv[i+1], 'utf8'));
      const result = auditOutreachReceipts({ ...payload, hmacSecret: process.env.OUTREACH_AUDIT_HMAC_SECRET });
      process.stdout.write(JSON.stringify(result,null,2)+'\n');
    } catch (error) {
      console.error('Audit blocked: ' + error.message);
      process.exitCode = 1;
    }
  }
}
