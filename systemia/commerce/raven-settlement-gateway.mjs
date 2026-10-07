import { selectRavenSettlementRoute } from './raven-settlement-router.mjs';

function clean(value) {
  return String(value ?? '').trim();
}

function requireValue(value, label) {
  const text = clean(value);
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function formBody(fields = {}) {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(fields || {})) {
    if (raw == null) continue;
    if (Array.isArray(raw)) {
      for (const item of raw) params.append(key, String(item));
    } else {
      params.set(key, String(raw));
    }
  }
  return params;
}

const OPERATION_BUILDERS = {
  'event.get': ({ event_id }) => ({
    method: 'GET',
    path: `/events/${encodeURIComponent(requireValue(event_id, 'event_id'))}`,
  }),
  'checkout_session.get': ({ session_id, expand = true }) => ({
    method: 'GET',
    path: `/checkout/sessions/${encodeURIComponent(requireValue(session_id, 'session_id'))}${expand ? '?expand[]=payment_intent&expand[]=subscription' : ''}`,
  }),
  'checkout_session.list': ({ limit = 100 } = {}) => ({
    method: 'GET',
    path: `/checkout/sessions?limit=${Math.max(1, Math.min(100, Number(limit) || 100))}`,
  }),
  'product.list': ({ active = true, limit = 100 } = {}) => ({
    method: 'GET',
    path: `/products?active=${active ? 'true' : 'false'}&limit=${Math.max(1, Math.min(100, Number(limit) || 100))}`,
  }),
  'product.create': ({ form = {} } = {}) => ({
    method: 'POST',
    path: '/products',
    body: formBody(form),
  }),
  'price.list': ({ product, active = true, limit = 100 } = {}) => ({
    method: 'GET',
    path: `/prices?active=${active ? 'true' : 'false'}&product=${encodeURIComponent(requireValue(product, 'product'))}&limit=${Math.max(1, Math.min(100, Number(limit) || 100))}`,
  }),
  'price.create': ({ form = {} } = {}) => ({
    method: 'POST',
    path: '/prices',
    body: formBody(form),
  }),
  'checkout_session.create': ({ form = {} } = {}) => ({
    method: 'POST',
    path: '/checkout/sessions',
    body: formBody(form),
  }),
  'payment_link.list': ({ active = true, limit = 100 } = {}) => ({
    method: 'GET',
    path: `/payment_links?active=${active ? 'true' : 'false'}&limit=${Math.max(1, Math.min(100, Number(limit) || 100))}`,
  }),
  'payment_link.create': ({ form = {} } = {}) => ({
    method: 'POST',
    path: '/payment_links',
    body: formBody(form),
  }),
  'webhook_endpoint.list': ({ limit = 100 } = {}) => ({
    method: 'GET',
    path: `/webhook_endpoints?limit=${Math.max(1, Math.min(100, Number(limit) || 100))}`,
  }),
  'webhook_endpoint.create': ({ form = {} } = {}) => ({
    method: 'POST',
    path: '/webhook_endpoints',
    body: formBody(form),
  }),
};

export function createStripeRavenAdapter({
  secret,
  fetchImpl = globalThis.fetch,
  adapterKey = 'evercraft-payments-central-v1',
  priority = 10,
} = {}) {
  const token = clean(secret);
  const execute = async ({ operation, params }) => {
    if (!token) throw new Error('Raven downstream settlement adapter credential is unavailable.');
    if (typeof fetchImpl !== 'function') throw new Error('Raven downstream fetch implementation is unavailable.');

    const build = OPERATION_BUILDERS[clean(operation)];
    if (!build) throw new Error(`Unsupported Raven settlement operation: ${clean(operation) || 'missing'}`);
    const request = build(params || {});

    const response = await fetchImpl(`https://api.stripe.com/v1${request.path}`, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(request.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      ...(request.body ? { body: request.body } : {}),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error?.message || `Raven downstream adapter HTTP ${response.status}`);
    }

    return {
      adapter_key: adapterKey,
      route_key: adapterKey,
      provider: 'stripe',
      rail: 'card_bank',
      operation: clean(operation),
      payload,
    };
  };

  return {
    adapter_key: adapterKey,
    route_key: adapterKey,
    provider: 'stripe',
    rail: 'card_bank',
    enabled: Boolean(token),
    health: token ? 'healthy' : 'unavailable',
    currencies: ['USD'],
    billing_modes: ['one_time', 'monthly'],
    priority,
    estimated_fee_bps: 290,
    estimated_fixed_fee_cents: 30,
    estimated_settlement_minutes: 2880,
    execute,
  };
}

export function buildRavenSettlementAdapters({
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const ravenStripeSecret = clean(env?.RAVEN_STRIPE_SECRET_KEY);
  const migrationStripeSecret = clean(env?.STRIPE_SECRET_KEY);
  const secret = ravenStripeSecret || migrationStripeSecret;

  return [
    createStripeRavenAdapter({
      secret,
      fetchImpl,
      adapterKey: 'evercraft-payments-central-v1',
      priority: 10,
    }),
  ];
}

export function createRavenSettlementGateway({ adapters = [] } = {}) {
  const adapterList = Array.isArray(adapters) ? adapters : [];

  return {
    health() {
      return {
        schema: 'evercraft.raven.settlement-health.v1',
        authority: 'Raven Nexus',
        payment_authority: 'Evercraft Payments',
        adapters: adapterList.map((adapter) => ({
          adapter_key: clean(adapter?.adapter_key),
          route_key: clean(adapter?.route_key || adapter?.adapter_key),
          provider: clean(adapter?.provider),
          rail: clean(adapter?.rail),
          enabled: adapter?.enabled !== false,
          health: clean(adapter?.health || 'unknown'),
          currencies: Array.isArray(adapter?.currencies) ? adapter.currencies : [],
          billing_modes: Array.isArray(adapter?.billing_modes) ? adapter.billing_modes : [],
        })),
        doctrine: {
          raven_executes_settlement_adapters: true,
          evercraft_payments_owns_paid_state: true,
          adapter_response_is_observation_not_receipt: true,
        },
      };
    },

    route(order) {
      return selectRavenSettlementRoute({ order, adapters: adapterList });
    },

    async execute({ order, operation, params = {} } = {}) {
      const route = selectRavenSettlementRoute({ order, adapters: adapterList });
      if (route.route_state !== 'selected' || !route.selected_adapter) {
        const error = new Error('Raven Nexus found no eligible settlement adapter.');
        error.code = 'RAVEN_NO_ELIGIBLE_ADAPTER';
        throw error;
      }

      const selected = adapterList.find(
        (adapter) => clean(adapter?.adapter_key) === route.selected_adapter.adapter_key
      );
      if (!selected || typeof selected.execute !== 'function') {
        const error = new Error('Selected Raven settlement adapter cannot execute.');
        error.code = 'RAVEN_ADAPTER_EXECUTION_UNAVAILABLE';
        throw error;
      }

      const downstream = await selected.execute({ order, operation, params });

      return {
        schema: 'evercraft.raven.settlement-observation.v1',
        authority: 'Raven Nexus',
        payment_authority: 'Evercraft Payments',
        order_key: route.order_key,
        amount_cents: route.amount_cents,
        currency: route.currency,
        billing_mode: route.billing_mode,
        route_key: route.selected_adapter.adapter_key,
        adapter_key: route.selected_adapter.adapter_key,
        provider: route.selected_adapter.provider,
        rail: route.selected_adapter.rail,
        operation: clean(operation),
        observed_at: new Date().toISOString(),
        canonical_paid: false,
        receipt_created: false,
        downstream,
        doctrine: {
          observation_is_not_payment_proof: true,
          only_evercraft_payments_can_mint_receipt: true,
        },
      };
    },
  };
}
