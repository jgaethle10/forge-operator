# Systemia Sentinel

Systemia Sentinel is Evercraft's life-safety surprise-detection layer. It looks for unusual, independently corroborated changes across otherwise separate data domains and turns them into evidence-backed operator warnings.

Sentinel is not a weapons controller. It does not target, jam, spoof, intercept, fire on, or autonomously classify an object or actor as hostile. Its job is to notice that reality has departed from baseline, test that observation against independent evidence, preserve uncertainty, and hand a compact evidence package to an authorized human or public-safety system.

## Core loop

NORMAL -> DEVIATION -> CROSS-DOMAIN CORRELATION -> INDEPENDENT CORROBORATION -> CONFIDENCE -> OPERATOR ALERT -> AUTHORIZED HANDOFF -> RECOVERY

The system optimizes for two paired outcomes:

1. Warning time gained before a harmful event is otherwise obvious.
2. False-alert rate kept low enough that operators continue to trust the network.

A single dramatic sensor reading is not enough to produce a high-confidence event. Sentinel rewards independent source families and independent domains rather than repeated copies of the same observation.

## Observation contract

Each observation carries:

- a stable observation ID
- time
- coarse region key
- source family
- data domain
- anomaly score
- source reliability
- evidence state
- provenance reference
- optional human-confirmed hazard state

Examples of domains include aviation, weather, communications, infrastructure, environmental sensing, acoustic sensing, optical sensing, and emergency reports.

Exact sensor coordinates, raw personally identifiable information, and sensitive operational details are not required by the correlation kernel. Adapters should minimize data before admission.

## Evidence levels

- modeled: inferred or predicted, not direct observation
- reported: unverified report
- observed: direct sensor or source observation
- verified: independently verified observation

Modeled or repeated same-family observations may strengthen context but cannot by themselves create an urgent event.

## Event levels

- watch: interesting deviation, keep observing
- corroborating: more than one independent family agrees
- elevated: multi-family, multi-domain anomaly needing operator attention
- urgent: unusually strong multi-domain corroboration requiring immediate operator review

An urgent anomaly still means "strongly corroborated abnormal event," not "hostile attack."

## Hypothesis discipline

For elevated events, downstream Saban analysis should test competing explanations in parallel:

- benign aviation or ordinary activity
- weather or environmental cause
- sensor or data-system fault
- infrastructure or communications failure
- coordinated hazard
- unknown

The goal is falsification, not narrative completion. Every hypothesis should name the evidence that would strengthen it and the evidence that would disprove it.

## Systemia integration

Sentinel emits a normalized Signal Fabric record. The Signal Fabric owns deduplication, notification budgets, receipts, and operator routing. Sentinel owns only anomaly correlation and confidence.

Urgent becomes a Signal Fabric warning unless a hazard has been explicitly confirmed by an authorized human or trusted official source. Confirmed hazards may emit a critical signal for immediate life-safety routing.

## Safety boundary

Sentinel can:

- detect
- correlate
- rank uncertainty
- request corroboration
- alert operators
- preserve provenance
- recommend passive protective steps
- prepare an authorized handoff package

Sentinel cannot:

- autonomously attribute hostile intent or nationality
- select or rank physical targets
- control weapons
- jam or spoof communications
- interfere with aircraft
- command interception
- bypass legal or human approval gates

The purpose is simple: notice dangerous change sooner, communicate it more clearly, and buy people time.

## Observation runtime

Sentinel now has a bounded observation runtime around the correlation kernel:

- `baseline.mjs` learns per-region, per-domain, per-kind baselines with streaming statistics and emits normalized deviation scores.
- `feed-adapter.mjs` converts approved public or authorized feed records into the Sentinel observation contract while retaining coarse regions rather than exact coordinates.
- `hypotheses.mjs` creates competing falsification jobs for Saban instead of prematurely completing a narrative.
- `replay.mjs` measures warning lead time and elevated false alerts against labeled historical or synthetic observation streams.
- `operator-picture.mjs` builds a compact life-safety picture with uncertainty, provenance-oriented source families, passive actions, and an explicit authorized-handoff boundary.

The runtime remains source-agnostic. Network acquisition belongs in separate, auditable adapters. A connector may collect lawful public or authorized data, but it must normalize into this contract before correlation.

## Evaluation metrics

A Sentinel release should improve both sides of the same equation:

- earlier corroborated warning time
- lower elevated false-alert rate

Synthetic replay is a proof of mechanics, not evidence of real-world detection performance. Real performance claims require labeled historical datasets or supervised exercises with known ground truth.

## Official hazard sources

The observation runtime includes two first-party public-source adapters:

- NWS active alerts from `api.weather.gov/alerts/active`. The client sends the required application User-Agent and treats only severe/extreme, observed/likely, immediate/expected actual alerts as confirmed hazards.
- USGS real-time earthquake GeoJSON from `earthquake.usgs.gov`. USGS events are verified environmental observations, but they remain unattributed hazard evidence until corroborated with an authorized life-safety source.

Both parsers intentionally discard source geometry before producing Sentinel observations. Sentinel keeps a coarse human-readable region and provenance reference rather than exact source coordinates.

The NWS client is a single-request primitive. Any scheduler wrapping it must respect the documented NWS refresh guidance and should not poll more frequently than every 30 seconds.

## Source lineage and regional event graph

Sentinel treats source naming and source independence as different concepts. Multiple adapters can have different `source_family` values while sharing one `independence_group` when they ultimately depend on the same upstream provider. Corroboration thresholds count independence groups, preventing one provider from masquerading as multiple independent witnesses.

The regional event graph sits above individual incidents. It links incidents only when they are close in time and share either the same coarse region key or an explicitly supplied coarse `region_group`. The graph can therefore recognize that differently named local areas are part of one broader event without retaining exact coordinates.

Graph edges mean co-occurrence, not causation. Regional clusters preserve:

- incident membership
- coarse regions
- data-domain breadth
- upstream independence groups
- verified-observation counts
- confirmed-hazard state
- provenance references
- unresolved attribution

A cluster can be labeled as an isolated, correlated, cross-domain, or strong cross-domain pattern. Those labels describe evidence structure only. They do not identify an attacker, infer hostile intent, or authorize intervention.

