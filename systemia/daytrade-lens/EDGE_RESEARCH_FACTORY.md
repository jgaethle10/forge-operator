# DayTrade Lens Edge Research Factory

The Edge Research Factory turns timestamped Rockies / Worldstate observations into falsifiable market event studies.

It is research infrastructure, not an order engine.

## Pipeline

1. Normalize a Rocky observation and preserve its observation timestamp, source family, evidence state, provenance, anomaly score and reliability.
2. Convert the observation into one or more market research hypotheses using the Rockies market-exposure map.
3. Fetch five-minute Alpaca IEX bars only for the interval after the observation timestamp.
4. Measure instrument forward returns at 15-minute, 1-hour, 1-day, 3-day and 5-day market-bar horizons.
5. Measure the same horizon against SPY.
6. Group repeated observations into a stable signal family:
   `rockies_range | observation_kind | instrument | lag`.
7. Apply simulated transaction cost, chronological development/holdout validation, source-family diversity, and Benjamini-Hochberg false-discovery control.
8. Persist the research batch and append evaluation receipts to the Edge Lab ledger.

## Anti-overfitting contract

A signal family cannot become a `RESEARCH_CANDIDATE` merely because one test looks good.

The current screen requires:

- at least 40 measurements total;
- at least 10 chronological holdout measurements;
- development and holdout direction agreement;
- holdout effect surviving modeled transaction cost;
- holdout directional hit rate above 50%;
- at least two distinct public source families;
- development false-discovery-adjusted q <= 0.10.

A research candidate is still not a proven edge. Further regime segmentation, multiple-market validation and forward-paper observation remain required.

## Lookahead boundary

The measurement engine locates the first eligible market bar at or after the Rocky observation timestamp. It never uses a price before the recorded observation time as the event-study entry price.

The event observation itself must retain its original public-source provenance. A later article describing an earlier event does not get backdated to the event time.

## Authority

All outputs carry:

```
edge_claimed=false
live_trade_authority=false
```

The factory has no Alpaca trading endpoint and cannot place, modify or cancel an order.


## Evidence diversity

Edge Lab distinguishes source-family diversity from origin-entity diversity.

For ordinary public-source signals, a research candidate requires at least two distinct source families.

For an official authoritative source family such as SEC EDGAR, a single authority can support a cross-issuer research question when observations come from multiple independent origin entities. The current screen requires at least five distinct origin entities overall and at least three distinct origin entities in the chronological holdout slice. The holdout effect must also keep the same direction when each origin entity receives equal weight, preventing one prolific issuer from dominating the apparent result.

This is an evidence-quality rule, not a relaxation of the sample, holdout, cost or false-discovery gates.

## Sample depth

The SEC field pack now uses a rolling 365-day research window and a broader multi-issuer universe. Alpaca historical bars are followed across `next_page_token` pages rather than silently truncating long windows at the first response page.
