# DayTrade Lens Deep Market Lesson v1

**Mission:** train the DayTrade Lens team to discover real market edges by trying to destroy them first.

This lesson is not a trading signal and grants no live-order or funding authority. Its job is to convert market research into falsifiable engineering requirements. Historical diagnostics remain exploratory unless they were frozen before the outcomes they judge.

## 1. Start with the ugly base rate

Large trader-level studies are a warning against using survival as proof of skill. Barber, Lee, Liu, Odean and Zhang studied Taiwan day traders over 1992–2006 and found aggregate net performance was negative in every studied year, the vast majority were unprofitable, and many losing traders persisted. Related results in the paper note that a very small subset showed persistent profitability. The lesson is not “nobody can trade.” It is that **rare skill is the prior**.

**Team challenge:** keep the cemetery. Every attempted signal family, horizon, benchmark, delay, filter and discarded variant belongs in the research ledger. A survivor is judged against the full search that produced it.

**Kill condition:** if the apparent edge disappears when the complete trial family is included, it was selection, not discovery.

## 2. The backtest is an experiment on the research process

Bailey, Borwein, López de Prado and Zhu show why investment backtests are unusually vulnerable to overfitting: researchers can try many configurations against one finite history. A simple development/holdout split does not erase the selection that happened before the winner reached the holdout.

**Team challenge:** preserve the number and identity of every research trial. Add probability-of-backtest-overfitting/CSCV-style diagnostics where sample structure supports them. Keep walk-forward and purging tests. Never move the September 30 frozen line because a later result is inconvenient.

**Kill condition:** if small changes in folds, embargoes, universe, benchmark or timing turn the winner into an ordinary member of the family, the winner has no special claim.

## 3. Deflate impressive numbers

The Deflated Sharpe Ratio exists because a high Sharpe after many trials and non-normal returns is not equivalent to a high Sharpe from one predeclared test. Markets also produce skew, fat tails and clustered events.

**Team challenge:** report trial count, skew, kurtosis, downside tail, median, winner concentration and multiple-testing corrections with every “best” candidate. Mean return cannot travel alone.

**Kill condition:** if the result needs a few giant winners, a convenient Gaussian assumption or ignorance of the search count, kill the confidence.

## 4. Paper alpha and executable alpha are different species

CFA execution material treats spread, impact, delay and opportunity cost as real trading costs. Implementation shortfall starts at the investment decision, not at the conveniently chosen fill.

For DayTrade Lens, the event timestamp is the decision clock. From there we need to ask: what quote existed, what spread existed, what price could actually fill, how much signal vanished while we waited, and what happened if the order did not fill?

**Team challenge:** build decision-to-fill implementation shortfall. Treat unfilled and partial fills as outcomes. Break total loss into signal decay, spread/slippage, explicit cost and opportunity cost.

**Kill condition:** if the strategy is only profitable at a theoretical event-bar price that was not realistically obtainable, there is no executable edge.

## 5. Execution lives on an impact-versus-risk frontier

Almgren–Chriss frames execution as a tradeoff between market impact and the risk of waiting. Even with tiny capital, the intellectual lesson matters: “enter immediately” and “wait for a better price” are different strategies with different failure modes.

**Team challenge:** simulate multiple entry speeds and fill policies. Track maximum adverse excursion and path risk, not just terminal return. The first tiny live capital, if ever authorized, is an execution-plumbing experiment, not a validation of the alpha.

**Kill condition:** if modestly more realistic execution assumptions consume the expected edge, the research thesis is not ready.

## 6. Order flow and the book are state variables

New York Fed microstructure work shows that both trades and limit orders can contribute to price discovery. That means a candle is a lossy photograph of a much richer market.

**Team challenge:** where data rights allow, add spread, depth, imbalance and order-flow state. Until then, explicitly mark that those variables are missing rather than pretending bar volume is a substitute.

**Kill condition:** if performance only appears in conditions where liquidity state is unknown or likely hostile, downgrade the result instead of filling the gap with optimism.

## 7. News changes liquidity before it changes volume

Research around major public announcements finds a distinctive sequence: volatility can jump, spreads widen, and trading volume responds with a lag. The first post-news print can therefore be the worst place to pretend execution is frictionless.

**Team challenge:** condition timing stress on macro/event proximity and volatility. Keep 5/15/30/60/90-minute delays, next-open tests, and add realistic fill-state tests when quote data become available.

**Kill condition:** if the edge is concentrated in the exact interval where spread and adverse-selection risk are highest, it must survive quote-level execution evidence before promotion.

## 8. The opening auction is not just 9:30 with a funny timestamp

Nasdaq’s Opening Cross is a distinct price-discovery mechanism, with imbalance dissemination beginning before the cross. An SEC filing observed near the open can interact with auction mechanics differently from one released at 11:17 a.m.

**Team challenge:** tag every event as pre-open/auction-near/immediate-post-open/continuous/after-hours. Separate next-open entry from continuous-session entry.

**Kill condition:** if the result vanishes when auction-near events are isolated or modeled correctly, the “filing effect” may actually be an opening-mechanism effect.

## 9. Volume is not liquidity

Liquidity is multidimensional. Spread, depth and price impact can deteriorate even when trading activity looks high. A high-volume event can still be expensive to cross.

**Team challenge:** stop using volume as a universal liquidity proxy. Missing spread/depth/impact remains missing. Build regime analysis around whichever dimensions are actually observed.

**Kill condition:** if the strategy depends on high-volume periods but fails when spread/impact are measured, the volume heuristic was lying.

## 10. Narrative salience is an adversary

A 2026 Journal of Banking & Finance study documents familiarity bias in day trading and argues that top-of-mind dominance can generate trading attention. “AI” is exactly the kind of narrative label that can feel informational because it is salient.

**Team challenge:** run narrative-blind controls. Match AI-labeled 8-Ks against structurally similar non-AI 8-Ks. Strip labels and ask whether timestamp, earnings item, issuer, volatility and macro state explain the result without the story.

**Kill condition:** if the semantic “AI” label adds nothing after those controls, rename the thesis. Do not preserve a better story than the evidence earns.

## Saban red-team doctrine

For every candidate, ask these in order:

1. **What did we try before we found this?**
2. **What information existed at the exact decision timestamp?**
3. **What price could actually have been obtained?**
4. **What correlated event, regime or narrative could be carrying the result?**
5. **What happens when the best issuer, day, quarter and winner are removed?**
6. **What happens under a different benchmark, execution delay and liquidity state?**
7. **What does the same rule do on unseen post-freeze events?**
8. **What evidence would make us stop believing it?**

The last question is mandatory. A thesis without a kill condition is marketing.

## Team handoff

Systemia owns admission and research state. Rockies discovers candidate relationships. Saban multiplies independent lesson/attack roles and reconciles their receipts. Edge Lab measures and falsifies. Practice Camp remains separate execution research. Frozen forward-paper cohorts remain immutable. No component may turn a historical diagnostic into live-trade authority.
