# DayTrade Lens: one-shot PAPER execution candidate

**Status:** code review and mock tests only. No deployment, no real credentials read, no Alpaca order submitted. The routine defaults to no network access and **no order submission**.

## Why this separate phase exists

The previous phases provide a read-only broker preflight, $20-paper-order proposal, and broker order GET reconciliation. This phase adds a tightly scoped PAPER-only submission transport as code, without scheduling or deploying it.

Alpaca PAPER endpoints:
- Create order: https://paper-api.alpaca.markets/v2/orders
- Query by client ID: https://paper-api.alpaca.markets/v2/orders:by_client_order_id

Those exact destinations are hardcoded. No LIVE base URL, environment hostname override, direct buy automation, GitHub-dispatched order, or trading credentials in test workflows.

## The one-shot gate

All of the following must pass in the same owner-authorized session:

1. The caller explicitly supplies allowPaperWrite=true and operatorArm=AUTHORIZE_ONE_PAPER_ORDER. Default is disabled with no network call.
2. Dedicated PAPER keys only: ALPACA_PAPER_KEY_ID + ALPACA_PAPER_SECRET_KEY. The old generic ALPACA_TRADING secret pair is **not** accepted for writes.
3. The existing risk proposal is recomputed from the paper broker preflight, strategy signal and separate risk attestation. Notional is at most $20; modeled stressed downside at most $0.10, no open positions or orders, no previous orders in the UTC-day window. Modeled risk is not a stop-loss guarantee.
4. PAPER account fingerprint is fixed to the original broker preflight and owner permit. Never print credentials, account ID or complete broker response.
5. A short-lived (at most 120s), HMAC-SHA256 owner permit binds the broker observation, account fingerprint, order ID, symbol and exact notional. Signing key must be independent of model/strategy agent credentials and not exposed in GitHub Actions or source control. The signature proves possession of the signing key, not that a human actually reviewed the trade. Manual issuance is required.
6. An operator-controlled absolute-path STOP marker must not exist. If it appears, new submission is blocked. This is a pre-submit stop, not a guarantee that a broker-accepted order can be canceled.
7. Atomic process lock and fsynced append-only intent record are created before requesting the broker. That lock remains in place after success, failure or crash. The code never auto-removes it.
8. Fresh PAPER broker GET reads must confirm same account, open market, no positions, no outstanding orders, no preceding orders, funds available, and account ready. A client-order-ID lookup must report 404 before a POST.
9. A durable POST_POSSIBLE_NO_AUTORETRY receipt is fsynced BEFORE the single PAPER POST. Timeouts and ambiguous outcomes freeze the attempt. No automatic retries.
10. POST success is **not** a fill. A separate PAPER GET by client order ID must confirm the broker state. Partial fills stay distinct from complete fills. P&L remains unverified.

## Important restrictions

- **Not deployed or enabled.** No CLI entry point or GitHub Actions order-write step is present.
- The current independent risk approval input is not yet bound to a trusted signed reviewer identity. The owner permit adds a signature, but the full independent-risk and owner-approval flow still needs separate security review.
- The existing proposal models a stop price but this module does not place a protective stop or closing order. A market order can exceed estimated slippage/loss, including in paper trading.
- It intentionally allows only **one attempt per manually isolated state root**, stricter than the long-term two-paper-trades/day pilot limit. There is no unattended recurring trading.
- A paper fill from Alpaca is simulated execution, not proof of actual live market execution or profitable returns.
- State-root resets, permit creation, reconciliation of unknown outcomes, cancellation and shutdown are manual tasks requiring an independently reviewed operating runbook.
- GitHub's default-branch workflow cannot automatically execute this stacked draft branch code. A passing CI job only demonstrates mock tests.
- The local STOP file is an additional guard, not a broker-side cancel/flatten capability. Broker-side cancellation and actual position liquidation still require engineering and verification.

## Remaining acceptance criteria before any genuine PAPER order

- Review/merge PR #1981, PR #2025, and this PR in dependency order.
- Manually verify existing GitHub credentials against the PAPER host using the read-only preflight. If the existing keys only authenticate to LIVE, create a separate PAPER key pair and store them securely. Never paste keys into chat or logs.
- Run independent threat model: signing authority, timing races, broker state consistency, file permissions, process crash and restart, spoofed signals, STOP behavior, and control-plane access.
- Add safe operator UX with a human-readable order preview and one-time confirmation, isolated signing service, and broker-level cancel/position monitoring.
- Verify a broker-reconciled paper fill on an open market session using virtual capital and provide immutable receipts.
- Test losses, partial fills, orders held/rejected/expired, stale data, market holidays and recovery from an unknown submit outcome.
- Establish independent performance evidence before considering a separately reviewed live-money experiment.

Issue: #1553.
Parents: PR #1981 and PR #2025.
