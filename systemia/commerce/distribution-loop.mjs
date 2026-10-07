const TEST_RE = /(^|[^a-z])(qa|smoke|canary|synthetic|release[-_ ]?test|integration[-_ ]?audit|test)([^a-z]|$)/i;

const clean = (value) => String(value ?? '').trim();
const lower = (value) => clean(value).toLowerCase();

export const OFFLINE_SETTLEMENT_STATES = Object.freeze([
  'requested',
  'instructions_sent',
  'remittance_claimed',
  'received_unverified',
  'deposited_pending',
  'cleared_verified',
  'failed',
  'voided',
]);

export function isTestLikeOrder(order = {}) {
  if (order.synthetic === true) return true;
  const shape = [
    order.order_key,
    order.source_ref,
    order.mission_key,
    order.product_key,
  ].map(clean).join('|');
  return TEST_RE.test(shape);
}

export function hasAttributableHumanIntent({ order = {}, context = {}, offlineSettlement = null } = {}) {
  if (offlineSettlement?.requested_by_customer === true) return true;
  return Boolean(
    clean(order.customer_email) ||
    clean(order.business_name) ||
    clean(order.prospect_key) ||
    clean(context.lead_id) ||
    clean(context.inquiry_id) ||
    clean(context.customer_email) ||
    clean(context.business_name)
  );
}

export function isAnonymousMachineCheckout({ order = {}, context = {} } = {}) {
  return (
    /raven-nexus-purchase-intent/i.test(clean(order.source_ref)) &&
    !hasAttributableHumanIntent({ order, context })
  );
}

function offlineInstruction(state, rail = 'offline') {
  switch (state) {
    case 'requested':
      return {
        stage: 'explicit_intent',
        reason: `Customer selected the ${rail} rail, but remittance instructions are not yet recorded as sent.`,
        next_action: 'Send the approved remittance instructions and required payment paperwork. Keep canonical paid false.',
      };
    case 'instructions_sent':
      return {
        stage: 'explicit_intent',
        reason: `Customer selected the ${rail} rail and remittance instructions are recorded as sent. No settlement proof exists yet.`,
        next_action: 'Do not send another card-checkout chase. Await remittance evidence under the receivable cadence.',
      };
    case 'remittance_claimed':
      return {
        stage: 'explicit_intent',
        reason: `Customer reports ${rail} remittance in transit, but funds are not received or verified.`,
        next_action: 'Track remittance arrival. Keep canonical paid false.',
      };
    case 'received_unverified':
      return {
        stage: 'explicit_intent',
        reason: 'Offline remittance is received but unverified.',
        next_action: 'Validate and deposit the remittance. Do not mint a canonical receipt.',
      };
    case 'deposited_pending':
      return {
        stage: 'explicit_intent',
        reason: 'Offline remittance is deposited but has not cleared.',
        next_action: 'Wait for clearing evidence. Canonical paid remains false.',
      };
    default:
      return null;
  }
}

export function classifyCommercialEvidence({
  order = {},
  context = {},
  receipt = null,
  fulfillmentJob = null,
  offlineSettlement = null,
  reentryEvents = [],
} = {}) {
  const amount_cents = Number(order.amount_cents || 0);
  const base = {
    order_key: clean(order.order_key),
    product_key: clean(order.product_key),
    amount_cents,
    currency: clean(order.currency || 'usd').toLowerCase(),
  };

  if (isTestLikeOrder(order)) {
    return {
      ...base,
      signal_class: 'synthetic_test',
      stage: 'quarantined',
      status: 'quarantined',
      human_intent_state: 'not_human',
      canonical_paid: false,
      next_action: 'Keep out of commercial conversion and revenue metrics.',
    };
  }

  if (isAnonymousMachineCheckout({ order, context }) && !receipt) {
    return {
      ...base,
      signal_class: 'machine_checkout_noise',
      stage: 'quarantined',
      status: 'quarantined',
      human_intent_state: 'not_human',
      canonical_paid: false,
      next_action: 'Do not chase or count as a receivable. Require attributable human intent first.',
    };
  }

  if (Array.isArray(reentryEvents) && reentryEvents.length > 0) {
    return {
      ...base,
      signal_class: 'distribution_reentry',
      stage: 'reentry',
      status: 'converted',
      human_intent_state: 'verified',
      canonical_paid: Boolean(receipt),
      next_action: 'Feed proven referral, repeat-purchase or case-study evidence back into distribution.',
    };
  }

  if (fulfillmentJob?.state === 'delivered') {
    return {
      ...base,
      signal_class: 'delivered',
      stage: 'delivered',
      status: 'open',
      human_intent_state: 'verified',
      canonical_paid: Boolean(receipt),
      next_action: 'Capture the post-delivery outcome and earned re-entry signal.',
    };
  }

  if (receipt && fulfillmentJob) {
    return {
      ...base,
      signal_class: 'fulfillment_open',
      stage: 'fulfilling',
      status: 'open',
      human_intent_state: 'verified',
      canonical_paid: true,
      next_action: 'Advance canonical fulfillment to delivery with durable output evidence.',
    };
  }

  if (receipt) {
    return {
      ...base,
      signal_class: 'canonical_paid',
      stage: 'paid',
      status: 'open',
      human_intent_state: 'verified',
      canonical_paid: true,
      next_action: 'Treat missing fulfillment as an incident and repair the fulfillment path.',
    };
  }

  const attributable = hasAttributableHumanIntent({ order, context, offlineSettlement });
  if (order.state === 'checkout_open' && attributable) {
    const receivable = /invoice|receivable/i.test(clean(order.source_ref));
    const offline = offlineInstruction(
      clean(offlineSettlement?.state),
      clean(offlineSettlement?.rail || 'offline')
    );

    return {
      ...base,
      signal_class: receivable ? 'receivable' : 'real_checkout',
      stage: offline?.stage || 'checkout_open',
      status: 'open',
      human_intent_state: offlineSettlement?.requested_by_customer ? 'explicit' : 'inferred',
      canonical_paid: false,
      reason: offline?.reason || (
        receivable
          ? 'Attributable receivable remains open without a canonical receipt.'
          : 'Attributable checkout remains open without a canonical receipt.'
      ),
      next_action: offline?.next_action || (
        receivable
          ? 'Refresh canonical payment state and execute the bounded receivable cadence.'
          : 'Preserve attribution and continue only through the authorized conversion path.'
      ),
    };
  }

  if (order.state === 'checkout_open') {
    return {
      ...base,
      signal_class: 'machine_checkout_noise',
      stage: 'quarantined',
      status: 'quarantined',
      human_intent_state: 'unknown',
      canonical_paid: false,
      next_action: 'Do not count as a receivable until attributable human intent exists.',
    };
  }

  return {
    ...base,
    signal_class: 'unclassified',
    stage: clean(order.state || 'unknown'),
    status: 'closed',
    human_intent_state: 'unknown',
    canonical_paid: false,
    next_action: 'No commercial action.',
  };
}

export function classifyDiscoveryLane({ discoveryCount = 0, qualificationCount = 0 } = {}) {
  if (Number(qualificationCount) > 0) {
    return {
      signal_class: 'qualified_demand',
      stage: 'qualified',
      human_intent_state: 'inferred',
      next_action: 'Turn the qualified problem into one recommendation and obtain explicit human yes/no purchase intent.',
    };
  }

  return {
    signal_class: 'machine_discovery',
    stage: 'discovered',
    human_intent_state: 'unknown',
    reason: `${Number(discoveryCount) || 0} machine discovery signal(s) with no attributable problem submission.`,
    next_action: 'Route concrete intent into free qualification. Do not promote machine views to customer demand.',
  };
}

export function buildDistributionLoopPortfolio(cases = []) {
  const rows = Array.isArray(cases) ? cases : [];
  const open = rows.filter((row) => row.status === 'open');
  const commercial = open.filter((row) => ['real_checkout', 'receivable'].includes(row.signal_class));
  const quarantined = rows.filter((row) => row.status === 'quarantined');
  const canonicalPaid = rows.filter((row) => row.canonical_paid === true);
  const delivered = rows.filter((row) => row.stage === 'delivered' || row.stage === 'reentry');
  const reentry = rows.filter((row) => row.stage === 'reentry');

  return {
    schema: 'evercraft.distribution.loop-portfolio.v1',
    commercial_open_count: commercial.length,
    commercial_open_amount_cents: commercial.reduce((sum, row) => sum + Number(row.amount_cents || 0), 0),
    quarantined_count: quarantined.length,
    canonical_paid_count: canonicalPaid.length,
    delivered_count: delivered.length,
    reentry_count: reentry.length,
    doctrine: {
      product_is_not_distribution: true,
      checkout_is_not_conversion: true,
      payment_is_not_fulfillment: true,
      delivery_is_not_reentry: true,
    },
  };
}
