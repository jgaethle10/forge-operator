# Evercraft Relay for HubSpot · first engineering slice

**State: source scaffold and signed read-only contract. NOT installed, hosted, approved, listed, or connected to real HubSpot accounts.** This is the Relay meeting-clarity product, not Systemia notification Relay. This directory is not a fork of the Relay runtime and does not authorize a migration away from Systemia.

## Customer problem

Sales says implementation starts November 2. Operations heard the permit gets submitted November 2. Relay's structured, independent check-ins flag the differing milestone definitions. A human resolves the discrepancy, records a versioned decision, and asks the responsible participants to acknowledge the version. Relay cannot independently verify meeting attendance or mutual understanding.

## Build slice
- `hsproject.json`: HubSpot Projects `2026.09`, modern app with OAuth and **deal read-only scope**.
- `src/app/cards/RelayDealCard.jsx`: Deal record app card, read-only status and manual refresh. No CRM write, meeting-content import, fake customer data, or silent approval.
- `src/app/app-hsmeta.json`: `marketplace` **distribution type for future eligibility**, **not a marketplace listing**. URLs deliberately point to non-routable `.invalid` domain or localhost; do not upload until configured. No app ID, OAuth credentials or paid provider account is claimed.
- `backend/signature.mjs`: HubSpot v3 signed-URL verification with 5-minute timestamp window, limited decoded URI escapes and constant-time digest comparison.
- `backend/deal-status.mjs`: GET-only, tenant-scoped response contract. Requires a valid signature, admitted portal/app IDs, **explicit actual OAuth-backed deal permission adapter**, and **actual tenant-scoped Relay read adapter**. Missing either adapter returns 503. No persistent data store included.
- `tests/deal-status.test.mjs`: synthetic signed traffic and failures, no real HubSpot requests.
- `../../.github/workflows/relay-hubspot-deal-card.yml`: CI for the contract.

## Local verification
From repository root: `node --test integrations/hubspot-relay/tests/*.test.mjs`.

To verify HubSpot UI extension build separately, the operator must have an authorized HubSpot developer account and HubSpot CLI. Run `hs account auth` with a **private personal access key, never in GitHub or chat**, `hs project install-deps` from within this project, `hs project validate`, `hs project upload --account <authorized-test-HubID>`, and `hs project dev`. UI extension builds and actual card rendering are **not yet verified** here.

Before any HubSpot upload:
1. Create and verify the operator-owned HubSpot Developer Project; confirm app permissions/consent and supported version in the developer portal.
2. Implement owner-controlled TLS backend and OAuth consent/callback with state, PKCE where supported, code redemption, secure encrypted per-portal token storage and rotation, uninstall deletion and token revocation, plus consent/retention policy. Get actual client ID, app ID and secret privately from HubSpot.
3. Set a **verified owned HTTPS backend** URL replacing `relay.example.invalid` in both app configuration and React code, then enforce exact origin when checking v3 signatures. Establish TLS and runtime receipts.
4. Implement `authorizeDealAccess({portalId, appId, userId, dealId})` via verified OAuth installation and CRM read permission for this **exact deal**. An app card's record ID is **not by itself** permission.
5. Implement `readRelayStatus(context)` from a tenant-scoped, authorized Relay runtime. Return only the minimal status enum/version/counters; no names, decisions, contact information or free text.
6. Confirm non-production end-to-end behavior using an authorized test account, explicit user consent, and fictional data. Audit error paths, backup, retention, rate limiting, tenant and user isolation, replay and revocation.
7. Do not use HubSpot's developer/test accounts to claim qualifying customer installs. An eligible Marketplace submission currently requires **three active unaffiliated production customer accounts** with successful activity within 30 days.

## Distribution sequence
**Partner-led before marketplace-led.** Target HubSpot implementation consultants and fractional RevOps groups whose client handoffs regularly produce disagreement over delivery dates, ownership and scope. Pitch a narrow, opt-in Relay pilot inside the CRM Deal view, not another stand-alone social tool.

Proof ladder: 10 relevant implementation partners researched → 3 replies that show actual interest → 3 consenting independent customer accounts with secure pilot installations → separately logged successful activity → verify HubSpot Monitoring active installs → consider Marketplace application. These are **goals, not achieved results**. No bulk unsolicited outreach or scraping CRM client records.

## Official references (read October 28, 2026)
- Projects config: https://developers.hubspot.com/docs/apps/developer-platform/build-apps/app-configuration
- Card reference: https://developers.hubspot.com/docs/apps/developer-platform/add-features/ui-extensions/extension-points/app-cards/reference
- `hubspot.fetch` restrictions and signatures: https://developers.hubspot.com/docs/apps/developer-platform/add-features/ui-extensions/fetching-data
- Marketplace active install enforcement: https://community.hubspot.com/t/changes-to-marketplace-submission-flow-how-active-installs-are-determined/156427
- HubSpot Technology Partner Program: https://www.hubspot.com/partners/technology
- Track product + pilot: https://github.com/jgaethle10/forge-operator/issues/1680

## No-op boundary
Do not mistake a green isolated signature test, a valid app card configuration, or a PR merge for an app uploaded into HubSpot, an authorized install, CRM data access, a qualified buyer, or public distribution.
