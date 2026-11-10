# First-party customer-domain cutover | P0 | 2026-10-18

**State:** DNS/TLS activation HELD. This file is an operator plan and evidence map, not a record of production DNS mutation, active TLS certificates, or successful payments.

## Independently observed

- Fabric currently serves first-party HTTPS frontages at `/eps/`, `/havenly/`, `/sunshine-spotless/` and `/apps/eps-estimator/`. Browser-readable GET verified Oct 18. This does **not** prove intake, booking or provider payments.
- Each customer domain independently returned HTTP 402 at the prior test, while the pages at Fabric were HTTP 200.
- Public Google DNS readback shows `ui-dns` nameservers on all three domains; IONOS confirms these are its DNS nameservers: https://www.ionos.com/help/domains/general-information-about-dns-settings/default-dns-settings-for-11-ionos-domains/ . DNS hosting is not proof of the registrar login holder.
- Apex A records resolved to the legacy hosting address on EPS, Havenly and Sunshine. `www` CNAMEs resolved to `base44.onrender.com` for the names tested, including Havenly. Last DNS evidence is external observation, not a mutation or ownership grant.
- Canonical first-party code is in GitHub. Customer hostname dispatch was added to Fabric in PR #1418. Exact `Host` root requests select the appropriate public static page; other customer-host routes return 404 except the EPS estimator. No booking/database/payment backend is exposed.
- `infra/evercraft-edge/evercraft-service-hosts.Caddyfile.example` is staged and **NOT imported into the live Caddy server**.

## Admit only after these preflight gates

1. Confirm explicit DNS zone edit permission for **each** independent business. Sunshine & Spotless is a separate entity, not EPS or Havenly. Preserve current complete records and rollback values in a private operator vault.
2. Require stable service hosting and independent backup/rollback. The Fabric ingress currently depends on operator-managed physical networking; do **not** promise an uptime SLA or switch three active businesses to an unstable single-node service.
3. Verify a matching host/TLS plan on Evercraft's Caddy edge for both apex and `www` of each site. No fake green certificate declaration. Existing canonical `fabric.systemiacommandcenters.com` must remain healthy.
4. Validate site-specific source and mobile content, business-approved contact number/email, privacy and service-scope disclaimers. Static SMS/email handoff is **not** server-side lead capture or a scheduled job.
5. Before any DNS edit, take a private snapshot of apex A/AAAA, `www` CNAME/A, MX, SPF/DKIM/DMARC TXT, CAA and existing TLS/HTTP origin. Do not modify email, domain registration, unrelated TXT or other apps.
6. Coordinate low-TTL changes in the actual DNS authority (observed IONOS) to an independently verified owner-controlled, trusted HTTPS ingress. This document deliberately does not prescribe the raw target IP or claim DNS credentials.
7. Immediately perform external (not LAN-only) GET/HEAD for each apex + `www`; verify proper branding, certificate SAN, HTTPS redirect/canonical, no Base44 redirects, no private data/API exposure, contact and mobile flows. Keep the interim noindex until canonical host release and actual indexing plan is approved.
8. Confirm no stranded customer inquiry during the migration window. Preserve old data in place until encrypted export, count/digest reconciliation, permissions and source-to-owned import pass.
9. Reprobe at short intervals during DNS propagation, preserve audit receipts in Yard/Systemia, and restore previous A/CNAME records if ingress/certificate/content fails. Record who approved/changed, before/after record state, TTL, timestamps, external screenshots and measured recovery window.

## Hard acceptance

A static source merge, HTTP 200 at a Fabric fallback path, or a passing Caddy file check is **not** completion. Completion requires **live customer-domain HTTPS** with verifiable DNS/TLS, correct host-specific content, contact handoff, rollback and release proof. Backend customer intake and payment readiness remain separate explicit states.

**Checkout:** the merged Base44 removal held checkout until two approved first-party Evercraft Payments endpoints can be provisioned. Failed checkout must never silently route back into Base44. No Stripe account/keys have been connected or migrated by this domain task.
