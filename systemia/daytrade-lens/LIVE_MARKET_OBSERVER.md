# DayTrade Lens live-market observation canary (read-only)

**Status: code staged for review; NOT deployed, NOT running, and NOT evidence of broker paper fills.**

This is the missing first link between DayTrade Lens historical replay and live-market practice: a first-party, read-only Node 22 WebSocket client for Alpaca's IEX data stream. It cannot send market, paper, or live orders. It deliberately contains **no trading API URLs, order client, positions client, checkout, or funding action**.

See market-camp operation #1670 and separately gated PAPER-broker engineering #1553.

## Preflight
- Review and merge the PR after checks. Clone/pull to an owned running node (e.g. NextGen/Node002). This branch is not a deployment.
- Have permitted Alpaca market-data credentials in an approved vault. Provide only through process environment named DAYTRADE_DATA_KEY_ID and DAYTRADE_DATA_SECRET_KEY; do not paste secrets into commits, issue comments, terminal screenshots, this chat, or workflow logs.
- Require Node 22+, correct system clock, stable network, adequate disk, and local process supervision for the whole session.
- A free basic Alpaca stream gives IEX-only, NOT consolidated SIP/NBBO coverage. Venue-limited quotes cannot justify a full-market-volume or best-execution claim. https://docs.alpaca.markets/us/docs/market-data-faq

## Controlled October 27 invocation (Pacific Daylight Time)
After loading the two credential variables securely in the local process environment:

    export DAYTRADE_OBSERVER_STOP_AT='2026-10-27T13:10:00-07:00'
    export DAYTRADE_OBSERVER_SYMBOLS='SPY,QQQ,AAPL,NVDA,BA,KO,PYPL'
    node --test systemia/daytrade-lens/live-market-observer.test.mjs
    node systemia/daytrade-lens/live-market-observer.mjs

The observer refuses to start without credentials and a future stop time no more than 24h away. It shuts itself down at that time, or on SIGINT/SIGTERM. It records **source and received timestamps**, source age, stale/clock-skew flags, latest subscription state, 1-minute bars, and rate-limited quotes as append-only JSONL under artifacts/daytrade-market-observer/. Each record is flushed to disk. The user must ensure this runtime stays running; GitHub scheduled historical Practice Camp does not keep it alive.

## Boundary and QA
- **Market data observation is not a trade, not an Alpaca PAPER fill, not a simulated entry, and not an expectancy result.** Only separate, precommitted strategy logic plus verified observations can score a shadow decision. Never mark these JSONL entries as fills.
- The observer samples quotes at most once per five seconds per symbol. It is meant for education, research, and audit, not tick-accurate backtesting or scalping.
- Opening-range, momentum and mean-reversion strategy agents must write hypotheses before outcomes are known, and keep every no-trade and rejected case.
- Enforce unchanged virtual pilot rails outside this collector: $20 virtual capital, maximum $0.10 risk/trade, $0.20 daily loss, 2 accepted hypothetical trades/day, one position, minimum 1.5:1 reward:risk, no leverage or options. Do not relax for more activity.
- Test missing credentials, websocket auth failure, stale data, empty bars, disconnect/reconnect, order-endpoint absence, system clock skew, and final stop receipt. Integration tests against a real Alpaca feed **have not been performed** in this PR.
- At close, run separate existing historical Practice Camp if authorized and data-backed, and report its outcomes labeled HISTORICAL_REPLAY, never as proof this market canary traded live.
