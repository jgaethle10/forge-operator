# Evercraft Payments | Saban synthetic localhost HTTP buyer gauntlet

**Date:** October 21, 2026

## Verified operator proof before this build

Penguin successfully executed the existing Saban pre-money gauntlet from the home directory, staged commit `7f801ad8`: 3/3 local tests passed and a standalone acceptance receipt reported **32 independent local worker processes**, seven synthetic non-card rails, one accepted and one rejected concurrent order change, no false paid state, no provider calls, no money movement, Saban quality PASS.

## New executable HTTP proof

The dependent draft PR adds:

- `systemia/payments/synthetic-invoice-http.mjs`: real HTTP server bound to **127.0.0.1 only**, available exclusively with the `EVERCRAFT_PAYMENTS_TEST_ONLY=1` gate and a private ephemeral synthetic ledger directory. A random bearer token is required for every request. It cannot accept real merchant accounts or publish a payment destination, settle payments, or release fulfillment.
- `systemia/saban/payments-http-client.mjs`: independent Node client processes making actual HTTP GET/POST requests only to `127.0.0.1`. Each worker has a bounded role and cannot redirect to external destinations or read financial credentials.
- `systemia/saban/payments-synthetic-http-gauntlet.mjs`: Saban-controlled lifecycle with isolated process server, independent buyer/adversary clients, seven synthetic method choices, prices and invoice readback, customer claims, unauthenticated access rejection, replay, concurrency race, **server restart while preserving private synthetic order state**, and fail-closed Saban quality gate. Temporary files are deleted after the run.
- A dedicated `node:test` suite and Evercraft Payments CI workflow acceptance receipt.

**Independent GitHub proof:** [Evercraft Payments routing workflow 39682879295](https://github.com/jgaethle10/forge-operator/actions/runs/39682879295) completed SUCCESS. The emitted standalone receipt recorded:

| Check | Verified |
| --- | --- |
| Transport | Actual HTTP, loopback only |
| Separate client OS processes | **42** |
| Physical hosts | **1** |
| HTTP server restart | **1**, persisted order and replay survive |
| Synthetic fixed-price invoice | $19 FindMyPart Quick Hunt |
| Rail selection | 7 of 7 synthetic choices |
| Same-order race | 2 contenders; **1 commit, 1 conflict** |
| Unauthorized reads/creates | Blocked |
| Attempt to create a fake paid endpoint | Denied (404 or 405) |
| Buyer price override and replay | Blocked |
| Payment destination published | **No** |
| External payment provider requests | **0** |
| Money moved, provider settlement or delivery | **None** |
| Saban quality | **PASS**, coverage 1, zero dead letters |

An initial test expected HTTP 405 for nonexistent `/paid`, but the securely absent route returned HTTP 404; the regression now accepts either rejection (commit `1ae87fcff89ac3431052a7b3ac5a0f6853bf577e`). This **did not** add any paid endpoint.

## Penguin field reproduction

Stage the branch as its own detached worktree without touching the live Fabric edge or prior Saban/Stripe worktrees:

```bash
(
  set -e
  MAIN="$HOME/.local/share/evercraft/forge-operator"
  RUNTIME="$HOME/.local/share/evercraft/payments-http-gauntlet"
  if [ -e "$RUNTIME" ]; then
    echo "STOP: HTTP gauntlet worktree exists"
    exit 1
  fi
  git -C "$MAIN" fetch --no-tags origin feat/saban-payments-loopback-http-gauntlet-20261021
  git -C "$MAIN" worktree add --detach "$RUNTIME" FETCH_HEAD
  node --test "$RUNTIME/systemia/saban/payments-synthetic-http-gauntlet.test.mjs"
  node "$RUNTIME/systemia/saban/payments-synthetic-http-gauntlet.mjs" --json --concurrency=4
)
```

This should reproduce the **synthetic** HTTP receipt from any current working directory. It is safe for a loopback-only test, not for a public HTTP deployment.

## Remaining external gates

This is **not** an authorized live buyer service or a payment processor. The merchant business payout/collection destination was intentionally absent. Simulated `merchantRailConfigured:true` means only a **test fixture**, not proof a Zelle/PayPal/Venmo/Cash App business merchant account actually accepts payment.

Before a real buyer sees instructions, we must independently verify merchant ownership/eligibility, bank/payment-app acceptance, secured payment destination, taxes, terms, buyer consent and authenticated order/invoice API, plus actual bank/provider settlement reconciliation. Settlement and fulfillment cannot be inferred from a test buyer's claim. Stripe is optional; no Stripe credentials or new Stripe connection are required by this gauntlet.
