import test from 'node:test';
import assert from 'node:assert/strict';
import { proposePaperOrder } from './paper-order-gate.mjs';

const now = new Date('2026-11-10T19:00:00.000Z');
const broker = Object.freeze({
  schema: 'evercraft.daytrade.paper-broker-preflight.v1',
  observed_at: '2026-11-10T18:59:58.000Z',
  environment: 'ALPACA_PAPER_ONLY',
  mode: 'READ_ONLY_NO_ORDERS',
  verified_paper_auth: true, live_trade_authority: false,
  order_submission_enabled: false,
  account_ready: true, history_complete: true, flat_at_probe: true,
  market_open: true, broker_cash_available: true, broker_buying_power_available: true,
  positions_count: 0, open_orders_count: 0, orders_today_utc: 0,
});
const signal = Object.freeze({
  signal_id: 'signal_AAPL_20261110_001',
  precommit_hash: 'a'.repeat(64),
  symbol: 'AAPL', side: 'buy', asset_class: 'us_equity',
  order_type: 'market', time_in_force: 'day', source: 'ALPACA_IEX',
  observed_at: '2026-11-10T18:59:59.000Z',
  notional_usd: 10, reference_price_usd: 100,
  planned_stop_price_usd: 99.5, planned_target_price_usd: 101.5,
 });
const riskAttestation = Object.freeze({
  schema: 'evercraft.daytrade.independent-risk-proof.v1',
  reviewer_role: 'INDEPENDENT_RISK',
  approved: true,
  signal_id: signal.signal_id,
  precommit_hash: signal.precommit_hash,
  broker_snapshot_at: broker.observed_at,
  issued_at: '2026-11-10T18:59:59.000Z',
  daily_realized_loss_usd: 0,
});
function propose(b = broker, s = signal, r = riskAttestation) {
  return proposePaperOrder({ broker: b, signal: s, riskAttestation: r, now });
}
test('clean fresh pilot yields deterministic proposal but no submission', () => {
  const a = propose(), b = propose();
  assert.equal(a.admitted, true);
  assert.equal(a.client_order_id, b.client_order_id);
  assert.match(a.client_order_id, /^ecpaper_[a-f0-9]{32}$/);
  assert.equal(a.hypothetical_order.notional, '10.00');
  assert.equal(a.broker_order_submission_enabled, false);
  assert.equal(a.live_trade_authority, false);
  assert.ok(a.stressed_risk_usd <= 0.10);
  assert.ok(a.reward_risk >= 1.5);
});
test('only verified PAPER broker proof is admissible', () => {
  for (const altered of [{ mode: 'LIVE' }, { environment: 'ALPACA_LIVE' },
    { verified_paper_auth: false }, { live_trade_authority: true },
    { order_submission_enabled: true }]) {
    assert.equal(propose({ ...broker, ...altered }).admitted, false);
  }
});
test('missing, stale, future broker snapshots and signals fail closed', () => {
  assert.equal(propose({ ...broker, observed_at: undefined }).admitted, false);
  assert.equal(propose({ ...broker, observed_at: '2026-11-10T18:58:00Z' }).admitted, false);
  assert.equal(propose({ ...broker, observed_at: '2026-11-10T19:02:00Z' }).admitted, false);
  assert.equal(propose(broker, { ...signal, observed_at: '2026-11-10T18:59:00Z' }).admitted, false);
});
test('existing order, positions, incomplete history and market closed all block', () => {
  for (const altered of [{ orders_today_utc: 1 }, { open_orders_count: 1 },
    { positions_count: 1 }, { history_complete: false }, { market_open: false },
    { flat_at_probe: false }, { account_ready: false }, { broker_cash_available: false }]) {
    assert.equal(propose({ ...broker, ...altered }).admitted, false);
  }
});
test('rejects more than $20 notional, stressed risk, and insufficient reward', () => {
  assert.equal(propose(broker, { ...signal, notional_usd: 20.01 }).admitted, false);
  assert.equal(propose(broker, { ...signal, planned_stop_price_usd: 98 }).admitted, false);
  assert.equal(propose(broker, { ...signal, planned_target_price_usd: 100.2 }).admitted, false);
});
test('independent risk certification is separate and bound to exact signal and snapshot', () => {
  assert.equal(propose(broker, signal, undefined).admitted, true);
  assert.equal(propose(broker, signal, null).admitted, false);
  assert.equal(propose(broker, signal, { ...riskAttestation, approved: false }).admitted, false);
  assert.equal(propose(broker, signal, { ...riskAttestation, daily_realized_loss_usd: -0.01 }).admitted, false);
  assert.equal(propose(broker, signal, { ...riskAttestation, signal_id: 'other' }).admitted, false);
  assert.equal(propose(broker, signal, { ...riskAttestation, reviewer_role: 'SCOUT' }).admitted, false);
  assert.equal(propose(broker, signal, { ...riskAttestation, issued_at: '2026-11-10T18:50:00.000Z' }).admitted, false);
});
test('fail-closed malformed contract, no crypto/options/short entries', () => {
  for (const altered of [{ side: 'sell' }, { asset_class: 'crypto' }, { symbol: 'BTC/USD' },
    { source: 'UNVERIFIED' }, { order_type: 'limit' }, { time_in_force: 'gtc' },
    { precommit_hash: 'bad' }, { reference_price_usd: '100' }, { notional_usd: Infinity }]) {
    assert.equal(propose(broker, { ...signal, ...altered }).admitted, false);
  }
});
test('independent risk control does not accept unknown broker order counts', () => {
  assert.equal(propose({ ...broker, orders_today_utc: undefined }).admitted, false);
  assert.equal(propose({ ...broker, orders_today_utc: 0.5 }).admitted, false);
});

test('self-certifying strategy can never override missing independent approval', () => {
  assert.equal(propose(broker, { ...signal, independent_risk_approval: true, certified_daily_realized_loss_usd: 0 }, null).admitted, false);
});
