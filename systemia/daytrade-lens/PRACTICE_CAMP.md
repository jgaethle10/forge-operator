# DayTrade Lens Practice Camp

Practice Camp is the pre-live training lane for DayTrade Lens.

It is intentionally incapable of placing an order. It uses Alpaca only for historical IEX market data and then replays those bars through a deterministic simulator.

## Team roles

- Scout detects qualifying replay setups from historical bars.
- Risk enforces the current DayTrade Lens pilot risk kernel before a simulated entry.
- Execution applies deterministic adverse slippage and conservative same-bar stop/target handling.
- Scribe records the complete replay receipt.
- QA runs adversarial scenarios that must fail closed.

## Promotion

The system can reach REVIEW_ELIGIBLE, never LIVE_ENABLED.

Review eligibility requires at least 20 replay sessions, zero hard risk-rule violations, every adversarial drill passing, and average discipline score of at least 95.

Profit is recorded for analysis but is not the promotion criterion. Historical replay is not a prediction of future performance.

## Safety boundary

Practice Camp never calls Alpaca trading or order endpoints. The only external call is historical market-data retrieval from data.alpaca.markets.

The default practice universe mirrors the current DayTrade Lens market-data fixtures. It is a test universe, not a recommendation to trade those instruments.
