# Evercraft LIVE RC08 | Verified Workroom

**Purpose:** make actual Evercraft development activity visible, without pretending a decorative simulation is real work.

The default /live/ page uses **public metadata only** from the owned GitHub repository:
- Recent public pull requests with their actual draft/open/merged/closed state, update time, and a direct receipt link.
- GitHub Actions verification runs with real queued/running/passed/failed state and their original URL.
- Actual public commit records with timestamp, SHA and source link. Repetitive automatic mirror writes are deduplicated.

The events rotate like a news director, but **rotation is replay, not activity being invented or generated**. Each event's actual source timestamp stays visible, with an approximate 10-minute refresh interval. After a source error, the viewer labels the feed delayed; with extended failure it holds the presentation rather than inventing changes. Records older than the retention window are excluded.

## Use on TikTok / desktop
1. Open the hosted /forge-operator/live/ route in a modern browser.
2. Observe the public-source label and last-check time. If GitHub connectivity fails or browser rate limits are exceeded, the page will not pretend there are new developments.
3. Use Next receipt, Hold, Refresh, 9:16, and Film. The default page focuses on actual recent work, rather than replaying EarthWorks indefinitely.
4. Record the screen. This is **not** itself a TikTok broadcaster, RTMP encoder, or an always-on desktop capture service.

## Release and safety restrictions
- This is real, **public GitHub development evidence**, not a private Systemia mission stream and not evidence that an LLM agent is independently operating. The fact that a public CI run is queued is not proof of active computation.
- The metadata comes from three unauthenticated public GitHub REST endpoints. No keys, tokens or private repo data are fetched. Avoid exposing source data from outside public GitHub in this lane.
- Draft PRs are labeled DRAFT REVIEW, not product launches. Raw diffs, secret-bearing content, private customer data, signed media artifacts, and unreleased internal recordings are excluded.
- The title filter is an additional precaution, not a security boundary for accidental public exposure. Public repository access and editorial review remain the actual source boundary.
- The viewer may hit GitHub public API rate limits or CORS restrictions. This is not a guaranteed 24/7 fresh-data SLA. Scaling to thousands of viewers requires a centrally generated and approved public feed, signed/revocable where appropriate.
- The prior EarthWorks working simulator and other public demos remain available on their original URLs, but no longer dominate the default broadcast.

## Next milestone
Systemia's existing approved release receipts should feed RC04's fail-closed media gate so actual project outputs, verified rendering footage and authorized observable agent results appear alongside public GitHub development evidence. There must be no unaudited direct read from private mission stores.

## QA
`node --test tests/evercraft-live-portal.test.mjs tests/evercraft-live-workroom.test.mjs`
plus existing repository public/mobile and external published-source canaries. Merge/release only after checks and after independent public readback.


## Systemia Mission Control evidence companion (Build 01)

- Operator page: `/forge-operator/live/mission-control.html` (source file `public/live/mission-control.html`).
- Reuses the existing public GitHub normalization source, then groups eligible PR reviews by revenue/infrastructure, real GitHub Actions by execution/build checks, and draft/open PRs by review-needed status. This is **not** a private mission stream, and a CI result is **not** a Saban/Yard execution receipt.
- Payments, Penguin Node001, NextGen Node002 and execution authority deliberately display **UNKNOWN / NOT GRANTED**. GitHub changes never establish account funds, checkout success, public deployment, remote agent presence, node health, or exact-request authority.
- A user may open a JSON file containing an approved Systemia operator mission export. File contents stay in browser memory in that tab; there is no upload, local storage, remote read, or server write. The import is **operator-reported and unverified**, even when a record says completed or includes a GitHub link. Always use `textContent` for imported strings.
- Accepted schema: `evercraft.systemia.operator-mission-snapshot.v1`. Required top-level fields: `schema`, `exported_at`, `missions`. Each mission requires unique `id`, `title`, `lane` (revenue/infrastructure/execution/approvals), `status` (planned/admitted/running/held/completed/failed/unknown), and `observed_at`. Optional fields: `owner`, `note`, `public_receipt_url`. References must be allowed public GitHub PR/commit/Action URLs. Unknown data and future/stale timestamps fail closed.
- Next integration step is an authenticated, server-side Systemia adapter emitting scoped status plus cryptographically verifiable receipt references. It must be built through existing Passport, Context Fabric, Signal Fabric, Execution Gate, and Raven payment boundaries. **Do not** place an API key or unfiltered private mission ledger on a public page.
- Validation: `node --test tests/systemia-mission-control.test.mjs tests/evercraft-live-workroom.test.mjs`. Dedicated pull request check: `.github/workflows/systemia-mission-control.yml`.

No checkout, job execution, release, publishing, payout or revenue is triggered by this view.
