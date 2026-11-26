# Kaidance × Systemia: Global Opportunity Scout (five-minute heartbeat)

## Purpose

Kaidance's **existing** `kaidance-company-heartbeat` cycle is the single clock. Every qualified cycle checks an owner-private queue of source-backed opportunities from a public official global feed, and refreshes the external feed **at most every six hours** (unless it failed; then it holds for at least one hour). It does not create another scheduler, provider connector, customer record, invoice, bid, or outreach agent.

**Release reality:** This document describes a repository-side integration, not a verified resident deployment. GitHub Actions' `*/5` schedule is best effort. Prove an owned Systemia Core supervisor cycle, the exact deployed SHA, a source fetch receipt, two distinct 300-second cycles, and mission publisher readback before claiming the owned Kaidance heartbeat is continuously scanning.

## Connected owned components

1. `registry/kaidance-global-opportunity-sources.v1.json`: allowlists World Bank's official public Procurement Notices API (worldwide, no country restriction) and acknowledges follow-on IDB/UNGM and partner research adapters as NOT IMPLEMENTED.
2. `systemia/organism/kaidance-global-opportunity-scout.mjs`: bounded, read-only official JSON request, source schema checks, topic-to-existing-offer relevance, public evidence links and owner-private 0600 receipts. It never stores raw contact data, application credentials, or the untrusted full notice text. Every notice deadline remains `null` until the full official notice is independently checked.
3. The EXISTING `kaidance-company-heartbeat-runner.mjs` calls the scout inside its CLI pulse, in a sibling private directory. The scout's state and read-only queue are then validated before anything is added to the company revenue review queue and existing Kaidance next-action reconciler. Failed/stale/malformed source receipts produce no eligible contact.
4. `kaidance-next-action.mjs` nominates at most one bounded global review candidate, below any urgent operator reconciliation. `dispatch_authorized:false` remains invariant. No autonomous outreach, partner claims or bid submissions are possible from this path.
5. The EXISTING `.github/workflows/kaidance-frontier-field.yml` verifies offline contract tests and caches a source observation watermark; it does not perform production work or guarantee schedule accuracy.

### What the heartbeat counts

- `source_request_performed` means one actual official source response was requested (not a purchase).
- `source_rows_observed` means records returned by that single source response.
- `matching_rows_observed` means a bounded text/topic overlap, **not** buyer qualification or a valid application.
- `new_candidate_count` counts IDs not seen in the prior local ledger. The first scan is baseline, not manufactured new demand.
- `review_candidates` are source-backed notices requiring official deadline / jurisdiction / registration / buyer / deliverability review. No contract value is inferred.
- `counts.admitted=0` always; `held` means queued for manual review.

### Global does not mean five-minute scraping

World Bank procurement source is refreshed about every six hours to respect publisher update cadence, rather than downloaded 288 times daily. A six-hour review window still allows a three-minute terminal deadline to be missed. For rapidly closing bids, deadline alerting must later be source-specific and separately authorized. Failures are explicit and suppress stale candidate results.

The first adapter is genuinely worldwide but does **not** enumerate every opportunity in every country or scan every business on Earth. It covers a bounded recent window of 40 notice entries from a single source. True global partnership discovery needs additional official-source connectors, sector and language coverage, private source-ledger reconciliation, and buyer qualification. No paid-gig directory is used.

### Reuse the real existing revenue machine

All research candidates must be reconciled with the **owned Systemia Revenue Desk, Interaction Ledger, Passport, existing opportunity pipeline and outreach history**. No parallel CRM or 400-emails-per-day workflow is created here. A country/sector tag is not an approved legal contact route. Public source contact fields are never taken as permission for automated cold email. All cross-account sender aliases and outstanding contacts require verified private synchronization before any outreach permit.

Specific suppression examples:
- The existing **Circle H RV Park spring 2027 hold** is absolute; no global scout may reset or bypass it.
- Existing Salvadoran outreach to FIAGRO, COAUSOLES and ACOPACACHI must be reconciled before any follow-up, and no repeat send is created by this PR.
- Honor do-not-contact, bounced addresses, prior correspondence, legal suppression, local anti-spam rules, procurement registration, export and sanctioned party eligibility, and any customer-specific preference.

## Payments and conversion

1. Opportunity is only a sourced research candidate.
2. Review official notice detail, deadline/time zone, buyer identity and corporate eligibility.
3. Match a **currently deliverable** Evercraft-owned product or subcontracting role. Do not imply a generic FAIE brief makes Evercraft qualified for an engineering tender.
4. Record tailored, verifiable pain, delivery scope and human review in the existing pipeline.
5. Only a separately authorized exact-message Passport permit and real Gmail source readback may allow contact. Bidding on procurement sites remains a human decision subject to local eligibility and terms.
6. A response is not a contract; a quote is not money; a checkout is not settlement. Only authoritative order/payment and delivery receipts count as revenue.

## Run locally

```sh
node --test tests/kaidance-global-opportunity-scout.test.mjs
node systemia/organism/kaidance-company-heartbeat-runner.mjs --out /owned/private/kaidance-company-heartbeat
```

The second command runs the **existing** company pulse and calls the public read-only global scout once if due. The owner-private sibling `kaidance-global-opportunities/` contains `latest.json`, `state.json`, `queue.json`, and `mission-snapshot.json`. A source failure logs a hold, leaves revenue outreach disabled, and does not bring down the rest of the company heartbeat.

**Next release gate:** independent live owned-resident readback and source API response verification. No claims of global automated sales, international partnerships, signed bids, real purchases or paid work are created by merging a PR.
