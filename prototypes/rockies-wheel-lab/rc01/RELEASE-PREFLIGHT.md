# Wheel Lab RC07 | Exact release preflight (nonproduction)

**Decision: HOLD.** This file is a human-readable release checklist, not a deployment authorization. Wheel Lab currently has a demonstrated offline shopper → merchant flow, not a confirmed buyer/merchant or authorized public release.

## What was actually staged

- Source-only preview candidate: `public/wheel-lab-preview/index.html`, `shopper.html`, `merchant-desk.html`.
- Entry point: `index.html` inside the staged directory.
- Host: **not selected or verified**; a repository path is not a domain or customer URL.
- Access control: **none**. `noindex` discourages search indexing but is **not authentication** or confidentiality. Assume every staged file would be public if published.
- The `vite build` for the main Evercraft application can copy `public/` assets into its generated static site, but that capability alone is not evidence the active production host is ready to serve them.
- All content is fictional or operator-imported in the browser; no store, login, customer message, order, payment, real inventory authorization, or reliable fitment is implemented.

## Required release evidence, in sequence

1. **Systemia admission:** exact mission `rockies-yakima-wheel-visualizer-demand-20261014`, a non-duplicate canonical admission receipt, named mission owner, permitted scope, and signed execution/release authorization. Do not promote a FounderDirectiveDraft or CI result as a receipt.
2. **Owned host:** operator-select an Evercraft-controlled HTTPS origin and exact path for this candidate, with permission to use the current static files. No arbitrary mirror or Base44/TinyFish/other silent fallback.
3. **Privacy/security:** test mobile and desktop on the precise public build; confirm no network calls by the demo, no unexpected logging, uploaded data stays on device, and no public-facing merchant names/customer details or third-party licensed wheel imagery appear. The current `noindex` tag is **not** a security gate.
4. **Scoped publishing approval:** the exact origin, route, commit SHA, asset set, exposure/public visibility, rollback plan and message to external viewers must be approved through `systemia/operator-gates`. Generalized "push" or source commit does not authorize a live publish.
5. **Release and external canary:** perform authorized deployment, then independently check the HTTPS origin, response codes, correct browser loading of all three pages and shopper JSON → merchant CSV/JSON handoff. Preserve observed URL, timestamp, complete commit SHA and immutable run/asset digests as receipts. A status 200 on a wrong page is not a pass.
6. **Public copy:** even a passing preview is **not** a commercial product: keep its "research/no quotes" warnings, no customer data submission, and fitment/inventory/pricing/payment flags false. Only disclose an actual working URL after it is externally verified.
7. **Merchant discovery/outreach:** existing `systemia/proof-first-sales` and Interaction Ledger must preflight opt-out/cooldown, independently reviewed pain evidence, permit for exact recipient/subject/body, and the recorded approved send. The first two email drafts remain unsent research drafts, not leads.
8. **Paid pilot (separate future gate):** verified merchant demand and signed scope; authorized/licensed catalog and vehicle fitment source; an actual technician review of installation/tax/inventory; real checkout/delivery/settlement receipts. Evercraft Payments is authority if checkout eventually exists. Never claim a sale because a UI computes a subtotal.

## RC07 tests and artifact

`.github/workflows/rockies-wheel-lab.yml` now tests the **entire staging directory** and the original source. `staged-preview.test.mjs` proves staged files are exact transforms of the prototype (with the launcher path remapped and noindex tags) and asserts no in-browser outbound mechanisms. A successful Github Actions workflow publishes a **downloadable build artifact** called `wheel-lab-rc07-staged-route-review`; it does **not** make the path accessible to the general public. Inspect the actual workflow conclusion and artifacts for the final commit rather than assuming pass.

## Release decision snapshot

| Gate | Current evidence | Status |
|---|---|---|
| Source functionality | Shopper controls, merchant CSV import and local JSON handoff | Implemented locally |
| Staged route in draft PR | Three HTML files under `public/wheel-lab-preview/` | Staged only |
| Staged-route CI | Review after latest run completes | Pending at time of this file |
| Systemia admission | No verified canonical receipt in these sources | **Hold** |
| Public URL/external HTTPS check | No externally verified Wheel Lab URL | **Hold** |
| Merchant interviews | No actual permissioned responses observed | **Hold** |
| Real fitment/catalog | Not implemented/verified | **Hold** |
| Public approval | No exact action approval recorded | **Hold** |
| Sales/settlement | No charge or paid customer | **Hold** |

This document is a release contract for later authorized action, not a request to bypass the holds.
