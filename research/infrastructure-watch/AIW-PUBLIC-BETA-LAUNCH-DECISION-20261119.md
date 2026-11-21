# American Infrastructure Watch | Public beta launch decision

**Decision (November 19, 2026): GO for a narrowly scoped public beta once release gates pass. NOT YET PUBLIC.**

## Owner product acceptance
The founder reported that the private interactive hover experience was "perfect." That is positive product/interaction acceptance, **not** evidence of a public deployment, an external-device accessibility test, completed production security review, or permission to misstate data coverage.

## Actual product we may launch
- One national U.S. state map: hover to preview state bridge totals and Poor-rated totals, click/tap to explore, Washington 2026 deep records, and an opt-in advanced explorer.
- National *state summaries* are sourced from **FHWA 2025** and must say so on the card. Washington deep index is the independently verified **FHWA 2026** snapshot (8,619 records, 403 Poor). Never present the older state totals as full 2026 data.
- State shapes are **Census-derived us-atlas v3.0.1**, 56 polygons in private stage. Geographical coverage is not the same as infrastructure data coverage.
- Evidence information and user content must remain honest about missing state details, inspection recency, and lack of current hazard checks. Poor condition **is not** a live danger, road closure, or safety clearance.
- Label the page **Public Beta / Historical Infrastructure Explorer** and link to the official source and data limitations. Do not market as real-time emergency intelligence, a complete 2026 national inventory, an official government website, or agency-endorsed service.

## Verified staging only
- **Private** hover preview on NextGen reported HTTP PASS at http://127.0.0.1:8796 with 52 2025 state summaries and Washington 2026 evidence; its bind is local loopback, not public internet.
- Founder reviewed the browser experience favorably. Independent public browser/mobile, accessible keyboard, and cross-device behavior are **not yet signed off**.
- PR #1884 remains an open **draft** and current GitHub PR metadata reports **mergeable=false**. It contains many broader research changes, so do not bulk-merge as a shortcut.
- The running Python gateway currently reports `public_release_ready: false`, and the launcher explicitly preserves the current protected routes.
- Original advanced public application and unrelated Evercraft services must remain intact.

## Public release gates (all required)
1. **Release isolation:** identify immutable, reviewed source commit for the exact hover page, locally hosted Leaflet assets, polygon data and necessary read-only API. Prefer a small release PR or audited deployment artifact, not the entirety of draft #1884.
2. **Owned hosting:** dedicated Evercraft-controlled, non-root service on an approved node with process supervision, health checks, restart policy, fixed source paths, and no dependence on a development shell. Do not expose a raw development listener.
3. **HTTPS routing:** verified Caddy/TLS/DNS route at an approved Evercraft hostname, with a narrow route allowlist for page, statics, and public-safe read-only endpoints. Do not touch Journal, Worlds, Systemia, or other existing routes.
4. **Public API protection:** validate CORS/origin posture as appropriate, prohibit writes, restrict query counts and output size, apply proxy request throttling/concurrency limits and reasonable timeouts, keep logs bounded, and test non-existent routes and path traversal. Recheck no private file paths or credentials leak.
5. **Evidence/legal UX:** official FHWA 2025 and Washington 2026 provenance links, conspicuous dated-year badges, limitation copy, attribution/license text for Leaflet and us-atlas, no false emergency or nationwide-2026-complete claims.
6. **Actual-device acceptance:** browser/mobile/keyboard navigation, hover and tap, state selection, Washington records, fallback error/empty states, no console errors, keyboard focus, responsive widths, external HTTPS smoke.
7. **Rollback:** save known-good gateway/page/route configuration, validate rollback before cutover, and provide exact route-reversion commands. Ensure no risk to other Evercraft programs.
8. **Outside-in receipt:** after release, test public origin from outside NextGen and capture URL, TLS result, HTTP status, selected state/card figures, dated labels, deep-record query, and timestamp. Only **then** announce live.

## Rollout
- First release: **Public Beta** with a visible dated-source disclaimer, no registration, no fees and no promises of instant hazard updates.
- Early user feedback should evaluate whether hover → click → deeper records stays delightfully simple. Collect feedback only through an explicitly configured mechanism and don't invent an endpoint.
- After a stable beta: broaden state-by-state validated 2026 deep imports without misleading users about coverage.

**Current release state:** `owner_ux_accepted; private_stage_verified; public_release_blocked_pending_owned_https_production_gates`.
