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

## RC09: Observable operations floor

`/live/floor.html` is a separate, broadcast-friendly six-station view of **actual recent public GitHub Actions workflows**. It reuses the existing public-only source and safety boundary. The page groups verification runs into research/maps, Saban/compute, creative studio, product/revenue, network/security, and build/release. Every displayed event links to its GitHub run; there are no generated agents or synthetic animation posing as work.

- `RUNNING` means the public GitHub run is reported `in_progress` **and** last updated within 30 minutes. `QUEUED` reflects public queued/pending status, never execution. Old in-progress and queued states become `UNVERIFIED`.
- `PASSED`, `FAILED`, and `CANCELLED` are preserved as historical outcomes. No event in the fetched recent sample yields `NO RECENT RUN`, which is not a declaration that no private work exists.
- Public data refreshes every three minutes while the browser is open. If GitHub is unavailable, the page marks its cached evidence **delayed**, removes unverified running/queued claims, and never substitutes a fake timeline.
- Use the 9:16, Film and Refresh controls for screen recording / OBS Browser Source. This is **not an actual RTMP broadcaster**, not a 24-hour uptime guarantee, and not a live Systemia/Saban task executor.
- Unauthenticated GitHub API browser rate limits apply. For true multi-viewer 24/7 streaming, promote an approved public-only server-side receipt projection with caching, explicit consent/rights, redaction, expiration and a separately audited streaming encoder.
- The RC04 approved-artifact mission remains tracked in [issue #1243](https://github.com/jgaethle10/forge-operator/issues/1243). No raw private agent telemetry can be added until its release gates are independently verified.

QA: `node --test tests/evercraft-live-portal.test.mjs tests/evercraft-live-workroom.test.mjs tests/evercraft-live-floor.test.mjs`.
