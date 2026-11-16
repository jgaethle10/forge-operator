import test from 'node:test';
import assert from 'node:assert/strict';
import { probePaperAccount, selectPaperProbeCredentials } from './paper-auth-canary.mjs';

test('dedicated paper keys beat existing legacy secret names', () => {
  const env = { ALPACA_PAPER_KEY_ID: 'p', ALPACA_PAPER_SECRET_KEY: 'ps', ALPACA_TRADING: 'l', ALPACA_TRADING_SECRET: 'ls' };
  assert.deepEqual(selectPaperProbeCredentials(env), { key: 'p', secret: 'ps', source: 'dedicated_paper_pair' });
});
test('existing stored legacy pair is usable for paper-host GET verification only', () => {
  const p = selectPaperProbeCredentials({ ALPACA_TRADING: 'l', ALPACA_TRADING_SECRET: 'ls' });
  assert.equal(p.source, 'legacy_pair_paper_read_probe_only');
  assert.equal(p.key, 'l');
});
test('partial paper or legacy pairs fail closed', () => {
  assert.equal(selectPaperProbeCredentials({ ALPACA_PAPER_KEY_ID: 'p', ALPACA_TRADING: 'l', ALPACA_TRADING_SECRET: 'ls' }), null);
  assert.equal(selectPaperProbeCredentials({ ALPACA_TRADING: 'l' }), null);
  assert.equal(selectPaperProbeCredentials({}), null);
});
test('performs exactly one GET to PAPER /v2/account with manual redirect blocking', async () => {
  const calls = [];
  const receipt = await probePaperAccount({
    credentials: { key: 'not-real-key', secret: 'not-real-secret', source: 'test' },
    fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method, redirect: options.redirect });
      assert.equal(options.headers['APCA-API-KEY-ID'], 'not-real-key');
      assert.equal(options.headers['APCA-API-SECRET-KEY'], 'not-real-secret');
      return { ok: true, status: 200, redirected: false, json: async () => ({
        status: 'ACTIVE', id: 'DO-NOT-PRINT', account_number: 'DO-NOT-PRINT',
      }) };
    },
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    url: 'https://paper-api.alpaca.markets/v2/account',
    method: 'GET', redirect: 'manual',
  });
  assert.equal(receipt.paper_api_authenticated, true);
  assert.equal(receipt.account_active, true);
  assert.equal(receipt.broker_orders_submitted, 0);
  assert.equal(receipt.live_trade_authority, false);
  const printable = JSON.stringify(receipt);
  assert.equal(printable.includes('DO-NOT-PRINT'), false);
  assert.equal(printable.includes('not-real-secret'), false);
});
test('live-only key rejected by paper API is never redirected to live host', async () => {
  const endpoints = [];
  await assert.rejects(() => probePaperAccount({
    credentials: { key: 'live', secret: 'live' },
    fetchImpl: async (url) => {
      endpoints.push(url);
      return { ok: false, status: 403, redirected: false };
    },
  }), /paper_probe_http_403/);
  assert.deepEqual(endpoints, ['https://paper-api.alpaca.markets/v2/account']);
});
test('redirects fail closed rather than forwarding secrets', async () => {
  await assert.rejects(() => probePaperAccount({
    credentials: { key: 'p', secret: 'p' },
    fetchImpl: async () => ({ ok: false, status: 302, redirected: false }),
  }), /paper_probe_redirect_blocked/);
});
test('malformed broker state never certifies active account', async () => {
  await assert.rejects(() => probePaperAccount({
    credentials: { key: 'p', secret: 'p' },
    fetchImpl: async () => ({ ok: true, status: 200, redirected: false, json: async () => ({ balance: '100000' }) }),
  }), /paper_probe_response_invalid/);
  const x = await probePaperAccount({
    credentials: { key: 'p', secret: 'p' },
    fetchImpl: async () => ({ ok: true, status: 200, redirected: false, json: async () => ({ status: 'INACTIVE' }) }),
  });
  assert.equal(x.paper_api_authenticated, true);
  assert.equal(x.account_active, false);
});
test('network failure does not turn into accepted credentials', async () => {
  await assert.rejects(() => probePaperAccount({
    credentials: { key: 'p', secret: 'p' },
    fetchImpl: async () => { throw new Error('timeout'); },
  }), /paper_probe_network_or_timeout/);
});
