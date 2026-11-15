import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { proposePaperOrder } from './paper-order-gate.mjs';
import { PAPER_OWNER_PERMIT_SCHEMA, signPaperOwnerPermit } from './paper-owner-permit.mjs';
import { submitOneShotPaperOrder } from './paper-one-shot-transport.mjs';

const SIGNING_SECRET = 'owner-secret-that-must-be-separate-from-strategy-agents-123';
const ENV = { ALPACA_PAPER_KEY_ID: 'paper-only-test-id', ALPACA_PAPER_SECRET_KEY: 'paper-only-test-secret' };
function setup(now = new Date()) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ec-paper-canary-'));
  const account = { account_number: 'PAPER-TEST-UNIQUE-54321', status: 'ACTIVE', account_blocked: false,
    trading_blocked: false, cash: '100000', buying_power: '400000' };
  const broker = {
    schema: 'evercraft.daytrade.paper-broker-preflight.v1',
    observed_at: now.toISOString(),
    environment: 'ALPACA_PAPER_ONLY', mode: 'READ_ONLY_NO_ORDERS',
    account_fingerprint: createHash('sha256').update(account.account_number).digest('hex'),
    verified_paper_auth: true, live_trade_authority: false,
    order_submission_enabled: false, account_ready: true, history_complete: true,
    flat_at_probe: true, market_open: true, broker_cash_available: true,
    broker_buying_power_available: true, positions_count: 0,
    open_orders_count: 0, orders_today_utc: 0,
  };
  const signal = {
    signal_id: 'signal_AAPL_20261115_001', precommit_hash: 'a'.repeat(64),
    symbol: 'AAPL', side: 'buy', asset_class: 'us_equity', order_type: 'market',
    time_in_force: 'day', source: 'ALPACA_IEX', observed_at: now.toISOString(),
    notional_usd: 10, reference_price_usd: 100,
    planned_stop_price_usd: 99.5, planned_target_price_usd: 101.5,
  };
  const riskAttestation = {
    schema: 'evercraft.daytrade.independent-risk-proof.v1',
    reviewer_role: 'INDEPENDENT_RISK', approved: true,
    signal_id: signal.signal_id, precommit_hash: signal.precommit_hash,
    broker_snapshot_at: broker.observed_at,
    issued_at: now.toISOString(), daily_realized_loss_usd: 0,
  };
  const proposal = proposePaperOrder({ broker, signal, riskAttestation, now });
  assert.equal(proposal.admitted, true);
  const permit = signPaperOwnerPermit({
    schema: PAPER_OWNER_PERMIT_SCHEMA,
    client_order_id: proposal.client_order_id,
    account_fingerprint: broker.account_fingerprint,
    symbol: 'AAPL', notional: '10.00', broker_snapshot_at: broker.observed_at,
    issued_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 60000).toISOString(),
  }, SIGNING_SECRET);
  const args = {
    allowPaperWrite: true, operatorArm: 'AUTHORIZE_ONE_PAPER_ORDER',
    env: ENV, broker, signal, riskAttestation, permit,
    ownerSigningSecret: SIGNING_SECRET,
    stateRoot: root, stopFile: path.join(root, 'EMERGENCY_STOP'), now,
  };
  return { root, now, account, broker, signal, riskAttestation, proposal, permit, args };
}

function mockPaperFetch(x, { account = x.account, prelookupStatus = 404,
    postStatus = 201, postThrows = false, readbackStatus = 'filled' } = {}) {
  const calls = [];
  let lookups = 0;
  const fetchImpl = async (url, opts) => {
    const u = new URL(url);
    calls.push({ pathname: u.pathname, method: opts.method, origin: u.origin });
    assert.equal(u.origin, 'https://paper-api.alpaca.markets');
    assert.equal(opts.redirect, 'manual');
    assert.equal(opts.headers['APCA-API-KEY-ID'], ENV.ALPACA_PAPER_KEY_ID);
    if (u.pathname === '/v2/account') return { ok: true, status: 200, redirected: false, json: async () => account };
    if (u.pathname === '/v2/clock') return { ok: true, status: 200, redirected: false, json: async () => ({ is_open: true }) };
    if (u.pathname === '/v2/positions') return { ok: true, status: 200, redirected: false, json: async () => [] };
    if (u.pathname === '/v2/orders' && opts.method === 'GET') return { ok: true, status: 200, redirected: false, json: async () => [] };
    if (u.pathname === '/v2/orders:by_client_order_id') {
      assert.equal(opts.method, 'GET');
      assert.equal(u.searchParams.get('client_order_id'), x.proposal.client_order_id);
      lookups += 1;
      if (lookups === 1) return { ok: prelookupStatus === 200, status: prelookupStatus, redirected: false,
        json: async () => ({}) };
      return { ok: true, status: 200, redirected: false, json: async () => ({
        client_order_id: x.proposal.client_order_id,
        asset_class: 'us_equity', side: 'buy', symbol: 'AAPL',
        status: readbackStatus, filled_qty: readbackStatus === 'filled' ? '0.1' : '0',
        qty: '0.1', filled_avg_price: readbackStatus === 'filled' ? '100' : null,
        filled_at: readbackStatus === 'filled' ? x.now.toISOString() : null,
      }) };
    }
    if (u.pathname === '/v2/orders' && opts.method === 'POST') {
      assert.equal(opts.headers['content-type'], 'application/json');
      const body = JSON.parse(opts.body);
      assert.deepEqual(Object.keys(body).sort(), [
        'client_order_id','extended_hours','notional','side','symbol','time_in_force','type'
      ].sort());
      assert.equal(body.notional, '10.00');
      assert.equal(body.extended_hours, false);
      assert.equal(body.client_order_id, x.proposal.client_order_id);
      if (postThrows) throw new Error('post timeout');
      return { ok: [200,201,202].includes(postStatus), status: postStatus, redirected: false };
    }
    throw new Error('unexpected mock request');
  };
  return { fetchImpl, calls };
}
function countPost(calls) { return calls.filter(c => c.method === 'POST').length; }
function cleanup(root) { fs.rmSync(root, { recursive: true, force: true }); }

test('default OFF does not access network, keys or filesystem', async () => {
  const result = await submitOneShotPaperOrder({
    fetchImpl: () => { throw Error('network forbidden'); },
    stateRoot: '/should/not/create/anything',
  });
  assert.equal(result.status, 'DISABLED');
  assert.equal(result.paper_order_submitted, false);
});
test('paper-only credentials, operator arm and permit required before network', async () => {
  const x = setup();
  try {
    let calls = 0;
    const fetchImpl = async () => { calls++; throw Error('forbidden'); };
    await assert.rejects(() => submitOneShotPaperOrder({ ...x.args, operatorArm: 'NO', fetchImpl }), /operator_arm_missing/);
    await assert.rejects(() => submitOneShotPaperOrder({ ...x.args, env: { ALPACA_TRADING: 'live', ALPACA_TRADING_SECRET: 'live' }, fetchImpl }), /dedicated_paper_credentials_required/);
    await assert.rejects(() => submitOneShotPaperOrder({ ...x.args, permit: { ...x.permit, notional: '20.00' }, fetchImpl }), /permit_mismatch/);
    await assert.rejects(() => submitOneShotPaperOrder({ ...x.args, ownerSigningSecret: 'x'.repeat(32), fetchImpl }), /signature_invalid/);
    assert.equal(calls, 0);
  } finally { cleanup(x.root); }
});
test('one explicitly armed PAPER submission, broker readback, permanent session lock', async () => {
  const x = setup();
  try {
    const { fetchImpl, calls } = mockPaperFetch(x);
    const result = await submitOneShotPaperOrder({ ...x.args, fetchImpl });
    assert.equal(result.status, 'PAPER_BROKER_READBACK_CONFIRMED');
    assert.equal(result.broker_confirmed_complete_paper_fill, true);
    assert.equal(result.live_trade_authority, false);
    assert.equal(countPost(calls), 1);
    assert.equal(calls.filter(c => c.origin !== 'https://paper-api.alpaca.markets').length, 0);
    assert.equal(fs.existsSync(path.join(x.root,'one-shot.lock')), true);
    const journal = fs.readFileSync(path.join(x.root,'one-shot-events.jsonl'),'utf8');
    assert.match(journal, /INTENT_LOCKED/);
    assert.match(journal, /POST_POSSIBLE_NO_AUTORETRY/);
    assert.match(journal, /PAPER_BROKER_READBACK_CONFIRMED/);
    assert.equal(journal.includes(ENV.ALPACA_PAPER_SECRET_KEY), false);
    await assert.rejects(() => submitOneShotPaperOrder({ ...x.args, fetchImpl }), /prior_attempt_locked/);
    assert.equal(countPost(calls), 1);
  } finally { cleanup(x.root); }
});
test('existing broker order ID freezes without POST', async () => {
  const x = setup();
  try {
    const { fetchImpl, calls } = mockPaperFetch(x, { prelookupStatus: 200 });
    await assert.rejects(() => submitOneShotPaperOrder({ ...x.args, fetchImpl }), /frozen_manual_review_required/);
    assert.equal(countPost(calls), 0);
    assert.equal(fs.existsSync(path.join(x.root, 'one-shot.lock')), true);
  } finally { cleanup(x.root); }
});
test('account drift freezes without POST', async () => {
  const x = setup();
  try {
    const { fetchImpl, calls } = mockPaperFetch(x, { account: { ...x.account, account_number: 'ANOTHER-ACCOUNT-XYZ' } });
    await assert.rejects(() => submitOneShotPaperOrder({ ...x.args, fetchImpl }), /frozen_manual_review_required/);
    assert.equal(countPost(calls), 0);
  } finally { cleanup(x.root); }
});
test('unknown POST outcome freezes, no retry', async () => {
  const x = setup();
  try {
    const { fetchImpl, calls } = mockPaperFetch(x, { postThrows: true });
    await assert.rejects(() => submitOneShotPaperOrder({ ...x.args, fetchImpl }), /frozen_manual_review_required/);
    assert.equal(countPost(calls), 1);
    await assert.rejects(() => submitOneShotPaperOrder({ ...x.args, fetchImpl }), /prior_attempt_locked/);
    assert.equal(countPost(calls), 1);
    const journal = fs.readFileSync(path.join(x.root, 'one-shot-events.jsonl'), 'utf8');
    assert.match(journal, /FROZEN_MANUAL_RECONCILIATION_REQUIRED/);
  } finally { cleanup(x.root); }
});
test('broker rejection or ambiguous acknowledgement never triggers retry', async () => {
  const x = setup();
  try {
    const { fetchImpl, calls } = mockPaperFetch(x, { postStatus: 422 });
    await assert.rejects(() => submitOneShotPaperOrder({ ...x.args, fetchImpl }), /frozen_manual_review_required/);
    assert.equal(countPost(calls), 1);
  } finally { cleanup(x.root); }
});
test('emergency STOP blocks before acquiring lock or making network calls', async () => {
  const x = setup();
  try {
    fs.writeFileSync(x.args.stopFile, 'STOP');
    let calls = 0;
    await assert.rejects(() => submitOneShotPaperOrder({ ...x.args, fetchImpl: async () => { calls++; } }), /stop_or_path_invalid/);
    assert.equal(calls, 0);
    assert.equal(fs.existsSync(path.join(x.root,'one-shot.lock')), false);
  } finally { cleanup(x.root); }
});
test('expired permit fails before network', async () => {
  const x = setup();
  try {
    const expired = signPaperOwnerPermit({
      ...x.permit, issued_at: new Date(x.now.getTime() - 180000).toISOString(),
      expires_at: new Date(x.now.getTime() - 120000).toISOString(),
    }, SIGNING_SECRET);
    let calls = 0;
    await assert.rejects(() => submitOneShotPaperOrder({ ...x.args, permit: expired, fetchImpl: async () => { calls++; } }), /permit_expired/);
    assert.equal(calls, 0);
  } finally { cleanup(x.root); }
});
