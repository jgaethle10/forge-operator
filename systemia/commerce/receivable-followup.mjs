function clean(value) {
  return String(value ?? '').trim();
}

function parsedMs(value) {
  const ms = Date.parse(clean(value));
  return Number.isFinite(ms) ? ms : null;
}

function hoursBetween(start, end) {
  const a = parsedMs(start);
  const b = end instanceof Date ? end.getTime() : parsedMs(end);
  if (a == null || b == null) return null;
  return Math.max(0, Math.round(((b - a) / 36e5) * 10) / 10);
}

export function recommendReceivableFollowup({
  receivable,
  followupHistory = [],
  now = new Date(),
} = {}) {
  if (!receivable) throw new Error('Evercraft Payments receivable is required.');

  const orderKey = clean(receivable?.order_key);
  if (!orderKey) throw new Error('Receivable requires order_key.');

  const canonicalPaid = Boolean(receivable?.canonical_paid);
  const state = clean(receivable?.order_state || receivable?.state).toLowerCase();

  if (canonicalPaid || ['paid', 'cancelled', 'refunded'].includes(state)) {
    return {
      schema: 'evercraft.payments.followup-decision.v1',
      authority: 'Evercraft Payments',
      order_key: orderKey,
      action: 'none',
      reason: canonicalPaid ? 'verified_paid' : `terminal_state_${state}`,
      eligible_to_send: false,
    };
  }

  const openedAt = receivable?.checkout_created_at || receivable?.created_at || receivable?.created_date;
  const ageHours = hoursBetween(openedAt, now);
  if (ageHours == null) {
    return {
      schema: 'evercraft.payments.followup-decision.v1',
      authority: 'Evercraft Payments',
      order_key: orderKey,
      action: 'review',
      reason: 'missing_receivable_age',
      eligible_to_send: false,
    };
  }

  const history = (Array.isArray(followupHistory) ? followupHistory : [])
    .filter((event) => clean(event?.order_key) === orderKey && clean(event?.status) !== 'cancelled')
    .sort((a, b) => (parsedMs(b?.sent_at || b?.created_at) || 0) - (parsedMs(a?.sent_at || a?.created_at) || 0));

  const last = history[0] || null;
  const sinceLastHours = last ? hoursBetween(last?.sent_at || last?.created_at, now) : null;

  let action = 'none';
  let reason = 'fresh_receivable';
  let minimumGapHours = 24;
  let urgency = 'none';

  if (ageHours >= 168) {
    action = 'escalation_review';
    reason = 'open_7d_plus';
    minimumGapHours = 72;
    urgency = 'high';
  } else if (ageHours >= 72) {
    action = 'overdue_reminder';
    reason = 'open_72h_plus';
    minimumGapHours = 48;
    urgency = 'medium';
  } else if (ageHours >= 24) {
    action = 'gentle_reminder';
    reason = 'open_24h_plus';
    minimumGapHours = 24;
    urgency = 'low';
  }

  if (action === 'none') {
    return {
      schema: 'evercraft.payments.followup-decision.v1',
      authority: 'Evercraft Payments',
      order_key: orderKey,
      action,
      reason,
      urgency,
      age_hours: ageHours,
      eligible_to_send: false,
      next_review_after_hours: Math.max(0, 24 - ageHours),
    };
  }

  const duplicateBlocked =
    last &&
    clean(last?.action) === action &&
    sinceLastHours != null &&
    sinceLastHours < minimumGapHours;

  const contactable = Boolean(clean(receivable?.customer_email) || clean(receivable?.customer_phone));

  return {
    schema: 'evercraft.payments.followup-decision.v1',
    authority: 'Evercraft Payments',
    order_key: orderKey,
    action,
    reason: duplicateBlocked ? 'cadence_dedupe_hold' : reason,
    urgency,
    age_hours: ageHours,
    last_followup_hours_ago: sinceLastHours,
    minimum_gap_hours: minimumGapHours,
    contactable,
    eligible_to_send: contactable && !duplicateBlocked,
    send_requires: {
      recheck_payment_immediately_before_send: true,
      suppress_if_verified_paid: true,
      suppress_if_cancelled_or_refunded: true,
      preserve_human_tone: true,
    },
  };
}
