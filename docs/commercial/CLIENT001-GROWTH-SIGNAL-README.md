# Evercraft Growth Signal · CLIENT 001

A mobile-first, evidence-aware revenue command center for On The Go Mobile Quick Lube.

## What works today

- **`index.html`**: self-contained functional browser prototype. Mobile navigation, charts, lead funnel, campaign comparison, proof ledger, sample scenario simulator and secure blank actual-data state. No external dependencies, no cookies, no PII collection, no network access.
- **`api/signal-service.mjs`**: local-only reference collector, disabled until `SIGNAL_CLIENT_APPROVED=true`. Has authenticated read endpoint, HMAC-signed events, duplicate rejection, append-only SHA-256 chain, trust classes, no arbitrary public payment assertions, and no claim of incremental revenue from mere clicks.
- **`api/test.mjs`**: automated integration checks with synthetic receipts only.

The dashboard's demo figures are fabricated on purpose to show the design. No Juan/Square/Cash App data is connected. **Do not present simulated totals to Juan as actual performance.**

## How it becomes a live revenue system

1. **Founder/client permission**: Juan approves the portal, marketing attribution, privacy notice, who can see data, whether Evercraft may read his Square account, and exact scope. No access to existing customers without specific authorization.
2. **First-party campaign events**: attach source codes (`EC-EN-001`, `EC-ES-001`, `EC-FLEET-001`) to approved On The Go destination links; record *events*, not people or completed calls. Use a separate, properly authenticated first-party event endpoint and limit browser telemetry.
3. **Booking bridge**: use unique reference numbers on requests (or an authorized scheduling-system API). Link without exposing names, phone numbers, VINs, license plates, or addresses. A call-button tap alone never qualifies as a booking.
4. **Square connector**: server-side Square OAuth read scopes; store credentials encrypted; verify webhooks cryptographically; re-fetch the actual Square payment; dedupe by provider payment ID; process refunds; never treat a merchant webhook text claim as independent payment proof.
5. **Cash App and other payments**: if no supported read API, use minimal authorized settlement reconciliation from Juan, not unsourced assumptions.
6. **Growth computation**: collect all completed paid services and a historical baseline, then show current vs prior completed revenue; separately show verified campaign-attributed *first* jobs. A historical delta does not establish causality. A controlled incrementality experiment, when feasible, would offer stronger evidence.
7. **Systemia / Saban / Radar**: orchestrate collection and repair, monitor missing connectors and inconsistent receipts, produce evidence checks, and escalate when unattended. Don't auto-publish financial results.

## Local test

```bash
node systemia/growth-signal/client001/signal-service.test.mjs
```

## Local collector demonstration (do not deploy publicly as-is)

```bash
SIGNAL_CLIENT_APPROVED=true \
SIGNAL_INGEST_HMAC_SECRET='<32+ random secret chars>' \
SIGNAL_READ_TOKEN='<32+ random token chars>' \
node api/signal-service.mjs
```

Service binds to `127.0.0.1` only. The reference collector intentionally **does not** implement Square OAuth, official Square webhook verification or client authorization flows. Those are separate deployment gates, not hidden capabilities.

## Measurement contract

- Revenue baseline and post periods must cover all business receipts, not a subset.
- `payment_completed`: payment-proof event only after official provider checks; does not prove service was fulfilled, first-time customer, or that Evercraft caused it.
- `attributed_first_visit_cents`: null until source, first-time visit, fulfillment and paid confirmation are joined with adequate evidence.
- `incremental_growth_cents`: null until a meaningful comparison window or experiment is assembled.
- No user identity in the public attribution ledger. Store payment IDs and booking references in a secure server-controlled system, never in a public URL.

**Status:** functional private proof-of-concept; no live customer integration and no new revenue proven.