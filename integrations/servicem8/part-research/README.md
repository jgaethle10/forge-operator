# ServiceM8 × FindMyPart: private job-card proof (NOT an approved add-on)

**Purpose:** an authorized technician opens *Find a Replacement Part* from a ServiceM8 job card and is offered a separate, free, opt-in FindMyPart part check. The app does not read a job, copy customer data, create records, collect payments, or prove a commercial installation.

**Stage:** source-only minimal Addon Kit candidate. No customer use, third-party billing, developer account, developer certification, partner directory approval, commercial payout, or deployed environment has been verified.

## Where the actual integration stops

- `addon.jsonc` advertises two explicit job-card action locations (web and mobile). It requests no REST scopes, no job/customer read access, and no webhooks.
- `src/index.mjs` returns an HTML human handoff. It **does not transmit** `eventArgs.jobUUID`, customer information, or `event.auth.accessToken` to Evercraft, even if ServiceM8 supplies them.
- The link is a **free** FindMyPart entry. Any separately priced part hunt is not activated or billed by this code.
- The icon is sourced from this repository's `main` path. It will not be publicly resolvable until reviewed and merged. Confirm public icon availability and platform style requirements before deploying.

## Test offline, without a ServiceM8 account

Requires Node 22+:

```bash
node --test integrations/servicem8/part-research/tests/part-research.test.mjs
```

To independently validate with ServiceM8's `@servicem8/addon-kit` tool, an owner must install it and run **only** `addon-kit deploy --dry-run` first. This repository does not install the tool or sign in on the user's behalf.

## Human-gated acceptance before any public release

1. Founder reviews the current Developer Partner / Add-on terms and signs in to the proper ServiceM8 owner account; a ServiceM8 *Partner menu* does not prove Developer access or add-on approval.
2. Confirm current official manifest schema and published public brand icon; build the Addon Kit package and dry-run validation with no credentials or activation.
3. With explicit account authorization, install privately on one owned test business and check web **and** mobile job-card action display, focus, link opening, and no data leaving the account.
4. Only after useful real buyer feedback, design owner-consented part-description handoff. Reuse existing FindMyPart engine rather than scraping/copying customer data.
5. For a chargeable ServiceM8 Store add-on, use its own approval, billing/payout and refund terms. As of Oct 17, ServiceM8 publishes a 90% developer / 10% platform billing split and potential 90-day refunds; these are not guaranteed realized revenue.
6. Systemia controls commercial claims and public deployment; no cold outreach, auto-charge, purchase proof, or live install claim.

Official docs: https://developer.servicem8.com/docs/addon-kit | https://developer.servicem8.com/docs/manifest-reference | https://developer.servicem8.com/docs/servicem8-add-on-store
