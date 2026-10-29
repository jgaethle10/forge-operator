# Work Saban: buyer → paid fulfillment → repeatable distribution

**Status:** public founding-pilot doorway is staged on a branch. It is not live until a merge, the Pages deployment, and an external URL canary prove the route. The local CSV workflow is real but is not an authenticated, hosted, multi-customer product.

## One initial buyer, one job

Target **owner-run service businesses, operations managers, and administrative staff** who regularly export sales to CSV and spend time preparing a management report. Specific initial promise: **turn an explicitly authorized monthly sales CSV into an audited, manager-ready report while visibly showing the work**. Do not sell a general AI team or arbitrary workflow support until real model-backed adapters and permissions prove it.

## Demand and distribution loop

1. **Discovery:** Stage the static owned page at `public/work-saban/index.html`. Its future public Pages URL is `https://jgaethle10.github.io/forge-operator/work-saban/`. Verify it externally after a gated merge; a source file or HTTP 200 alone is not proof of live demand. Do not add a fake live demo.
2. **Direct intent capture:** The page provides a written, no-call email inquiry, explicitly requesting no private data. Record each *consented* lead with channel and the task to be solved. An email CTA is a pilot doorway, not a verified submitted lead. In a later release, replace frictional email intake only when owned authenticated ingress, anti-abuse and notification receipts are tested.
3. **Permissioned distribution:** Publish one problem-specific report demo using synthetic example data; share it in relevant operations, small-business, spreadsheet, and workflow communities only where invitations or rules allow. Pursue permissioned newsletters, accounting/operations consultants, and existing interested partners. Do not depend on founder personal social accounts, scrape addresses, spam DMs, or use Base44.
4. **Qualification:** A qualified lead has an actual recurring report, can describe its desired output, can use a bounded sample CSV without sensitive personal data, and agrees to a documented pilot scope. Do not mark a view, like, reply, or speculative match as a lead.
5. **Consented pilot:** One authorized CSV is run on an approved operator machine under the current local-only trust boundary. Collect explicit data handling consent and delivery acceptance. Confirm runtime costs, human labor, latency, correction rate, and a buyer-acknowledged useful result. No public upload is allowed yet.
6. **Sell only what works:** After a complete independent pilot and a scoped fulfillment policy, approve a fixed-price initial report service through Evercraft Payments. The public page must then state its exact price and scope; checkout should be buyer-confirmed; only provider-verified paid status is revenue. Do not reuse a mismatched Stripe link or infer payment from checkout initiation.
7. **Paid delivery:** Match an authorized paid order to exactly one mission and verified audited deliverable, record owner acceptance or resolution, and prevent duplicate dispatch or unapproved external sends. Preserve privacy-safe acquisition, charge, fulfillment and refund/issue receipts.
8. **Repeat the channel:** Identify which channel yielded an actual paid, fulfilled job; replicate with another consenting customer. Record spend and labor per conversion, not impressions alone. Product marketing can widen only after fulfillment reliability passes.

## Status scoreboard (nothing inferred)

| Gate | Observable proof | Current status |
| --- | --- | --- |
| Local bounded task | Recorded worker stages, QA report, trace and passing CI | **Working on draft PR #1629**; not a production task |
| Owned pilot page | Merged site source, successful Pages deploy and external canary | **Staged only** |
| Qualified buyer | Explicit inbound task, permission to contact, source attribution | **Not verified** |
| Independent customer pilot | Consented input and audited customer-accepted output | **Not verified** |
| Public identity / tenancy / source security | Auth, private workspace separation, retention, signed origin receipts | **Not verified** |
| Approved price and buyer checkout | Exact approved scope/price, safe buyer-confirmed payment initiation | **Not verified** |
| Collected revenue | Authoritative provider-paid event matched to exact Work Saban order | **Not verified** |
| Fulfillment | Job receipt, verified deliverable, actual customer acceptance | **Not verified** |
| Distribution repeatability | Second independent sale from an attributable channel | **Not verified** |

## Acceptance criteria for the 'cycle solved' claim

Do **not** mark this product as commercially shipped just because a page deploys, an AI demo looks impressive, or a checkout starts. The minimum end-to-end result is:

- A real consenting external customer discovers the product through a recorded non-founder channel, requests a scoped job, and confirms terms.
- An approved exact product offer is buyer-confirmed and provider-paid, not merely pending.
- A security-reviewed Saban execution path creates and verifies the result with human approval at consequential actions.
- The actual customer receives and accepts a correctly linked, independently audited deliverable.
- The attribution, cost of acquisition, labor, price, net contribution, support and fulfillment receipts are reconciled.
- A second independent customer can complete the same path without ad-hoc founder rescue.

Only then call the end-to-end distribution cycle solved. `Work Saban` should remain tagged **private_pilot_interest**, not `sell_now`, until these gates are met.

## Metrics to record, with no invented counts

For each approved outreach/discovery source: `channel`, `placement_url`, `source_release_sha`, `reach_observed`, `visit_receipt`, `inquiry_receipt`, `qualified_at`, `pilot_authorized_at`, `pilot_completed_at`, `offer_version`, `provider_paid_receipt`, `execution_receipt`, `customer_accepted_at`, `gross_amount`, `refund`, `compute_cost`, `labor_minutes`, `permission_proof`. **Missing stays missing, not zero.** No contact PII in public repo or public CI artifacts.

## Reuse for product two

A product does not move to the next stage because marketing copy exists; the same acquisition → consent → checkout → verified execution → delivery → customer feedback → second purchase evidence is copied. Candidate second product: **FindMyPart Paid Part Hunt**; it already has an owned sale-ready Quick/Deep/Rescue offer ($19/$49/$99). For that product verify the paid hunt, delivered sourcing work, and repair-shop repeatability separately before claiming a closed loop.

## References

- Work Saban draft implementation: https://github.com/jgaethle10/forge-operator/pull/1629
- Runtime and security graduation: https://github.com/jgaethle10/forge-operator/issues/1630
- Existing owned Pages workflow: `.github/workflows/evercraft-journal-pages.yml`
- Existing commerce provenance rules: `systemia/organism/ONE_BODY.md`
