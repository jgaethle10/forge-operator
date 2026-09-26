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
