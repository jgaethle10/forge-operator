# Evercraft Tower V2 | public experience + private Executive Floor

Date: 2026-11-15
Status: staged for GitHub review, never a substitute for a deployed HTTPS receipt.

## Why
The first Headquarters proved the public door. V2 gives it the experience of an institution without creating an inaccessible 3D maze, new vendor stack, or invented operating metrics.

## Public
- Architectural CSS scene built from first-party geometry, plus a custom Evercraft titanium SVG mark.
- A proper company story; the user can discover the company's purpose before seeing products.
- Four accessible interactive floor selectors (Engineering, Intelligence, Creative, Services). They link only to actual source-backed public experiences.
- Four working showcase doors: Journal, Worlds, Work Saban browser CSV reporter and Research scope builder.
- Readable typography, reduced motion, proper keyboard support and a no-JS direct-link fallback.
- Direct written inquiry, no fabricated sales or payment capture.
- No external fonts, scripts, trackers or runtime framework.

## Private
An Executive Floor is added **inside** the already-authenticated Evercraft Home application shell, never at a public path. The six direct operating routes point to real existing surfaces: Systemia mission plan, public offers, public Journal, authenticated Yard/Raven/Network portfolio, authenticated apps, and credential custody.

Current limitations are explicit:
- Public offer navigation is **not** paid revenue analytics or settlement verification.
- A public Journal link is **not** authorization to publish via Clip.
- Systemia planning is **not** autonomous execution permission.
- Private operational statuses remain backed by the Home's existing authenticated APIs; the new Executive Floor adds no sensitive API or credential read.

## Production gates
1. Existing Headquarters regression tests and V2 regression tests pass.
2. Evercraft Home sovereignty, Identity, and applicable CI checks pass.
3. GitHub Pages build preserves all three static assets under /headquarters/: tower.css, tower.mjs and mark.svg.
4. Deployed public root carries the V2 HTML with correct /forge-operator/headquarters/ asset URLs.
5. Actual external HTTPS GET for each asset succeeds, and the publisher independently checks the site root.
6. Separate Yard/Edge cutover remains on hold until a corporate custom hostname is approved and its DNS/TLS route is independently verified.
7. Verify private Executive Floor is not exposed to anonymous requests and Home Passport guards remain effective.

## Follow-on engineering
A fully unified founder cockpit still requires authorized connectors to canonical payments order receipts, real publishing receipts and product/customer pipelines. Until those are installed and tested, the Executive Floor is a navigational workbench rather than a misleading financial scoreboard.
