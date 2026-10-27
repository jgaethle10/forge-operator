import { createHash } from 'node:crypto';

// Fail-closed INTERNAL simulation reader. It neither ingests media nor proves provenance.
export const SCHEMA = 'evercraft.sitesight.internal-demo.v1';
const statuses = new Set(['pending', 'inspection_required', 'verified', 'dismissed', 'closed']);
const kinds = new Set(['helmet', 'vest', 'boots', 'visibility']);
const scenarios = new Set(['arrival', 'scaffold', 'poor']);
const safeOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const validDate = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
const nonempty = v => typeof v === 'string' && v.trim().length > 0;

/**
 * Verify that an exported *fictional* SiteSight session follows its review
 * transitions. This is NOT an authenticated evidence receipt or a PPE detector.
 * Reject rather than silently upgrading unknown imagery to verified safety.
 */
export function validateSiteSightExport(doc) {
  const errors = [];
  const fail = (code, detail) => errors.push({ code, detail });
  if (!obj(doc)) return { ok: false, errors: [{code: 'invalid_document', detail: 'Expected object'}], mode: 'synthetic_only' };
  if (doc.schema !== SCHEMA || doc.document_type !== 'synthetic-review-export') {
    fail('schema', 'Only internal synthetic-review-export v1 is accepted');
  }
  if (!scenarios.has(doc.scenario)) fail('scenario', 'Unsupported fictional scenario');
  if (doc.privacy !== 'session-only, user-triggered export') fail('privacy', 'Unexpected persistence claim');
  if (!validDate(doc.generated_at)) fail('generated_at', 'Invalid generation timestamp');
  if (typeof doc.scope !== 'string' || !doc.scope.includes('fictional non-production')) {
    fail('scope', 'Fictional/non-production disclosure must be present');
  }
  const g = doc.governance;
  if (!obj(g) || g.systemia_admission !== 'unverified' ||
      g.live_ai_detection !== false || g.customer_readiness !== false ||
      g.commercial_checkout !== false || g.human_review_required !== true) {
    fail('authority', 'Production, checkout and admission claims must remain explicitly false/unverified');
  }
  if (!Array.isArray(doc.items) || doc.items.length < 1 || doc.items.length > 100) {
    fail('items', 'Expected 1-100 candidates');
  }
  if (!Array.isArray(doc.events) || doc.events.length < 1 || doc.events.length > 2000) {
    fail('events', 'Expected 1-2000 ordered events');
  }
  if (errors.length) return { ok: false, errors, mode: 'synthetic_only' };

  const byId = new Map();
  for (const item of doc.items) {
    if (!obj(item) || !nonempty(item.id) || !nonempty(item.label) ||
        !statuses.has(item.status) || !kinds.has(item.kind) ||
        !['illustrative', 'unknown'].includes(item.confidence) ||
        byId.has(item.id)) {
      fail('candidate', 'Malformed, duplicated or unsupported candidate');
      continue;
    }
    if (item.confidence === 'unknown' && ['verified','closed','dismissed'].includes(item.status)) {
      fail('unknown_confirmation', item.id + ' cannot be verified from unavailable visual evidence');
    }
    if (item.status === 'inspection_required' && (item.confidence !== 'unknown' || !validDate(item.inspection_requested_at) || !nonempty(item.review_note))) {
      fail('inspection_request', item.id + ' requires a dated manual field-inspection request');
    }
    if (item.status === 'closed' && (!nonempty(item.action_owner) ||
       typeof item.closeout_note !== 'string' || item.closeout_note.trim().length < 16 ||
       !validDate(item.closed_at))) {
      fail('unsupported_closeout', item.id + ' is missing human corrective-action evidence');
    }
    if (item.status !== 'pending' && !validDate(item.reviewed_at)) {
      fail('review_timestamp', item.id + ' missing human review time');
    }
    byId.set(item.id, item);
  }

  const replay = new Map([...byId.keys()].map(id => [id, 'pending']));
  let previous = -Infinity;
  let first = true;
  for (const e of doc.events) {
    if (!obj(e) || !validDate(e.occurred_at) || !nonempty(e.action) ||
        e.scenario !== doc.scenario || !nonempty(e.description)) {
      fail('event_shape', 'Malformed or cross-scenario event');
      continue;
    }
    const stamp = Date.parse(e.occurred_at);
    if (stamp < previous) fail('event_order', 'Event timestamps must be ascending');
    previous = stamp;
    if (first) {
      first = false;
      if (e.action !== 'demo_reset' || e.item_id !== null) fail('first_event', 'Reset must begin synthetic event history');
      continue;
    }
    const prior = replay.get(e.item_id);
    if (!prior) {
      fail('unknown_candidate_event', 'Event references no candidate or an invalid reset');
      continue;
    }
    if (e.action === 'human_verified' && prior === 'pending') {
      if (byId.get(e.item_id).confidence === 'unknown') {
        fail('unknown_confirmation', 'No image-based confirmation of unknown visibility: ' + e.item_id);
      }
      replay.set(e.item_id, 'verified');
    } else if (e.action === 'field_inspection_requested' && prior === 'pending' && byId.get(e.item_id).confidence === 'unknown') {
      replay.set(e.item_id, 'inspection_required');
    } else if (e.action === 'human_dismissed' && prior === 'pending' && byId.get(e.item_id).confidence !== 'unknown') {
      replay.set(e.item_id, 'dismissed');
    } else if (e.action === 'corrective_action_closed' && prior === 'verified') {
      replay.set(e.item_id, 'closed');
    } else {
      fail('invalid_transition', e.action + ' from ' + prior + ' for ' + e.item_id);
    }
  }
  for (const [id, item] of byId) {
    if (replay.get(id) !== item.status) fail('state_mismatch', id + ': claimed ' + item.status + ', replayed ' + replay.get(id));
  }
  const counts = { pending: 0, inspection_required: 0, verified: 0, dismissed: 0, closed: 0 };
  for (const item of byId.values()) counts[item.status]++;
  return { ok: errors.length === 0, errors, mode: 'synthetic_only', counts };
}

export function inspectSiteSightExport(doc) {
  const result = validateSiteSightExport(doc);
  // SHA-256 is a local change detector, NOT a signature or chain-of-custody proof.
  const content_sha256 = createHash('sha256').update(JSON.stringify(doc)).digest('hex');
  return { ...result, content_sha256, authenticated: false, admission: 'unverified', detection: 'not_connected' };
}
