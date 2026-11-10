import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPaperBroker, paperPreflightCredentialSource } from './paper-broker-preflight.mjs';

const paperAccount = { status: 'ACTIVE', account_blocked: false, trading_blocked: false, cash: '100000', buying_power: '400000' };
function mockFetch(payloads, { capture = [], status = 200 } = {}) {
  let index = 0;
  return async (url, opts) => {
    capture.push({ url, method: opts.method, redirect: opts.redirect });
    return { ok: status === 200, status, redirected: false, json: async () => payloads[index++] };
  };
}
const clean = [paperAccount, { is_open: false }, [], []];

test('accepts existing secret names for paper probe without disclosing values', () => {
  assert.deepEqual(paperPreflightCredentialSource({ ALPACA_TRADING: 'key', ALPACA_TRADING_SECRET: 'secret' }),
    { key: 'key', secret: 'secret', source: 'legacy_pair_readonly_paper_probe' });
  assert.equal(paperPreflightCredentialSource({ ALPACA_TRADING: 'key' }), null);
});
test('dedicated paper credentials take precedence and never mix partial pairs', () => {
  const result = paperPreflightCredentialSource({ ALPACA_PAPER_KEY_ID: 'paperKey', ALPACA_PAPER_SECRET_KEY: 'paperSecret', ALPACA_TRADING: 'old', ALPACA_TRADING_SECRET: 'oldSecret' });
  assert.equal(result.key, 'paperKey');
  assert.equal(result.source, 'dedicated_paper_pair');
});
test('success invokes exactly four GET requests to hardcoded paper host, no order writes', async () => {
  const capture = [];
  const result = await inspectPaperBroker({ credentials: { key: 'test', secret: 'test' }, fetchImpl: mockFetch(clean, { capture }) });
  assert.equal(result.environment, 'ALPACA_PAPER_ONLY');
  assert.equal(result.verified_paper_auth, true);
  assert.equal(result.account_ready, true);
  assert.equal(result.flat_at_probe, true);
  assert.equal(result.order_submission_enabled, false);
  assert.equal(result.live_trade_authority, false);
  assert.equal(capture.length, 4);
  for (const req of capture) {
    assert.equal(req.method, 'GET');
    assert.equal(req.redirect, 'manual');
    assert.equal(new URL(req.url).origin, 'https://paper-api.alpaca.markets');
  }
  assert.deepEqual(capture.map(x => new URL(x.url).pathname), ['/v2/account', '/v2/clock', '/v2/positions', '/v2/orders']);
  assert.equal(JSON.stringify(result).includes('test'), false);
});
test('existing positions and open orders prevent flat receipt', async () => {
  const result = await inspectPaperBroker({ credentials: { key: 'x', secret: 'x' }, fetchImpl: mockFetch([
    paperAccount, { is_open: true }, [{ symbol: 'AAPL', qty: '1' }], [{ status: 'new', created_at: new Date().toISOString() }],
  ]) });
  assert.equal(result.flat_at_probe, false);
  assert.equal(result.positions_count, 1);
  assert.equal(result.open_orders_count, 1);
});
test('missing creds fail closed before network', async () => {
  await assert.rejects(() => inspectPaperBroker({ credentials: null, fetchImpl: () => { throw Error('should not call'); } }), /credentials_missing/);
});
test('live credentials rejected at paper host never trigger fallback', async () => {
  const capture = [];
  await assert.rejects(() => inspectPaperBroker({ credentials: { key: 'live', secret: 'live' }, fetchImpl: mockFetch([], { capture, status: 403 }) }), /broker_http_403/);
  assert.equal(capture.length, 1);
  assert.equal(new URL(capture[0].url).origin, 'https://paper-api.alpaca.markets');
});
test('redirects are rejected with no follow', async () => {
  await assert.rejects(() => inspectPaperBroker({ credentials: { key: 'x', secret: 'x' }, fetchImpl: async () => ({ status: 302, ok: false, redirected: false }) }), /redirect_blocked/);
});
test('truncated order history and unknown account amounts fail closed', async () => {
  await assert.rejects(() => inspectPaperBroker({ credentials: { key: 'x', secret: 'x' }, fetchImpl: mockFetch([paperAccount, { is_open: false }, [], Array.from({ length: 500 }, () => ({ status: 'filled' }))]) }), /orders_pagination_required/);
  await assert.rejects(() => inspectPaperBroker({ credentials: { key: 'x', secret: 'x' }, fetchImpl: mockFetch([{ ...paperAccount, cash: undefined }, { is_open: true }, [], []]) }), /invalid_cash/);
});
test('unauthenticated and malformed payloads do not certify readiness', async () => {
  await assert.rejects(() => inspectPaperBroker({ credentials: { key: 'x', secret: 'x' }, fetchImpl: mockFetch([paperAccount, {}, [], []]) }), /invalid_clock/);
  await assert.rejects(() => inspectPaperBroker({ credentials: { key: 'x', secret: 'x' }, fetchImpl: mockFetch([paperAccount, { is_open: true }, 'not an array', []]) }), /invalid_broker_lists/);
});