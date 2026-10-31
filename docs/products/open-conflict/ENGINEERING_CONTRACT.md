# Evercraft Open Conflict | v0.1 Engineering Contract

Status: specification only; no live feed, deployment, or operational monitoring is claimed.

## Purpose
Free, mobile-first, public-interest conflict transparency. Cover the U.S.–Iran conflict initially, without publishing actionable military intelligence.

## Public experience
- Overview: what is confirmed, what is disputed, humanitarian impacts, last successful source refresh.
- Timeline: reverse chronological evidence-backed events with filters for diplomacy, humanitarian, official statements, and historical incidents.
- Event detail: headline, summary, original source links, claim attribution, event time, first report time, verification time, publication time, correction log.
- Map: region-level or delayed historical aggregates only. No live unit/ship/aircraft tracks, precise strike coordinates, or operational movements.
- Ask Saban: source-grounded questions with explicit uncertainty and references; no tactical forecasts.

## Evidence event schema
```json
{
  "id": "uuid",
  "category": "diplomacy|humanitarian|official_statement|historical_incident",
  "headline": "string",
  "summary": "string",
  "event_time_utc": null,
  "reported_at_utc": "ISO-8601",
  "verified_at_utc": null,
  "published_at_utc": null,
  "region": "country_or_broad_region",
  "status": "reported|corroborated|disputed|corrected",
  "sources": [{"publisher":"string","url":"https://...","published_at_utc":"ISO-8601","claim_type":"official|independent|humanitarian"}],
  "corrections": [],
  "safety_review": {"approved":false,"reason":"pending_review"}
}
```

## Mandatory publication gate
1. Ingest public material from source-approved official, independent and humanitarian feeds.
2. Normalize timestamps, de-duplicate reports, preserve attribution and raw provenance.
3. Require evidence-backed event descriptions; do not turn a party's claim into established fact.
4. Reject live or near-real-time troop, aircraft, ship, base readiness, strike-target, or precise tactical movement data, even if found publicly.
5. Coarsen geography and delay historical incident mapping as appropriate. Humanitarian locations are also subject to privacy and protection review.
6. Never generate simulated battle footage, kill counters, scores, or engagement incentives based on casualties.
7. Permit corrections, retractions, and a clearly labeled feed-staleness state.
8. Human editorial escalation for ambiguous safety cases; automatic publication only for vetted, low-risk categories.
9. Do not publish unverified casualty figures as facts or reveal personal details of victims without a legitimate public-interest basis.

## Systemia integration
- Systemia owns job routing, evidence ledger, source freshness, publication receipts and failure handling.
- Saban performs extraction, cross-source reconciliation, contradiction checks, accessibility and mobile QA.
- EverMaps receives only approved, region-level or historical map projections.
- Worldstate compares published verified snapshots, never tactical live state.
- Every publication should be reproducible from immutable source references and review receipts.

## Release gates
- Unit tests: schema validation, time parsing, attribution, corrections, duplicate detection.
- Adversarial tests: false reports, forged screenshots, hostile prompt injection, location leakage, source outages.
- End-to-end tests: refresh -> review -> publish -> correct -> retract.
- Launch only after mobile UX, legal/editorial review, and operational safety checks.
- Until real feeds are connected, label all demonstrations SAMPLE DATA and never show a fake LIVE badge.

## Product policy
No paywall for core public information. No ads targeted using conflict distress. No public launch claim without a verified accessible URL and source freshness evidence.
