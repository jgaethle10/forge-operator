import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePaperOrder, paperOrderReconciliationCredentials } from './paper-order-reconciliation.mjs';

const clientOrderId = 'ecpaper_' + 'a'.repeat(32);
const creds = { key: 'secret-key', secret: 'secret-value' };
const filled = {
  client_order_id: clientOrderId, asset_class: 'us_equity', side: 'buy',
  symbol: 'AAPL', status: 'filled', filled_qty: '0.1', qty: '0.1',
  filled_avg_price: '100', filled_at: '2026-11-10T19:00:00Z',
};
function reply(value, status = 200) {
  return { ok: status === 200, status, redirected: false, json: async () => value };
}
test('PAPER GET by client order ID confirms fill, sends no orders or secret-bearing output', async () => {
  let called = 0;
  const result = await reconcilePaperOrder({
    credentials: creds, clientOrderId,
    fetchImpl: async (url, options) => {
      called++;
      const parsed = new URL(url);
      assert.equal(parsed.origin, 'https://paper-api.alpaca.markets');
      assert.equal(parsed.pathname, '/v2/orders:by_client_order_id');
      assert.equal(parsed.searchParams.get('client_order_id'), clientOrderId);
      assert.equal(options.method, 'GET');
      assert.equal(options.redirect, 'manual');
      return reply(filled);
    },
  });
  assert.equal(called, 1);
  assert.equal(result.broker_confirmed_complete_paper_fill, true);
  assert.equal(result.order_submission_enabled, false);
  assert.equal(result.live_trade_authority, false);
  assert.equal(result.independent_pnl_reconciliation_complete, false);
  assert.equal(JSON.stringify(result).includes(creds.secret), false);
});
test('partial fill remains nonterminal and not a complete fill', async () => {
  const result = await reconcilePaperOrder({
    credentials: creds, clientOrderId,
    fetchImpl: async () => reply({ ...filled, status: 'partially_filled', qty: '0.2', filled_qty: '0.1', filled_at: null }),
  });
  assert.equal(result.broker_partial_fill_observed, true);
  assert.equal(result.broker_confirmed_complete_paper_fill, false);
  assert.equal(result.terminal, false);
});
test('unknown order statuses and mismatched client IDs fail closed', async () => {
  for (const data of [
    { ...filled, status: 'unrecognized' },
    { ...filled, client_order_id: 'ecpaper_' + 'b'.repeat(32) },
    { ...filled, asset_class: 'crypto' },
    { ...filled, side: 'sell' },
  ]) await assert.rejects(() => reconcilePaperOrder({ credentials: creds, clientOrderId, fetchImpl: async () => reply(data) }), /broker_order_mismatch|unexpected_contract/);
});
test('malformed or missing fill evidence cannot be labeled complete', async () => {
  for (const data of [
    { ...filled, filled_qty: '0' },
    { ...filled, filled_avg_price: null },
    { ...filled, filled_at: null },
    { ...filled, qty: '0.2' },
    { ...filled, filled_qty: '0.3' },
  ]) await assert.rejects(() => reconcilePaperOrder({ credentials: creds, clientOrderId, fetchImpl: async () => reply(data) }), /unproven|fill_price_missing|full_fill_mismatch|exceeds_order/);
});
test('HTTP failure and redirects never trigger a live fallback', async () => {
  const captures = [];
  await assert.rejects(() => reconcilePaperOrder({
    credentials: creds, clientOrderId, fetchImpl: async url => {
      captures.push(url);
      return reply(null, 401);
    },
  }), /http_401/);
  await assert.rejects(() => reconcilePaperOrder({
    credentials: creds, clientOrderId, fetchImpl: async url => {
      captures.push(url);
      return { ok: false, redirected: false, status: 302 };
    },
  }), /redirect_blocked/);
  assert.equal(captures.length, 2);
  assert.ok(captures.every(x => new URL(x).origin === 'https://paper-api.alpaca.markets'));
});
test('network failure, missing credentials, invalid ID reject before confirming fill', async () => {
  await assert.rejects(() => reconcilePaperOrder({ credentials: creds, clientOrderId, fetchImpl: async () => { throw new Error('offline'); } }), /request_failed/);
  await assert.rejects(() => reconcilePaperOrder({ credentials: null, clientOrderId }), /credentials_missing/);
  await assert.rejects(() => reconcilePaperOrder({ credentials: creds, clientOrderId: 'not-ours' }), /client_id_invalid/);
});
test('read-only reconciliation credential selector never falls back to live secrets', () => {
  assert.equal(paperOrderReconciliationCredentials({ ALPACA_TRADING: 'live', ALPACA_TRADING_SECRET: 'live-secret' }), null);
  assert.deepEqual(paperOrderReconciliationCredentials({ ALPACA_PAPER_KEY_ID: 'paper', ALPACA_PAPER_SECRET_KEY: 'paper-secret' }), { key: 'paper', secret: 'paper-secret' });
});
