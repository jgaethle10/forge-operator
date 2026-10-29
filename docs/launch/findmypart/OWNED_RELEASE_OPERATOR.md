# FindMyPart | owned Fabric launch operator path
Updated 2026-10-28. **Source procedure, not a completed deployment.** No retired app host, customer uploads, production charge or autonomous outreach.

## Launch architecture
1. Customer opens the branded `/findmypart/` page on the Evercraft-owned Fabric TLS origin.
2. Customer supplies only **the part**, **the machine**, **reply email**, and **permission to contact**.
3. `POST /api/findmypart/inquiry` encrypts the details into an owner-only persistent folder, then returns an opaque `FMP-...` receipt. It cannot charge or invoke agents.
4. A PII-free owner notification is queued. An authorized operator can retrieve the private record using `scripts/findmypart-owner-inbox.mjs`. If notification fails, encrypted records remain recoverable.
5. A human confirms scope and the approved research tier before checkout, then the **separate** Evercraft Payments adapter in PR #1598 / Issue #1600 must bind an exact intake receipt to the exact paid offer.
6. Payment is counted only upon a provider-verified receipt, and fulfillment only upon a delivered, reviewed parts research report.

The public page should **never** ask customers to choose a paid plan before describing the missing part.

## Source/CI admission (no production claim)
- `node --test tests/findmypart-launch-system.test.mjs tests/findmypart-public-inquiry.test.mjs tests/findmypart-owned-provision.test.mjs`
- GitHub PR #1701 dedicated launch gate must pass. Other Forge checks should be reviewed separately.
- PR #1598 payment-ops and return tests must pass and be integrated before paid flow release.
- No customer PII, real supplier purchase, or provider card charge in CI.

## Operator diagnostics, on the actual Evercraft edge only
These commands execute **locally on an already installed** Evercraft Node001 Fabric service. Do not run them on an untrusted machine.

```bash
cd ~/forge-operator
node scripts/provision-findmypart-owned-intake.mjs
bash scripts/diagnose-fabric-owned-edge-release.sh
```

The provisioner defaults to **read-only inspection**, and never echoes keys or personal details. To install the private key and persistent storage in the resident Fabric environment **after the approved code has been deployed**:

```bash
sudo node scripts/provision-findmypart-owned-intake.mjs --apply
```

If a valid owner notification principal is configured and the owned Notification Fabric is operational, use the exact authorized principal:

```bash
sudo node scripts/provision-findmypart-owned-intake.mjs --apply --owner-principal YOUR_AUTHORIZED_OWNER_PRINCIPAL
```

The provisioner preserves unrelated `/etc/evercraft/fabric.env` entries, refuses a malformed key or unsafe existing lead folder, uses a service-user-owned directory with mode `0700`, writes only a root-owned `0600` env file, restarts **only** `evercraft-fabric.service`, then requires a successful local `GET http://127.0.0.1:8787/findmypart/` containing the exact two-question form. A failed restart/validation restores the old env and restarts the service again. Never paste or publish the encryption key.

**Important:** The resident Caddy public edge, DNS, TLS, router forwarding, NodeSeed attestation, and actual release SHA are separate verification requirements. No local-check success establishes a reachable public site.

## Review a consented buyer inquiry
Run as the service user or another explicitly authorized operator with access to the private directory and key:

```bash
node scripts/findmypart-owner-inbox.mjs list
node scripts/findmypart-owner-inbox.mjs reconcile
node scripts/findmypart-owner-inbox.mjs show FMP-YOUR_REFERENCE --reveal
```

The `list` and `reconcile` paths emit references only. `show --reveal` deliberately emits private buyer information; never copy that output into GitHub, public logs or automated marketing. Consider a private operator-only GUI in future, but do not expose raw customer documents via public Fabric.

## Turn one inbound part request into a scoped quote
Only authorized operators may do this on the private Evercraft host with the lead encryption key available. No AI prospect scraping or outbound unsolicited contact.

```bash
node scripts/findmypart-owner-inbox.mjs list
node scripts/findmypart-owner-inbox.mjs show FMP-YOUR_REFERENCE --reveal
node scripts/findmypart-owner-inbox.mjs quote FMP-YOUR_REFERENCE quick --reveal
# Or choose deep / rescue only after reviewing the case.
```

The quote command generates a **draft, not a sent email or payment**. It pulls the actual consented part brief and equipment identity from encrypted storage, then uses the exact one-time scope and offer key: Quick $19, Deep $49, Rescue $99. It does not send an email, initiate Stripe/processor checkout, accept the scope on the buyer's behalf, or start an agent job. The operator must review the factual scope, then await the customer's approval and the owned payment adapter's verified purchase path before any charging.

Do not publish the CLI's `--reveal` output in GitHub, public logging, Slack/social channels or external AI prompts. Use an approved private customer communication route. The old `scripts/findmypart-review-inquiry.mjs` helper now delegates to the canonical inbox and also requires explicit `--reveal`.

## Go/no-go criteria
- [ ] PR #1701 merged to an approved owned release, actual deployed SHA and rollback receipt captured.
- [ ] Service-user private path + key configured, owner notification principal verified or manual case review assigned.
- [ ] Local `/findmypart/` page, JS, and private inquiry POST independently tested with a **consenting** real buyer or an isolated nonproduction QA fixture, then operator receipt verified.
- [ ] Public DNS/TLS from **an independent internet vantage** passes `node scripts/probe-findmypart-owned-launch.mjs`. Current assistant environment cannot resolve the internet reliably; absence of resolution here is not proof production is down.
- [ ] On a phone, a buyer can submit, see the reference, safely retry, and not lose a request during refresh.
- [ ] PR #1598/Issue #1600 owned payment adapter, exact SKU, no-charge canary, provider-verified paid and returned receipts, refund, and delivery tested.
- [ ] Systemia explicitly authorizes removing noindex and launching organic distribution through an independently verified Evercraft-owned publishing runtime.

**Do not announce public paid availability** when only the lead-intake portion is running. Free inquiry and paid fulfillment are independent release gates.
