# EPS + HAVENLY emergency static site recovery

These are the existing EPS authored static page with estimator plus the new HAVENLY brochure/quote page. EPS was already on `main`; HAVENLY was reconstructed from an October 2026 business-owned vendor information document.

Run `node --test scripts/package-owned-business-rescue.test.mjs` and `node scripts/package-owned-business-rescue.mjs`. Copy `artifacts/owned-business-rescue/eps/` to the EPS domain document root and `.../havenly/` to HAVENLY's document root on an **already authorized, independently healthy Evercraft-controlled static host**. The build receipt includes SHA256 digests.

### What works as static HTML
- ESP/ EPS: existing portable homepage, estimator, direct call, SMS and mailto quote intake.
- HAVENLY: verified business-area/service scope, direct call and email, browser-generated mailto/SMS quote summaries. No Base44 SDK, payment, auth, data storage or opaque form POST.
- No PII is transmitted to GitHub, the static host or this application until a customer deliberately sends a message through their phone/email client.

### What this does not establish
- Live deployment, production DNS migration, independently tested iPhone browser UX, actual successful delivery of a quote email/text, or that every legacy lead/order/appointment transferred.
- Domain delegation rights. `infra/evercraft-edge/registry/domain-control.json` explicitly labels EPS and HAVENLY delegation control unverified; do not rewrite apex DNS until an owned host/TLS canary, known rollback and owner approval are recorded.
- A fully migrated EPS/HAVENLY command center. Scheduling, account auth, lead/job history, data records, and automation require separate private-data migration with reconciliation.

The public content should receive business-owner approval before production release. No auto-deploy/checkout/payment/DNS privileges are granted.
