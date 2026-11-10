// Alpaca PAPER-only, read-only credential and broker-state preflight.
// NO ORDER ENDPOINTS, NO POST/DELETE, NO LIVE HOST, NO LIVE TRADE AUTHORITY.
const PAPER_ORIGIN = 'https://paper-api.alpaca.markets';
const ENDPOINTS = Object.freeze([
  '/v2/account',
  '/v2/clock',
  '/v2/positions',
  '/v2/orders?status=all&limit=500&direction=desc',
]);
const OPEN_ORDER_STATUSES = new Set([
  'accepted', 'pending_new', 'accepted_for_bidding', 'new',
  'partially_filled', 'pending_cancel', 'pending_replace',
  'stopped', 'suspended', 'calculated',
]);

export function paperPreflightCredentialSource(env = process.env) {
  // Existing Evercraft secret names are accepted FOR THIS READ-ONLY PROBE ONLY.
  // There is no fallthrough to a live API endpoint. A live-only key will fail paper authentication.
  const dedicated = env.ALPACA_PAPER_KEY_ID && env.ALPACA_PAPER_SECRET_KEY;
  if (dedicated) {
    return { key: env.ALPACA_PAPER_KEY_ID, secret: env.ALPACA_PAPER_SECRET_KEY, source: 'dedicated_paper_pair' };
  }
  if (env.ALPACA_TRADING && env.ALPACA_TRADING_SECRET) {
    return { key: env.ALPACA_TRADING, secret: env.ALPACA_TRADING_SECRET, source: 'legacy_pair_readonly_paper_probe' };
  }
  return null;
}

function asNonnegativeMoney(value, label) {
  const parsed = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(parsed) || parsed < 0) {
    throw new Error('paper_preflight_invalid_' + label);
  }
  return parsed;
}

function orderIsOpen(order) {
  return OPEN_ORDER_STATUSES.has(String(order.status || '').toLowerCase());
}

function safeCount(orders) {
  const today = new Date().toISOString().slice(0, 10);
  return orders.filter(o => String(o.created_at || '').slice(0, 10) === today).length;
}

export async function inspectPaperBroker({ credentials, fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}) {
  if (!credentials?.key || !credentials?.secret) throw new Error('paper_preflight_credentials_missing');
  if (typeof fetchImpl !== 'function') throw new Error('paper_preflight_fetch_missing');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) {
    throw new Error('paper_preflight_timeout_invalid');
  }
  const responses = [];
  for (const endpoint of ENDPOINTS) {
    const url = new URL(endpoint, PAPER_ORIGIN);
    if (url.origin !== PAPER_ORIGIN || url.protocol !== 'https:') {
      throw new Error('paper_preflight_host_blocked');
    }
    let response;
    try {
      response = await fetchImpl(url.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'APCA-API-KEY-ID': credentials.key,
          'APCA-API-SECRET-KEY': credentials.secret,
          accept: 'application/json',
        },
      });
    } catch {
      throw new Error('paper_preflight_request_failed');
    }
    if (response.redirected || (response.status >= 300 && response.status < 400)) {
      throw new Error('paper_preflight_redirect_blocked');
    }
    if (!response.ok) {
      throw new Error('paper_preflight_broker_http_' + (Number(response.status) || 'unknown'));
    }
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error('paper_preflight_invalid_json'); }
    responses.push(payload);
  }
  const [account, clock, positions, orders] = responses;
  if (!account || typeof account !== 'object' || Array.isArray(account)) throw new Error('paper_preflight_invalid_account');
  if (!clock || typeof clock !== 'object' || typeof clock.is_open !== 'boolean') throw new Error('paper_preflight_invalid_clock');
  if (!Array.isArray(positions) || !Array.isArray(orders)) throw new Error('paper_preflight_invalid_broker_lists');
  if (orders.length >= 500) throw new Error('paper_preflight_orders_pagination_required');
  const cash = asNonnegativeMoney(account.cash, 'cash');
  const buyingPower = asNonnegativeMoney(account.buying_power, 'buying_power');
  const accountReady = account.status === 'ACTIVE' && account.account_blocked === false && account.trading_blocked === false;
  const openOrders = orders.filter(orderIsOpen);
  const verifiedFlat = positions.length === 0 && openOrders.length === 0;
  return Object.freeze({
    schema: 'evercraft.daytrade.paper-broker-preflight.v1',
    environment: 'ALPACA_PAPER_ONLY',
    mode: 'READ_ONLY_NO_ORDERS',
    verified_paper_auth: true,
    account_ready: accountReady,
    market_open: clock.is_open,
    broker_cash_available: cash >= 20,
    broker_buying_power_available: buyingPower >= 20,
    positions_count: positions.length,
    open_orders_count: openOrders.length,
    orders_today_utc: safeCount(orders),
    flat_at_probe: verifiedFlat,
    history_complete: true,
    virtual_pilot_cap_usd: 20,
    order_submission_enabled: false,
    live_trade_authority: false,
    next_gate: 'PAPER_ORDER_ADAPTER_AND_BROKER_FILL_RECONCILIATION_REQUIRED',
  });
}

// CLI never prints credentials or broker identifiers. It does not place orders.
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const credentials = paperPreflightCredentialSource();
  try {
    const result = await inspectPaperBroker({ credentials });
    console.log(JSON.stringify(result));
    if (!result.account_ready || !result.flat_at_probe) process.exitCode = 2;
  } catch (error) {
    console.error(JSON.stringify({ schema: 'evercraft.daytrade.paper-broker-preflight.v1', mode: 'READ_ONLY_NO_ORDERS', status: 'BLOCKED', reason: error.message, live_trade_authority: false }));
    process.exitCode = 1;
  }
}