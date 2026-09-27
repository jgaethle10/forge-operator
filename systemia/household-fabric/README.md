# Systemia Household Fabric

Systemia Household Fabric is the dignity-first local intelligence layer for everyday household economics.

It does not ask a household to prove hardship and it does not create a poverty score. It turns local prices, deals, jobs, rebates, benefits, transportation, utilities, free events, community resources, and seasonal opportunities into a ranked daily answer to one question:

> What can materially improve this household's next seven days?

## Yakima v1

Yakima is the first proving ground. The first contract supports:

- fuel
- groceries and household retail
- meals and family activities
- jobs and short paid opportunities
- utility savings and rebates
- benefits and community resources
- transportation
- services
- holiday pressure relief

The engine ranks on net household value, not headline discount. Distance, travel cost, time cost, action friction, freshness, confidence, expiration, and eligibility state are explicit fields.

A cheaper gas station is not a win if the trip costs more than it saves.

## Dignity and trust rules

1. No poverty score.
2. No requirement to publicly disclose hardship.
3. Sponsorship never improves organic ranking.
4. Sponsored results must be labeled.
5. Stale monetary claims are excluded.
6. Modeled and inferred values remain labeled as modeled or inferred.
7. Eligibility uncertainty is surfaced instead of silently assumed.
8. Personal data sale is not required to receive household intelligence.
9. Action remains with the person. The system can explain, compare, navigate, save, alert, or prepare a handoff, but it does not impersonate the household or create financial obligations without an existing approval gate.

## Core metric

The north-star ledger tracks:

- money kept in households
- money earned by households
- hours returned to households
- opportunities discovered
- needs solved before emergency

Clicks are supporting telemetry, not the mission metric.

## Today surface

`buildTodayBrief()` returns a compact ranked list suitable for a simple consumer surface:

- what is worth doing today
- expected net value
- why it was ranked
- how fresh the evidence is
- whether eligibility still needs confirmation
- the source and action path

The same engine supports `mode: "holiday_pressure"` for Christmas and other seasonal pressure without creating a separate charity silo.

## Data lane contract

Collectors should emit source-backed opportunities into the engine. The engine should not scrape or invent money claims itself. Each observation needs a source URL or source ID, an observation time, evidence state, confidence, category, and either measurable household value or a clearly defined free-resource/action benefit.

Future adapters should plug into existing Systemia capabilities, especially Signal Fabric, CHUM discovery, Saban workload distribution, Network transport, Calendar handoff, maps/location reasoning, and payment rails where user-authorized commerce is appropriate.
