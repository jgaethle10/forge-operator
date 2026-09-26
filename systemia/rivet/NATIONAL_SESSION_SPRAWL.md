# RIVET U.S. Session Data Sprawl

Mission ID: `rivet-us-session-sprawl-001`

## Objective

Continuously reduce the number of U.S. RIVET reports that must display **No verified observed sessions returned** by acquiring, normalizing, verifying, and refreshing legitimate observed EV charging-session evidence.

The mission does not treat national coverage as permission to blur evidence classes. Observed session counts are the target. Inventory, AADT, modeled utilization, charger availability, statewide totals, and energy-only aggregates remain useful supporting evidence but do not satisfy the observed-session acceptance gate.

## Systemia routing

Systemia owns admission, deduplication, jurisdiction/lane assignment, authority boundaries, dependency tracking, coverage receipts, and adapter acceptance. Saban may fan the work across logical agents but cannot create data-access, purchasing, outreach, records-request, or contract authority.

Initial public-source fanout is **56 U.S. jurisdictions × 5 acquisition lanes = 280 jurisdiction work units**, plus national partner/licensing lanes.

## Work cells

1. **Source hunters** find official APIs, open-data portals, grant reports, dashboards, downloadable tables, project closeouts, and public operating reports.
2. **Schema cartographers** determine whether the source contains actual sessions, station/site identity, geography, period, energy, connected time, connector count, and source vintage.
3. **Adapter builders** normalize accepted evidence into `EVObservedUsageAggregate`.
4. **Provenance/QA** verify source terms, geography, period math, dedupe keys, confidence, and observed-vs-modeled semantics.
5. **Coverage radar** measures accepted sites/jurisdictions and where RIVET reports still have no observed usage within the lookup radius.
6. **Partner lane** evaluates licensed nationwide providers and direct CPO/utility/site-host feeds. It may prepare comparisons and technical integration plans but cannot purchase or bind Evercraft without explicit authority.

## Acceptance gate

A source counts toward **session coverage** only when a canonical row can preserve:

- stable station/site identity
- coordinate pair or geocodable site address
- period start and granularity
- **observed charging session count**
- source reference and retrievable provenance
- evidence/data status and provenance notes

Session/day is derived only from observed session count divided by a verified period duration.

## Existing seeds

AliEV already has domestic observed-usage ingestors for NYC PlugNYC, Cary, Boulder, and Palo Alto. They are the pattern library for the national adapters.

## Authority and data rights

- Do not scrape restricted dashboards, bypass authentication, or evade rate/usage controls.
- Do not ingest confidential individual-charger utilization merely because a regulator collects it.
- Do not purchase licensed data or accept commercial obligations without explicit user authority.
- Do not send public-records requests or partner outreach without explicit authority.
- Do preserve license/terms, source URL or internal receipt, retrieval time, and source vintage for every accepted source.

## Success metrics

Primary:
- U.S. jurisdictions with accepted coordinate-resolved session rows
- unique accepted charging sites
- session-capable rows refreshed in the last 90/180/365 days
- percentage of tested RIVET addresses with observed usage within 10 miles

Secondary:
- adapters ready but awaiting access
- legitimate source blocks
- partner candidates
- stale sources requiring refresh

The mission is successful when **Not observed here** is an accurate exception, not the default.
