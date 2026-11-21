# Evercraft Watershed Intelligence | customer surface preview

This is an **HTML-first, read-only, noindex research preview**, under Evercraft Research, for the Yakima Basin. It is not a live sensor feed, water-supply forecast, flood warning, confirmed paid product, or automated customer report.

## Product path
- `public/watershed/index.html`: first-party responsive dashboard, no PDF dependency.
- `public/watershed/app.mjs`: accessible browser rendering using text nodes, not injected markup.
- `public/watershed/model.mjs`: fail-closed source schema and release-authority validation; official-domain link allowlist.
- `public/watershed/data/yakima-2026-11-09.json`: pinned, source-hashed **archived evidence snapshot**, recorded by the Nov 9 official-source canary, source readings Nov 8–9 and USGS readings Nov 9 Pacific. Not a real-time stream.
- `tests/evercraft-watershed-dashboard.test.mjs`: source truth checks, tamper rejection, mobile and purchase-claim boundary checks.
- `systemia/evercraft-web/browser-worker/verify-watershed-mobile.mjs`: Playwright Chromium at 320/375/390/430/768/1024/1440 widths plus hostile-source fail-closed test.
- `.github/workflows/watershed-mobile-evidence.yml`: independent truth and browser QA gates.

## Evidence provenance
The static snapshot contains SHA-256 digests of the **raw JSON** retained in GitHub Actions [source collection run 42739867324](https://github.com/jgaethle10/forge-operator/actions/runs/42739867324). The underlying source files are `latest.json`, `swe-median-audit.json`, `official-basin-report.json` and `reservoir-source-probe.json`. GitHub artifacts have limited retention. The source identifiers, timestamps and digests remain in the snapshot.

The customer presentation is locked to `ARCHIVED_EVIDENCE_PREVIEW`, `human_publication_approved=false`, `forecast_authorized=false`, `flood_alert_authorized=false`, `payment_verified=false`, `customer_delivery_verified=false`. The page intentionally carries `noindex,nofollow`.

- Three NRCS Upper Yakima/Naches/Lower Yakima indices **each** retain the official asterisk warning; they are not added or averaged.
- All six station SWE values show NRCS 1991–2020 site median; sub-one-inch median percentages are withheld. A single valid site comparison never becomes a basin statistic.
- USGS: three of four configured discharge sites were available in this archive.
- USBR: five observed reservoir storage values are provisional and have unresolved local reporting-day timezone; 147,099.23 acre-feet is only a same-source-reported-day arithmetic sum, not percent full or a USBR official system total.
- Site source links are fixed to official HTTPS hosts and the GitHub readback. If data validation fails, **all measurement cards are withheld**.

## Dated NRCS index review: November 11–15

The browser's secondary, dated review uses `public/watershed/data/nrcs-index-review-2026-11-11-to-15.json` and `public/watershed/index-review.mjs`. These are **explicitly internal, source-reviewed readings**, not a real-time stream, a water-availability forecast, an official NRCS combined basin index, or a new public product release.

Five verified official NRCS report dates are shown individually. The source reported values are Upper Yakima: **34*, 5*, 4*, 15*, 17***; Naches: **85*, 66*, 52*, 50*, 57***; Lower Yakima: **108*, 109*, 86*, 110*, 120*** (November 11 through November 15, respectively). Every source asterisk is preserved. These values may be unrepresentative when early-season medians are very small.

- November 11 was persisted into the separately managed GitHub evidence branch as run `43113718418`. This was independently verified from its stored `receipt.json`.
- November 12–15 exist **only** as 30-day, verified GitHub Actions staging artifacts, linked by source run IDs `43318005667`, `43515210761`, `43638873450`, `43761206929`. Four original-source SHA-256 hashes in each archive were verified against its embedded raw source files. They are **not yet durable ledger entries**.
- The official NRCS warning applies to all fifteen displayed index numbers. These dates should not be extrapolated into trends or used to advise irrigation/flood operations.
- Reservoir reporting days are still unresolved and some source runs contain only four of five reservoir records. No reservoir multi-day total or trend is calculated from this newer review.
- `index-review.mjs` rejects unverified run URLs, missing source digests, edited NRCS warnings, incorrect dates, fabricated reservoir totals, or attempts to declare temporary staging permanent. The historical panel fails closed independently of the older validated November 9 snapshot.
- The **writer authorization hold is active on main**. `.github/workflows/watershed-ledger-persist.yml` is intentionally configured for read-only staging; it must not push evidence to the ledger branch until authorization changes through a separately reviewed security process.

## Internal source history status

PR #1984 has already merged the raw-receipt history compiler, append-only archiver, and hash-verifying readback into `main`. The current scheduled workflow stages verified material only; its GitHub Actions artifacts expire. The ledger currently has one independently verified day (November 11). No unattended durable multi-day history is claimed.

The interface work remains in draft [PR #1949](https://github.com/jgaethle10/forge-operator/pull/1949), with `human_publication_approved=false` and `noindex,nofollow`. Neither the preview nor its source-reviewed historical extension is permission for public release.

## What is NOT shipped
- One day was durably archived; four subsequent days are temporary, independently verified staging only. No permanent 7/30/90-day chart is manufactured and the workflow writer remains on hold.
- No auto-published new sensor readings. New official-source artifacts require a reviewed promotion process and revision history.
- No owned runtime deployment proof on this PR. GitHub Pages is existing **fallback** infrastructure; reachability must be independently checked after merge.
- No completed customer form submission, checkout, paid order or delivered customer work. The CTA opens the existing Evercraft Research **local-only scope builder**, where an inquiry is prepared rather than submitted as a paid order.

## Next gates under [mission #1942](https://github.com/jgaethle10/forge-operator/issues/1942)
1. Evidence ingestion and historical append-only storage with revision markers, source digests, approved public promotion gate.
2. Approved daily data snapshot updater on owned infrastructure, including explicit stale/partial states.
3. Reconciliation of USBR hydrological day and capacity source definitions before percent-full claims.
4. Buyer validation interviews and signed-off human-reviewed brief samples before any Evercraft Payments / Stripe checkout integration.

## Testing
```bash
node --test tests/evercraft-watershed-dashboard.test.mjs
python3 -m http.server 8765 --directory public
# in a separate terminal after Browser Worker dependencies are installed:
node systemia/evercraft-web/browser-worker/verify-watershed-mobile.mjs
```
