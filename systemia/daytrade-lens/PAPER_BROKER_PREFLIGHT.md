# DayTrade Lens: Alpaca PAPER Broker Preflight (read-only)

Status: **code for review**, not deployed. This preflight does not place PAPER or LIVE orders and is **not** proof of broker paper fills, profitable strategies, or an operating autonomous Saban team.

## Purpose

Evercraft already has GitHub secrets referenced by the DayTrade research and historical Practice Camp workflows. Rather than asking the founder to regenerate keys, this first probe checks whether an existing credential pair authenticates against Alpaca's **PAPER endpoint only**.

The module hardcodes https://paper-api.alpaca.markets and restricts traffic to four GETs: account, clock, positions, recent orders. Redirects, credential gaps, account ambiguity, HTTP errors, and truncated order history fail closed. It emits a sanitized, structured receipt with neither keys nor broker account identifiers.

Secrets tried, in precedence order:

1. Dedicated ALPACA_PAPER_KEY_ID and ALPACA_PAPER_SECRET_KEY, if a complete pair exists.
2. Existing ALPACA_TRADING and ALPACA_TRADING_SECRET **for this read-only paper-host probe only**. A live-only pair will fail at the paper host. Never copy this fallback into any order submission code.

**No credential values should be pasted into chat, commits, issue comments, screenshots, or workflow logs.**

## Run / verification

On PR: the DayTrade PAPER Broker Preflight workflow runs unit tests with mocked network responses, requiring no secrets. Locally: node --test systemia/daytrade-lens/paper-broker-preflight.test.mjs.

Once reviewed and merged, a person with appropriate GitHub permissions can manually run the **DayTrade PAPER Broker Preflight** workflow from Actions. That dispatch runs tests then performs a read-only verification against the paper broker using encrypted GitHub secrets.

A green unit test is **not** paper authentication. A successful paper probe means only that the selected keys worked with the paper host and the read-only account/order/position snapshot was interpretable. It does not prove trading authorization, any fill, or risk limit enforcement.

## Next gates before allowing paper orders

Tracked in #1553:

- Explicit paper-only keys and order adapter, never fall back to a live broker URL.
- Human authorization, dry-run default, $20 virtual pilot budget, 10-cent maximum risk per trade, 20-cent daily loss limit, two accepted orders/day, one position, and kill switch.
- Full broker-confirmed order/fill reconciliation with duplicate protection, partial fills and restart/outage drills.
- Out-of-sample review and separate approval before even considering real funds.

All production and real-money permissions remain **OFF**.
