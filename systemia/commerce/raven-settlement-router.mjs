function clean(value) {
  return String(value ?? '').trim();
}

function positiveNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function supports(adapter, order) {
  const currencies = Array.isArray(adapter?.currencies)
    ? adapter.currencies.map((value) => clean(value).toUpperCase())
    : [];
  const billingModes = Array.isArray(adapter?.billing_modes)
    ? adapter.billing_modes.map((value) => clean(value))
    : [];
  const amount = Number(order?.amount_cents || 0);
  const min = positiveNumber(adapter?.min_amount_cents, 0);
  const max = positiveNumber(adapter?.max_amount_cents, Number.POSITIVE_INFINITY);

  return (
    adapter?.enabled !== false &&
    clean(adapter?.health || 'healthy') === 'healthy' &&
    currencies.includes(clean(order?.currency || 'USD').toUpperCase()) &&
    billingModes.includes(clean(order?.billing_mode || 'one_time')) &&
    amount >= min &&
    amount <= max
  );
}

function adapterScore(adapter, order) {
  const amount = Number(order?.amount_cents || 0);
  const priority = positiveNumber(adapter?.priority, 100);
  const feeBps = positiveNumber(adapter?.estimated_fee_bps, 0);
  const fixed = positiveNumber(adapter?.estimated_fixed_fee_cents, 0);
  const settlementMinutes = positiveNumber(adapter?.estimated_settlement_minutes, 1440);
  const estimatedFeeCents = fixed + Math.round((amount * feeBps) / 10000);

  // Priority remains the dominant operator policy, followed by expected cost and then settlement speed.
  return {
    priority,
    estimated_fee_cents: estimatedFeeCents,
    estimated_settlement_minutes: settlementMinutes,
  };
}

function compareRoutes(a, b) {
  return (
    a.score.priority - b.score.priority ||
    a.score.estimated_fee_cents - b.score.estimated_fee_cents ||
    a.score.estimated_settlement_minutes - b.score.estimated_settlement_minutes ||
    a.adapter_key.localeCompare(b.adapter_key)
  );
}

export function selectRavenSettlementRoute({
  order,
  adapters = [],
} = {}) {
  if (!order) throw new Error('Evercraft payment order is required.');

  const orderKey = clean(order?.order_key || order?.order_id);
  const amount = Number(order?.amount_cents);
  const currency = clean(order?.currency || 'USD').toUpperCase();
  const billingMode = clean(order?.billing_mode || 'one_time');

  if (!orderKey) throw new Error('Evercraft payment order requires an order key.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Evercraft payment order requires a positive amount.');
  if (!currency) throw new Error('Evercraft payment order requires currency.');

  const eligible = (Array.isArray(adapters) ? adapters : [])
    .filter((adapter) => clean(adapter?.adapter_key) && supports(adapter, { ...order, currency, billing_mode: billingMode }))
    .map((adapter) => ({
      adapter_key: clean(adapter.adapter_key),
      rail: clean(adapter.rail || adapter.adapter_key),
      provider: clean(adapter.provider || adapter.adapter_key),
      score: adapterScore(adapter, order),
      capabilities: {
        currency,
        billing_mode: billingMode,
      },
    }))
    .sort(compareRoutes);

  const selected = eligible[0] || null;

  return {
    schema: 'evercraft.payments.raven-route.v1',
    authority: 'Evercraft Payments',
    settlement_router: 'Raven Nexus',
    order_key: orderKey,
    amount_cents: amount,
    currency,
    billing_mode: billingMode,
    route_state: selected ? 'selected' : 'blocked_no_eligible_adapter',
    selected_adapter: selected,
    fallback_adapters: selected ? eligible.slice(1) : [],
    doctrine: {
      provider_is_replaceable_adapter: true,
      route_selection_is_not_payment_proof: true,
      route_selection_must_not_mutate_amount_or_currency: true,
      unhealthy_or_incompatible_adapters_fail_closed: true,
    },
  };
}

export function rankRavenSettlementRoutes(args = {}) {
  const result = selectRavenSettlementRoute(args);
  return result.selected_adapter
    ? [result.selected_adapter, ...result.fallback_adapters]
    : [];
}
