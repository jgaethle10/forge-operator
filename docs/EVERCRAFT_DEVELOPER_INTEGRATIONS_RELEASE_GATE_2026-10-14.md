# Evercraft | Developer integration distribution gate

**Status:** developer discovery verified on October 14, 2026; full partner/commercial readiness remains **HELD**.

Evercraft's real public developer entrance is:

- Human-readable directory: https://findmypart.base44.app/functions/evercraftCapabilityDiscoveryMcp
- Remote MCP: `https://findmypart.base44.app/functions/evercraftCapabilityDiscoveryMcp`
- Read-only developer tools: `list_evercraft_integrations` and `match_evercraft_integration`
- Audited snapshot: [`evercraft-developer-integrations.json`](../public/.well-known/evercraft-developer-integrations.json)

This is **one existing connector**, not a replacement product or separate checkout. In a remote Streamable HTTP MCP client, add that URL, initialize and list tools, then ask it which specialist fits your app. Connect the specialist MCP only after reviewing the returned tool list, capabilities and access limits.

## What external builders can try now

| Integration | Example use | Tested public boundary |
| --- | --- | --- |
| ForensiScope | Determine how to route large video/audio for assisted analysis | Public pricing/routing only; actual file analysis needs authenticated user rights and paid approval |
| FindMyPart | Free evidence-first identification of difficult replacement parts | Human-confirmed checkout only; no payment assumed |
| EventWave | Search source-backed events by city and date | Paid promotion requires separate consent and evidence review |
| Evercraft Clip | Plan campaign derivatives for permitted source media | Public MCP is planning-only, not publishing |
| Evercraft Web | Retrieve and inspect public pages with bounded provenance | Authenticated browsing, browser execution and search are held |
| Capability Discovery | Find matching Evercraft modules | Read-only public directory, no payment |

The six MCP servers passed public initialization, `tools/list`, and one safe read-only capability invocation in the October 14 audit. This is **not** an independent third-party install test, commercial outcome, or endorsement by Entire or any other platform.

## Portable smoke check

From Forge Operator:

```sh
node scripts/probe-evercraft-developer-integrations.mjs
node scripts/probe-evercraft-developer-integrations.mjs --live
```

The first command verifies the inventory and commercial truth assertions **offline**. The second performs only public read-only MCP initialize, tools/list, a safe capability call for each connector, the developer HTML page, an Evercraft Payments `quote` (no checkout), and Fabric health. It prints a structured result including unresolved release gates. **Neither mode initiates payment, writes a merchant account, publishes, or triggers fulfillment.**

To deliberately require full commercial clearance, use `--live --strict-release`. Today it should return a nonzero exit because the release prerequisites are not all satisfied. **Do not interpret a healthy HTTP endpoint as custody or attested production readiness.**

## Evercraft Payments commercial truth

Evercraft Payments is the canonical order/receipt/fulfillment authority; Raven Nexus routes to the provider adapter. The existing **$750 Founding Integration Pilot** remains an optional implementation offer. A merchant-owned, low/no-setup **percentage-of-eligible-transactions option is a founder-approved *direction*, not an enabled SKU**, announced take rate, installed connected-account gateway, or proven settlement split.

Before making that option commercial, separately verify merchant-owned accounts, processor/platform eligibility, written fee terms, correct processor- and platform-fee math, settlement/payout reconciliation, retries, refunds, disputes, idempotency, authoritative receipts, consent, and delivery. Evercraft should not claim revenue share for incremental customer business without a simple agreed attributable baseline; a fee for processing eligible payments is a different contract.

Only `https://findmypart.base44.app/functions/evercraftBuy` is the existing human Evercraft Payments offer hub. An HTTP 200 form, a synthetic 303 checkout redirect, and even an open processor session **do not prove paid status**.

## Active HOLD: sovereign Fabric/Yard release

At the last observation, `https://fabric.systemiacommandcenters.com/health` returned HTTP 200 and public read-only MCP was reachable, but `deployment_receipt_bound=false`. Systemia incident `evercraft-fabric-public-release-attestation-missing-20261014` remains open. Release needs an authorized, signed Yard artifact bound to the exact deployed runtime and independently checked. The canary does **not** manufacture attestations, change DNS, move customer money, deploy unknown hosts, or bypass human confirmation.

## Promotion checklist

The minimum independent acceptance sequence is: a partner accepts the MCP in a compatible client, invokes one permitted real tool, reports correct results and safe denied operations, reviews the real human page on mobile, and (only for a consenting commercial pilot) completes a **proper provider-verified** payment to a canonical Evercraft Payments receipt and scoped fulfillment receipt. Capture the exact links, hashes, timestamps, test environment and independent witnesses.

An Entire, n8n, developer-directory or other marketplace listing requires its own publisher approval. The GitHub repository existing again is a source-control milestone, **not** automatic plugin approval or a live partner distribution agreement.
