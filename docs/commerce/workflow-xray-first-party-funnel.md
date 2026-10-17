# Workflow X-Ray | first-party HTTP funnel evidence

Mission: `machine-commerce-watershed-v1`. Scope: **measurement only** on Evercraft's owned Fabric offer journey. No checkout, Stripe, Evercraft Payments, distribution, or fulfillment authority changes.

## What is measured

The existing HTML form and checkout response remain unchanged except for one hidden `source_channel` field on the Workflow X-Ray offer. JavaScript, tracking cookies, external analytics providers, redirects, and new buyer identification are not required. Five HTTP stages are observed by the Fabric server:

- `offer_view`: a successful rendered GET of `/offers/workflow-xray`, excluding payment-status returns.
- `checkout_denied`: request rejected for missing buyer confirmation or invalid email. The email itself is **never** persisted.
- `checkout_attempt`: buyer-confirmed request with a syntactically valid email, before contacting Evercraft Payments.
- `checkout_ready`: downstream checkout URL and exact offer price validated before returning the buyer to the owned handoff. **Not payment.**
- `handoff_view`: the buyer opened the short-lived Evercraft Payments handoff page. **Not a verified Stripe visit, a charge, or settlement.**

Records contain only day (UTC), stage, offer slug, a *claimed* coarse source bucket (`facebook_claimed`, `linkedin_claimed`, `chum_claimed`, `ai_claimed`, `evercraft_claimed`, `direct_claimed`, `other_claimed`, or `unattributed`) and quality classification (`qa_claimed`, `crawler_claimed`, `ordinary_http`). URL/form source labels are untrusted assertions and may be absent. Existing organic links without `utm_source`, `ec_source`, or `from` remain **unattributed**.

No IP address, raw user agent, name, email, session, order key, referral token, checkout URL, cookies or payment identifiers are persisted. The ledger is a private owner-readable, append-only JSONL file with mode `0600`. A full/unwritable disk must **never** block a buyer from using checkout. Records stop at a 4 MiB cap; do not read the event count as a complete traffic total when collection is impaired.

## Operator report

On the **owned Fabric runtime host**, run:

```sh
node scripts/report-workflow-xray-funnel.mjs --days 7
```

Default ledger path: `~/.local/state/evercraft/fabric/workflow-xray-funnel.v1.jsonl`. To use another private writable location, configure `EVERCRAFT_OFFER_FUNNEL_LEDGER_PATH` on the Fabric service and use the same variable for the local report command.

The command reports stage/source/quality counts only. An HTTP request is not necessarily a human or unique visit. Do not calculate authoritative conversion rate, customer acquisition cost, campaign ROI, Stripe settlement, or revenue from these counters. Pair this read-only report with provider-verified Evercraft Payments receipts and actual deliverable evidence.

## Release and QA

1. Run `node --test tests/workflow-xray-first-party-funnel.test.mjs tests/fabric-offer-pages.test.mjs`.
2. Existing Systemia release gates, immutable runtime and owned-edge update rules remain mandatory. A merged PR is not a deployed service.
3. On the deployed host, confirm a writable private ledger file under the expected service user. Use read-only local aggregation to confirm a controlled **QA-labeled** request changes only QA rows. Do not create positive production checkout test sessions merely to make a report look complete.
4. Independently verify the public $250 offer and Stripe-hosted checkout as the founder already did; record genuine payment only through an authenticated provider-paid Evercraft Payments receipt.
5. Retain the Meta Graph permission failure as `unavailable`; do not scrape around missing Meta `pages_read_user_content` approval and do not infer a zero.

This tool cannot establish a unique visitor funnel, actual click into Stripe's domain, paid settlement, or post-fulfillment. Those are separate evidence gates.
