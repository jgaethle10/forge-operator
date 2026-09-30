# Rockies Market Edge Bridge

Rockies gives DayTrade Lens a research layer that ordinary price-only backtests do not have: timestamped public-source observations about the physical and operating world.

The bridge does not convert a Rocky observation into a trade. It converts it into a falsifiable research hypothesis.

## Research chain

```
Rockies observation
  -> Worldstate / Context Fabric
  -> daytrade_edge_lab subscription
  -> market exposure mapping
  -> fixed lag windows
  -> Alpaca forward-return measurement
  -> benchmark adjustment
  -> transaction-cost stress
  -> development / holdout split
  -> regime + multiple-testing follow-up
  -> research candidate or rejection
```

Direction is deliberately `LEARN_FROM_DATA`. Edge Lab does not pre-label "port congestion = bearish" or "grid stress = bullish." The observed event is timestamped first, then the market response is measured.

## Initial Rockies ranges

The bridge currently recognizes market-relevant signals from weather, water, wildfire/smoke, ocean/coastal, aviation, maritime, grid/energy, transportation, telecom, cyber, AI, robotics, semiconductors/compute, industrial manufacturing, supply chain, agriculture/food, public health, economy/labor, housing/construction, regulation/public policy, space weather, and independent scouts.

Representative ETFs are used as research measurement instruments, not recommendations.

## Candidate standard

A Rocky-derived signal cannot even reach `RESEARCH_CANDIDATE` unless it has a sufficient total sample, a real holdout sample, development/holdout directional agreement, an effect that survives modeled transaction cost, and a holdout directional hit rate above 50%.

Even then:

- `edge_claimed=false`
- `live_trade_authority=false`
- further regime, multiple-testing, and forward-paper validation remain mandatory

The purpose is to discover repeatable information advantages, not decorate a trading thesis with interesting world events.
