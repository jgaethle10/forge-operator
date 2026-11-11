// Evercraft DayTrade Lens: PAPER-only admission planning.
// This file does not access a network or submit orders.
// Signal, preflight and risk checks must be satisfied before any later paper execution adapter exists.
import { createHash } from 'node:crypto';

const LIMITS = Object.freeze({
  max_virtual_notional_usd: 20,
  max_stressed_risk_usd: 0.10,
  max_daily_loss_usd: 0.20,
  max_broker_orders_today: 0,
  max_signal_age_ms: 30_000,
  max_preflight_age_ms: 60_000,
  max_future_clock_skew_ms: 2_000,
  minimum_reward_risk: 1.5,
  adverse_slippage_bps: 10,
  cost_reserve_bps: 5,
});

function finitePositive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function ageMs(iso, nowMs) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(iso)) return null;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return null;
  const age = nowMs - parsed;
  if (age < -LIMITS.max_future_clock_skew_ms) return null;
  return age;
}

export function proposePaperOrder({ broker, signal, now = new Date() } = {}) {
  const reasons = [];
  const nowMs = now instanceof Date ? now.getTime() : NaN;
  if (!Number.isFinite(nowMs)) throw new Error('paper_gate_clock_invalid');
  if (!broker || broker.schema !== 'evercraft.daytrade.paper-broker-preflight.v1' ||
    broker.environment !== 'ALPACA_PAPER_ONLY' || broker.mode !== 'READ_ONLY_NO_ORDERS' ||
    broker.verified_paper_auth !== true || broker.live_trade_authority !== false ||
    broker.order_submission_enabled !== false) reasons.push('paper_broker_proof_missing');
  const preflightAge = ageMs(broker?.observed_at, nowMs);
  if (preflightAge === null || preflightAge > LIMITS.max_preflight_age_ms) reasons.push('broker_snapshot_stale_or_missing');
  if (broker?.account_ready !== true || broker?.history_complete !== true ||
    broker?.flat_at_probe !== true || broker?.market_open !== true ||
    broker?.broker_cash_available !== true || broker?.broker_buying_power_available !== true ||
    broker?.positions_count !== 0 || broker?.open_orders_count !== 0 ||
    broker?.orders_today_utc !== LIMITS.max_broker_orders_today) reasons.push('broker_state_ineligible');

  const symbol = signal?.symbol;
  const signalId = signal?.signal_id;
  const strategyHash = signal?.precommit_hash;
  if (typeof symbol !== 'string' || !/^[A-Z]{1,5}$/.test(symbol) ||
    typeof signalId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(signalId) ||
    typeof strategyHash !== 'string' || !/^[a-f0-9]{64}$/i.test(strategyHash) ||
    signal?.side !== 'buy' || signal?.asset_class !== 'us_equity' ||
    signal?.source !== 'ALPACA_IEX' || signal?.time_in_force !== 'day' ||
    signal?.order_type !== 'market') reasons.push('signal_contract_invalid');
  const signalAge = ageMs(signal?.observed_at, nowMs);
  if (signalAge === null || signalAge > LIMITS.max_signal_age_ms) reasons.push('signal_stale_or_missing');
  const notional = signal?.notional_usd;
  const price = signal?.reference_price_usd;
  const stop = signal?.planned_stop_price_usd;
  const target = signal?.planned_target_price_usd;
  let projectedRisk = null, projectedReward = null, riskReward = null;
  if (!finitePositive(notional) || notional > LIMITS.max_virtual_notional_usd ||
    !finitePositive(price) || !finitePositive(stop) || !finitePositive(target) ||
    stop >= price || target <= price) reasons.push('sizing_or_protective_prices_invalid');
  else {
    const qty = notional / price;
    const stressedCharges = notional * (LIMITS.adverse_slippage_bps + LIMITS.cost_reserve_bps) / 10_000;
    projectedRisk = (price - stop) * qty + stressedCharges;
    projectedReward = (target - price) * qty - stressedCharges;
    riskReward = projectedReward / projectedRisk;
    if (projectedRisk > LIMITS.max_stressed_risk_usd + 1e-9 ||
      projectedReward <= 0 || riskReward < LIMITS.minimum_reward_risk) reasons.push('pilot_risk_budget_exceeded');
  }
  // This pilot does not trust an unverified P&L figure. It requires independent certification.
  if (signal?.certified_daily_realized_loss_usd !== 0 ||
    signal?.independent_risk_approval !== true) reasons.push('independent_daily_risk_certification_required');

  const admitted = reasons.length === 0;
  const clientOrderId = admitted ? 'ecpaper_' + createHash('sha256')
    .update(signal.signal_id + ':' + signal.precommit_hash).digest('hex').slice(0, 32) : null;

  return Object.freeze({
    schema: 'evercraft.daytrade.paper-order-proposal.v1',
    mode: 'PAPER_PROPOSAL_ONLY',
    admitted,
    reasons: Object.freeze(reasons),
    client_order_id: clientOrderId,
    hypothetical_order: admitted ? Object.freeze({
      symbol,
      side: 'buy',
      type: 'market',
      time_in_force: 'day',
      notional: notional.toFixed(2),
      client_order_id: clientOrderId,
    }) : null,
    stressed_risk_usd: projectedRisk === null ? null : Number(projectedRisk.toFixed(6)),
    reward_risk: riskReward === null ? null : Number(riskReward.toFixed(4)),
    simulated_risk_is_not_guaranteed: true,
    requires_broker_confirmed_fill: true,
    broker_order_submission_enabled: false,
    live_trade_authority: false,
    limits: LIMITS,
  });
}
