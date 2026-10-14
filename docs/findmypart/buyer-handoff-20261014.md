# FindMyPart | one-time buyer handoff candidate
2026-10-14 · Systemia mission `findmypart-shop-rescue-distribution-20261013`

## Why
Three real FindMyPart customer routes respond over HTTPS, but the official CHUM mirror deliberately withholds a Base44 origin while Evercraft's owned-runtime migration is incomplete. GitHub-hosted public CHUM Pages also returned HTTP 404 at the observed time. Do not change `registry/catalog.json` canonical policy or generated CHUM mirrors to make a legacy provider appear to be owned.

This branch adds a **static, optional compatibility guide** at `public/field-guides/findmypart/index.html`. It is not a replacement for the product, an authenticated partner system, or a proof of first-party hosting.

## Customer paths
- Free Part Check: `https://findmypart.base44.app/free-part-check?src=forge_fieldguide`
- One-time Quick ($19), Deep ($49), Rescue ($99): `https://findmypart.base44.app/FindMyPart?src=forge_fieldguide&offer=<slug>`
- Free shop referral kit: `https://findmypart.base44.app/PartnerWithFindMyPart?src=forge_fieldguide`
- The inactive recurring Shop Plan is not sold by this page.

The guide has zero scripts, forms, cookies, credentials, payment-handling code, or customer-data writes. Buyer-initiated commerce stays inside the existing product's Evercraft Payments intake flow, with provider verification required before paid fulfillment.

## Evidence as of October 14
- Authenticated GitHub account: `jgaethle10`; `forge-operator` admin/push permissions and branch write verified.
- Five offline guide-contract tests passed in a fresh GitHub branch clone, Node 22.
- Read-only GET of each legacy product route returned HTTP 200 with HTML content type. This proves **transport only**. It does not validate mobile rendered components, a customer email, a checkout charge, partner payout, actual part sourcing, or settlement.
- GitHub Pages CHUM URL observed as 404. Do not advertise or share a hosted guide URL until it is actually deployed and browser-verified.
- The live Base44 frontend partner-kit redesign remains separately gated by Base44 publisher login. GitHub does not bypass that authentication.

## Release gates, deliberately not bypassed
1. Systemia mission admission/release disposition and dedupe with current rollout.
2. Review that the guide's legacy-provider compatibility handoff is explicitly acceptable under Base44-exit policy; do not merge simply because the test succeeds.
3. Run CI, review exact HTML and test accessibility on real mobile Safari and desktop.
4. Configure/verify GitHub Pages or approved Evercraft-owned serving route, independently inspect the actual published HTML and every CTA.
5. Conduct only permissioned end-to-end customer acceptance, including canonical receipt and referral attribution. No synthetic QA may count toward paid revenue or partner economics.
6. Publish only after the public origin and any separate marketing approvals pass. No unsolicited outreach.
