# Systemia Context Fabric

Systemia Context Fabric is the shared-world-state layer between collection and action.

Rockies, crawlers, public feeds, research lanes, field systems, and future sensors can all observe useful things. An observation is not complete merely because it was written to a ledger. The Context Fabric makes the observation available to the rest of Evercraft with provenance, uncertainty, correlation keys, and explicit consumer routing.

## Core flow

OBSERVE -> NORMALIZE -> PRESERVE PROVENANCE -> UPDATE WORLD CONTEXT -> ROUTE TO SUBSCRIBERS -> CORRELATE -> DECIDE

The important split is:

- **Context Fabric** answers: "What did we learn, where does it belong, and who else should know?"
- **Sentinel** answers: "Do independent observations combine into a meaningful anomaly?"
- **Signal Fabric** answers: "Does a human need to be paged, queued, digested, or merely receipted?"
- **Product brains** answer: "Does this change my model, report, research queue, map, decision support, or customer output?"

This keeps ordinary changing feeds useful without turning every river gauge, earthquake list update, weather tick, model release, or repository change into an alarm.

## Observation contract

An admitted observation carries:

- stable observation ID
- source system and source family
- observation time
- one or more coarse region keys
- one or more domains
- kind
- evidence state
- reliability
- anomaly score when relevant
- summary
- provenance references
- optional correlation keys
- optional facts and measurements

Evidence states are `modeled`, `reported`, `observed`, and `verified`.

## Rockies rule

Rockies is an input to the whole organism, not an archive.

A Rockies observation always updates the shared Systemia world model and is offered to Sentinel. Domain subscriptions then fan the same evidence into relevant consumers such as FAIE, TOWI, Evermaps, Weather Desk, RIVET, Omnicore, Portfolio Sentinel, CHUM, Emergency Command, and the household-cost fabric.

The fan-out is context delivery, not automatic authority. A new observation cannot silently publish an article, change a price, move money, mutate production, or trigger an external emergency action. Existing product gates remain intact.

## Correlation behavior

Context is grouped by explicit correlation keys when supplied. Otherwise it is grouped by region + domain + kind. Each context node accumulates source families, evidence states, provenance, and observation history.

That means a routine PNSN update can remain background geophysics context, while a later landslide report, river change, weather anomaly, road closure, and emergency bulletin in the same region can become mutually visible to Sentinel and the relevant product brains.

## Completion rule

For observational systems:

> stored != integrated

An observation is integrated only when it has:

1. been normalized,
2. preserved its evidence/provenance,
3. updated shared context,
4. produced subscriber dispatches,
5. been made available for cross-domain correlation.

The proof harness enforces this behavior for representative Rockies water, geophysics, and infrastructure/energy observations.
