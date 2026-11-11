# DayTrade Lens PAPER Order Certification (Phase 2, dry-run)

Status: **review-stage code only**. This phase deliberately DOES NOT submit orders to Alpaca PAPER or LIVE; no automated or human-confirmed live trading authority is implied. No broker-confirmed orders/fills have been observed from the production account.

## Architecture

- paper-broker-preflight.mjs (from parent PR #1981): GET-only PAPER account/clock/positions/order-history snapshot. Emits observed_at timestamp and does not print credentials.
- paper-order-gate.mjs: pure deterministic proposed order evaluation. Rejects missing/stale broker observations, absent account health, occupied account, unknown recent order history, nonzero daily order count, stale/nonprecommitted market signals, oversized virtual notional or modeled stressed downside, missing independent risk clearance. Creates a deterministic client_order_id from a precommitted signal ID and strategy hash.
- paper-order-reconciliation.mjs: GET-only PAPER order readback by client_order_id. Rejects client ID mismatch, unexpected instrument/side/status and fill inconsistencies. Classifies partial fills separately from broker-confirmed *complete* paper fills. Never labels P&L as reconciled.
- .github/workflows/daytrade-paper-order-certification.yml: mock-only CI. No secrets and no live order submissions.

Limits enforced by **proposal**:
- $20 maximum virtual notional per proposed buy.
- $0.10 maximum *modeled stressed* downside, including 10 bps adverse slippage + 5 bps cost reserve (not a stop-loss guarantee).
- 1.5 minimum modeled reward/risk.
- Zero prior broker orders in the returned UTC-day window, zero open orders and positions.
- PAPER-only US equities, buy-only, day market orders, source labeled Alpaca IEX.
- Signal freshness <= 30 seconds, PAPER account snapshot <= 60 seconds.
- Missing independent certification or any contradictory evidence blocks admission.

## Important limitations

1. Risk is estimated from a proposed stop price and reference price. There is no protective stop order, broker-enforced loss limit, guaranteed fill, or adverse-gap guarantee in this phase. Therefore the proposal **must never be submitted as-is** by an automated team.
2. The independent risk clearance fields are contract placeholders until authenticated, signed and reconciled with broker activity history. They are not security proof. Order execution remains unavailable.
3. Orders today are conservatively gated to exactly zero for this first experimental session. The current preflight uses a UTC-day count, not an exchange-session ledger. It cannot yet authorize recurring intraday orders.
4. Reconciliation only reads an already-existing order, and requires Alpaca's paper host + dedicated ALPACA_PAPER_KEY_ID and ALPACA_PAPER_SECRET_KEY. It never falls back to legacy or live credentials.
5. Broker paper fills are simulated by Alpaca. Passing mock tests does not prove profitability, live price quality, or broker authorization.

## Acceptance steps for a future execution PR

- Merge/review PR #1981 and this stacked phase.
- Manually dispatch the preflight against existing GitHub credentials; verify a successful real paper-host read-only receipt.
- Verify separate dedicated PAPER keys; no reuse of live-secret fallback for execution.
- Add durable idempotency state and a signed owner permit bound to an expiry, broker account, signal, notional, and trade ID, with manual disable by default.
- Build a separately reviewed PAPER-only order submission adapter, isolated allow-listed host and endpoint, with mandatory pre-order order-ID lookup, unknown-order outcome freeze, restart lock and reconciliation; do not retry uncertain submissions automatically.
- Add real broker fill/partial/cancel reconciliation, activities/realized P&L, independent risk authority, tested kill switch, day closure and no-profitability-claim reporting.
- Require distinct reviewed authorization before any real-money canary. The project must never fall back to a LIVE broker host.

Issue: #1553. Parent PR: #1981.
