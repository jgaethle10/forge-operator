// Alpaca PAPER one-shot transport candidate. Not deployed; no CLI; defaults OFF.
// This is the only module in this phase containing an order-writing HTTP method.
// Never import or resolve any live trading URL.
import fs from 'node:fs';
import path from 'node:path';
import { inspectPaperBroker } from './paper-broker-preflight.mjs';
import { proposePaperOrder } from './paper-order-gate.mjs';
import { reconcilePaperOrder, paperOrderReconciliationCredentials } from './paper-order-reconciliation.mjs';
import { verifyPaperOwnerPermit } from './paper-owner-permit.mjs';

const PAPER_URL = 'https://paper-api.alpaca.markets/v2/orders';
const ORDER_BY_CLIENT_URL = 'https://paper-api.alpaca.markets/v2/orders:by_client_order_id';
const CLIENT_ID = /^ecpaper_[a-f0-9]{32}$/;
const HASH = /^[a-f0-9]{64}$/;

function assertPaperUrl(url, pathname) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.origin !== 'https://paper-api.alpaca.markets' || u.pathname !== pathname) {
    throw new Error('paper_transport_host_not_allowlisted');
  }
}
function headers(credentials, json = false) {
  return {
    'APCA-API-KEY-ID': credentials.key,
    'APCA-API-SECRET-KEY': credentials.secret,
    accept: 'application/json',
    ...(json ? { 'content-type': 'application/json' } : {}),
  };
}
function appendDurableEvent(root, entry) {
  const fd = fs.openSync(path.join(root, 'one-shot-events.jsonl'), 'a', 0o600);
  try {
    fs.writeSync(fd, JSON.stringify({
      schema: 'evercraft.daytrade.paper-order-execution-event.v1',
      ...entry,
      live_trade_authority: false,
    }) + '\n');
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
}
function ensureNoStop(stopPath) {
  if (!path.isAbsolute(stopPath || '') || fs.existsSync(stopPath)) throw new Error('paper_transport_stop_or_path_invalid');
}
function checkPaperState(snapshot, expectedFingerprint) {
  if (snapshot?.environment !== 'ALPACA_PAPER_ONLY' ||
    snapshot?.account_fingerprint !== expectedFingerprint ||
    snapshot?.verified_paper_auth !== true || snapshot?.account_ready !== true ||
    snapshot?.market_open !== true || snapshot?.history_complete !== true ||
    snapshot?.flat_at_probe !== true || snapshot?.positions_count !== 0 ||
    snapshot?.open_orders_count !== 0 || snapshot?.orders_today_utc !== 0 ||
    snapshot?.broker_cash_available !== true ||
    snapshot?.broker_buying_power_available !== true ||
    snapshot?.live_trade_authority !== false) {
    throw new Error('paper_transport_broker_state_changed');
  }
}
async function proveOrderIdUnused({ fetchImpl, credentials, clientOrderId }) {
  const u = new URL(ORDER_BY_CLIENT_URL);
  u.searchParams.set('client_order_id', clientOrderId);
  assertPaperUrl(u.toString(), '/v2/orders:by_client_order_id');
  let response;
  try {
    response = await fetchImpl(u.toString(), {
      method: 'GET', redirect: 'manual',
      headers: headers(credentials), signal: AbortSignal.timeout(10000),
    });
  } catch { throw new Error('paper_transport_prelookup_uncertain'); }
  if (response.redirected || (response.status >= 300 && response.status < 400)) throw new Error('paper_transport_redirect_rejected');
  if (response.status !== 404) throw new Error('paper_transport_order_id_in_use_or_unverified');
}

export async function submitOneShotPaperOrder({
  allowPaperWrite = false,
  operatorArm,
  env = process.env,
  broker,
  signal,
  riskAttestation,
  permit,
  ownerSigningSecret,
  stateRoot,
  stopFile,
  fetchImpl = globalThis.fetch,
  now = new Date(),
} = {}) {
  // Safe default: do not even read secrets or contact a broker.
  if (allowPaperWrite !== true) return Object.freeze({
    status: 'DISABLED', mode: 'DRY_RUN_NO_NETWORK',
    paper_order_submitted: false, live_trade_authority: false,
  });
  if (operatorArm !== 'AUTHORIZE_ONE_PAPER_ORDER' ||
      typeof fetchImpl !== 'function' || !Number.isFinite(now?.getTime?.())) {
    throw new Error('paper_transport_explicit_operator_arm_missing');
  }
  const credentials = paperOrderReconciliationCredentials(env);
  if (!credentials) throw new Error('paper_transport_dedicated_paper_credentials_required');
  if (!path.isAbsolute(stateRoot || '')) throw new Error('paper_transport_state_root_required');
  ensureNoStop(stopFile);
  const proposal = proposePaperOrder({ broker, signal, riskAttestation, now });
  if (!proposal.admitted || !CLIENT_ID.test(proposal.client_order_id || '') ||
      proposal.hypothetical_order?.side !== 'buy' ||
      proposal.hypothetical_order?.type !== 'market' ||
      proposal.hypothetical_order?.time_in_force !== 'day' ||
      proposal.hypothetical_order?.notional === undefined ||
      !(Number(proposal.hypothetical_order.notional) > 0) ||
      Number(proposal.hypothetical_order.notional) > 20 ||
      !HASH.test(broker?.account_fingerprint || '')) {
    throw new Error('paper_transport_proposal_not_eligible');
  }
  verifyPaperOwnerPermit({
    permit, signingSecret: ownerSigningSecret, proposal, broker, now,
  });

  // Only one session attempt per state root, ever. A crash leaves the lock in place.
  // Recovery requires independent inspection and manual replacement of this whole lab state.
  fs.mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
  const lock = path.join(stateRoot, 'one-shot.lock');
  try { fs.mkdirSync(lock, { mode: 0o700 }); }
  catch { throw new Error('paper_transport_prior_attempt_locked'); }

  const clientOrderId = proposal.client_order_id;
  appendDurableEvent(stateRoot, { state: 'INTENT_LOCKED', client_order_id: clientOrderId, time: now.toISOString() });
  try {
    ensureNoStop(stopFile);
    const latest = await inspectPaperBroker({ credentials, fetchImpl });
    checkPaperState(latest, broker.account_fingerprint);
    // A duplicate broker order or uncertain pre-lookup aborts, never submits.
    await proveOrderIdUnused({ fetchImpl, credentials, clientOrderId });
    ensureNoStop(stopFile);
    // Durable marker MUST precede the single POST. Never retry after this marker.
    appendDurableEvent(stateRoot, { state: 'POST_POSSIBLE_NO_AUTORETRY', client_order_id: clientOrderId, time: new Date().toISOString() });

    assertPaperUrl(PAPER_URL, '/v2/orders');
    let response;
    try {
      response = await fetchImpl(PAPER_URL, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
        headers: headers(credentials, true),
        body: JSON.stringify({
          symbol: proposal.hypothetical_order.symbol,
          notional: proposal.hypothetical_order.notional,
          side: 'buy',
          type: 'market',
          time_in_force: 'day',
          extended_hours: false,
          client_order_id: clientOrderId,
        }),
      });
    } catch {
      throw new Error('paper_transport_post_outcome_unknown');
    }
    if (response.redirected || (response.status >= 300 && response.status < 400)) {
      throw new Error('paper_transport_post_redirect_unknown');
    }
    if (![200, 201, 202].includes(response.status)) {
      throw new Error('paper_transport_post_not_acknowledged_' + (Number(response.status) || 'unknown'));
    }
    appendDurableEvent(stateRoot, {
      state: 'PAPER_POST_ACKNOWLEDGED_NOT_A_FILL',
      client_order_id: clientOrderId,
      broker_http_status: response.status,
      time: new Date().toISOString(),
    });
    const readback = await reconcilePaperOrder({ credentials, clientOrderId, fetchImpl });
    if (readback.symbol !== proposal.hypothetical_order.symbol ||
      readback.live_trade_authority !== false) {
      throw new Error('paper_transport_broker_order_mismatch');
    }
    appendDurableEvent(stateRoot, {
      state: 'PAPER_BROKER_READBACK_CONFIRMED',
      client_order_id: clientOrderId,
      order_status: readback.status,
      complete_paper_fill: readback.broker_confirmed_complete_paper_fill,
      time: new Date().toISOString(),
    });
    return Object.freeze({
      schema: 'evercraft.daytrade.paper-one-shot-execution-receipt.v1',
      status: 'PAPER_BROKER_READBACK_CONFIRMED',
      client_order_id: clientOrderId,
      paper_order_submitted: true,
      broker_confirmed_complete_paper_fill: readback.broker_confirmed_complete_paper_fill,
      broker_status: readback.status,
      realized_pnl_verified: false,
      additional_orders_permitted: false,
      requires_manual_ledger_review: true,
      live_trade_authority: false,
    });
  } catch (error) {
    // Any unknown or failed outcome freezes session and preserves the lock.
    appendDurableEvent(stateRoot, {
      state: 'FROZEN_MANUAL_RECONCILIATION_REQUIRED',
      client_order_id: clientOrderId,
      reason: /^paper_[a-z0-9_]+$/.test(error?.message || '') ? error.message : 'paper_transport_unknown_failure',
      time: new Date().toISOString(),
    });
    throw new Error('paper_transport_frozen_manual_review_required');
  }
}