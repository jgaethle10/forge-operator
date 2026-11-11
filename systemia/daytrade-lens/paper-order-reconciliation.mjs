// Read-only PAPER broker order reconciliation; no order placement, cancels, or live URLs.
const PAPER_ORDER_BY_CLIENT = 'https://paper-api.alpaca.markets/v2/orders:by_client_order_id';
const TERMINAL = new Set(['filled', 'canceled', 'expired', 'rejected', 'replaced']);
const KNOWN = new Set([
  ...TERMINAL, 'new', 'accepted', 'pending_new', 'partially_filled',
  'accepted_for_bidding', 'stopped', 'suspended', 'calculated',
  'pending_cancel', 'pending_replace', 'done_for_day',
]);

function nonnegativeNumber(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function reconcilePaperOrder({
  credentials,
  clientOrderId,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10000,
} = {}) {
  if (!credentials?.key || !credentials?.secret) throw new Error('paper_reconcile_paper_credentials_missing');
  if (typeof clientOrderId !== 'string' || !/^ecpaper_[a-f0-9]{32}$/.test(clientOrderId)) {
    throw new Error('paper_reconcile_client_id_invalid');
  }
  if (typeof fetchImpl !== 'function' ||
    !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) {
    throw new Error('paper_reconcile_transport_invalid');
  }
  const url = new URL(PAPER_ORDER_BY_CLIENT);
  url.searchParams.set('client_order_id', clientOrderId);
  if (url.origin !== 'https://paper-api.alpaca.markets') throw new Error('paper_reconcile_host_blocked');
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
    throw new Error('paper_reconcile_request_failed');
  }
  if (response.redirected || (response.status >= 300 && response.status < 400)) {
    throw new Error('paper_reconcile_redirect_blocked');
  }
  if (!response.ok) {
    throw new Error('paper_reconcile_http_' + (Number(response.status) || 'unknown'));
  }
  let order;
  try { order = await response.json(); }
  catch { throw new Error('paper_reconcile_invalid_json'); }
  if (!order || typeof order !== 'object' || Array.isArray(order) ||
    order.client_order_id !== clientOrderId ||
    typeof order.status !== 'string' || !KNOWN.has(order.status)) {
    throw new Error('paper_reconcile_broker_order_mismatch');
  }
  if (order.asset_class !== 'us_equity' || order.side !== 'buy' ||
    typeof order.symbol !== 'string' || !/^[A-Z]{1,5}$/.test(order.symbol)) {
    throw new Error('paper_reconcile_unexpected_contract');
  }
  const filledQty = nonnegativeNumber(order.filled_qty);
  if (filledQty === null) throw new Error('paper_reconcile_invalid_filled_qty');
  const avg = filledQty > 0 ? nonnegativeNumber(order.filled_avg_price) : null;
  if (filledQty > 0 && !(avg > 0)) throw new Error('paper_reconcile_fill_price_missing');
  const isFilled = order.status === 'filled';
  if (isFilled && !(filledQty > 0 && typeof order.filled_at === 'string' &&
    Number.isFinite(Date.parse(order.filled_at)))) throw new Error('paper_reconcile_complete_fill_unproven');
  const expectedQty = order.qty === null || order.qty === undefined ? null : nonnegativeNumber(order.qty);
  if (order.qty !== null && order.qty !== undefined && expectedQty === null) {
    throw new Error('paper_reconcile_qty_invalid');
  }
  if (expectedQty !== null && filledQty > expectedQty + 1e-8) {
    throw new Error('paper_reconcile_filled_qty_exceeds_order');
  }
  if (isFilled && expectedQty !== null && Math.abs(filledQty - expectedQty) > 1e-8) {
    throw new Error('paper_reconcile_full_fill_mismatch');
  }
  return Object.freeze({
    schema: 'evercraft.daytrade.paper-broker-reconciliation.v1',
    environment: 'ALPACA_PAPER_ONLY',
    mode: 'BROKER_READ_ONLY',
    client_order_id: clientOrderId,
    status: order.status,
    symbol: order.symbol,
    terminal: TERMINAL.has(order.status),
    broker_reported_filled_qty: filledQty,
    broker_reported_avg_price: avg,
    broker_partial_fill_observed: filledQty > 0 && !isFilled,
    broker_confirmed_complete_paper_fill: isFilled,
    verified_provenance: 'PAPER_BROKER_GET_ORDER_BY_CLIENT_ID',
    independent_pnl_reconciliation_complete: false,
    live_trade_authority: false,
    order_submission_enabled: false,
  });
}

// Credential source for this read-only process. It MUST use dedicated PAPER secrets.
export function paperOrderReconciliationCredentials(env = process.env) {
  if (!env.ALPACA_PAPER_KEY_ID || !env.ALPACA_PAPER_SECRET_KEY) return null;
  return { key: env.ALPACA_PAPER_KEY_ID, secret: env.ALPACA_PAPER_SECRET_KEY };
}
