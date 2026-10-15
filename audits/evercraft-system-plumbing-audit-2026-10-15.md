# Evercraft Whole-System Plumbing Audit
**Snapshot:** 2026-10-15, America/Los_Angeles. **Method:** connected GitHub repository/source reads, connected Base44 application inventory and payment entity queries, connected Evercraft Fabric public catalog, a read-only public HTTPS probe from connected sandbox, and DigitalOcean droplet inventory. No writes to production, customer contact, payment creation, device login or customer-data export. **Classification:** preliminary deep cross-plane audit, not a complete security penetration test, full application-code audit, or live recovery drill.

## Decision summary
**System is partially operational and fragmented.** The public-owned Fabric discovery layer serves 51 read-only capabilities. The current canonical buyer directory publishes 13 HTTPS selected-offer intake forms, and each returns HTTP 200 with exact offer and checkout CTA. But checkout POST→provider-paid→Evercraft order→entitlement→Shipping remains unverified in the current audit, so do **not** call commercial checkout fully proven. The main control weakness was a workflow that rewrote verified customer URLs directly on `main`; PR #1309 mitigated this exact writer. Similar unrestricted writer/release paths require a repository-wide sweep before calling the release pipeline trustworthy.

### What was directly observed (not inferred)
| Plane | Observations | Confidence / limitation |
| --- | --- | --- |
| Public Fabric | `https://fabric.systemiacommandcenters.com/health` returned 200, `ok:true`, 51 capabilities, `read_only:true`. Owned `/mcp`, `/capabilities`, `/offers` and `/offers/website-audit` returned HTTP 200. | Network GET + MCP discovery only; not proof of 51 independent live implementations or authenticated specialist actions. |
| Fabric health detail | `journal_mirror_ready:true`, `demo_surface_ready:true`, `visual_desk_ready:true`, `edge_attestation_supported:true`, `deployment_receipt_bound:false`, `faie_base44_transport_enabled:false`. | These are runtime self-reported readiness flags. Deployment-receipt binding is a specific gap. |
| Public commerce | Main GitHub catalog: 13 bounded offers, 13 exact buyer URLs; payment pilot buyer form GET 200. Historic external exact buyer-form probes pass. | Form load **does not** prove successful form POST, live processor authorization, paid receipt, refund, shipping or customer delivery. |
| Broken public URL | `https://jgaethle10.github.io/forge-operator/chum/` returned HTTP 404 on the latest external check. | Do not republish this as live. Other old public deep links may be broken; not exhaustively crawled. |
| GitHub release controls | Repo `jgaethle10/forge-operator`, public, owner admin access. Previous `legacy-provider-purge.yml` had `contents: write` and `git push origin HEAD:main`; direct Systemia cutover regressed all 13 buyer links. PR #1309 removed this writer and restored buyer URLs on `main`. | Other workflows, credentials, runner permissions, branch protection and deploy approvals not yet fully enumerated. |
| PR backlog | GitHub search returned at least 60 open PRs (query capped 60), including checkout buyer-email fix #1300, payments merchant OS #1297, connector release #1294, canonical directive intake #1289, release control #1298, hardware #1299 and numerous commercial/UX fix PRs. | Search was capped at 60, so this is a floor, not a complete backlog count. PR existence is NOT deployed code. |
| Base44 | Connected user app list returned exactly 100 apps, the tool's maximum page size, including Systemia Command Center, Raven Nexus, AI Suite, FindMyPart, Fabric-adjacent, Payments-adjacent, Legacy/PayFlow, Guardian, RIVET, Rewards and others. | **At least** 100 apps, not a complete census; tool exposes limit 100 without pagination in its schema. Multiple similarly named apps increase ownership/route drift risk, not proof of duplicates. |
| Connected payment ledger | Prior scoped account query: 75 payment orders total; 68 explicitly synthetic, 7 without synthetic flag, **all** `checkout_open`, zero `paid` in queried rows. All 13 advertised offers were active with `ready` fulfillment contracts. | This is connected FindMyPart payment ledger only, not an exhaustive processor/bank settlement reconciliation. `synthetic:false` alone is not evidence of a real customer. |
| Processor access | Connected Stripe account list access declined, so no Stripe account balance, charges, webhooks, disputes or payment methods verified. | Do not claim live Stripe cash receipts from metadata. |
| DigitalOcean | Connected DigitalOcean API returned zero droplets on the first page. | Only this account/connection; does not exclude other hosts, tunnels, other DO accounts or cloud providers. |
| HP/Chromebook edge | Prior operator transcript showed HP Windows scheduled WSL keeper `Running`, local Fabric health with 51 capabilities, Node002 agent `active`; Node002 remained shadow/restricted. Public endpoint remained distinct. | Transcript-level proof, not a live remote health/restart/blackout exercise performed for this audit. Hardware reboot recovery, secrets and data backup have NOT been independently proven. |

## End-to-end dependency graph and recommended authority
1. **Discovery:** ChatGPT OpenAI plugin read-only matcher / public Fabric `/mcp` → canonical capability ID, bounded human CTA. Publication is not purchase authorization.
2. **Commercial:** exact approved buyer form → buyer chooses and confirms price → **Evercraft Payments canonical PaymentOrder** → Raven Nexus settlement adapter → signed/verified provider evidence → separately reconciled paid/refunded status → Systemia entitlement/Shipping → documented delivery. Do not promote synthetic sessions into revenue.
3. **Core orchestration:** Systemia admission → dependencies/dedup/priorities → Passport approval for consequential action → Yard validated release → deployment/rollback receipt → observation. A GitHub commit is not a deploy receipt.
4. **Runtime:** canonical source in GitHub → CI build tests and artifact hash → controlled deployment to owned Fabric edge and optional HP/Chromebook capacity. Founder devices must not be the sole production quorum.
5. **Legacy:** Base44 remains temporary continuity only until an owned replacement passes functional, data parity, auth, release, rollback and route tests; never retire a working paid path to a 404 placeholder.

## Findings and priority
### P0 A. Release governance is too permissive for production-changing bots
**Proof:** a GitHub Actions workflow with write scope and automatic main push previously reverted a verified payment-path fix on the same day. It is now repaired (#1309), but a repo-wide workflow audit remains pending.
**Required:** inventory every `contents: write`, `git push`, bot commit and deployment trigger; protect main with mandatory reviews/status checks for commercial, financial, auth and DNS/edge paths. Separate generator bots from production publishers and use signed release receipts. Prove a simulation where an unauthorized bot tries to revert a buyer URL and is blocked.

### P0 B. Payment and fulfillment receipts are not connected end-to-end
**Proof:** public HTML buyer intake works for 13 bounded offers, but no independent current checkout POST test or provider-signed paid receipt, and queried payment ledger recorded 0 paid orders. Source says Evercraft Payments → Raven Nexus → provider, but source declaration is not production proof.
**Required:** one synthetic sandbox transaction with customer consent in approved testing environment, authentic provider event/refetch and replay protection, canonical order idempotency, entitlement/Shipping record, cancellation/refund path, then a separately authorized real low-risk purchase and payout reconciliation. No live charges without explicit owner/customer consent.

### P0 C. Product source vs runtime and owned-vs-legacy mismatch
**Proof:** 100 visible Base44 apps, multiple product surfaces, read-only Fabric catalog and business-critical hosted checkout; migration doctrine claims GitHub/Yard canonical. Live `deployment_receipt_bound:false` despite other positive health flags. Several sale-listed Fabric capabilities still show `start_url_state:held_no_owned_public_origin`.
**Required:** machine-generated authoritative service registry per app/product: owner, source repo/ref, live URL, current immutable deployment hash, credentials owner, data store and retention, auth provider, upstream/downstream dependencies, pricing state, rollback route, canary result, and migration class. Release labels must be computed from receipts, not optimistic metadata.

### P1 D. GitHub PR and mission density creates integration drift
**Proof:** >=60 open PRs in the sampled query including overlapping checkout fixes and infrastructure transitions; branch changes in PRs are not automatically on main. Many independent changes risk stale merges and CI fan-out.
**Required:** Systemia single-priority mission ledger, ownership, canonical dependent PR, superseded PR closure, release trains grouped by dependency, status checks and merge queue. Do not mass-merge just to reduce numbers. Assign one integration lane to payments, one to Fabric/distribution, one to core/Compute, one to research.

### P1 E. Public discovery and customer-facing deep links need independent crawl
**Proof:** GitHub Pages CHUM root returns HTTP 404; selected own Fabric routes and transitional buyer hub return 200. Plugin's read-only matchers list sell-now offerings whose `start_url_state` remains held.
**Required:** crawl *every* externally advertised URL and agent connection option across manifests, llms, JSON-LD, Chum, directory, social pages, plugin cards and sitemap; classify 200/page quality, redirect, 404, auth required, held, checkout-form test, provider paid and fulfillment evidence separately. Never auto-rewrite a bad URL to a non-existent fallback.

### P1 F. Hardware autonomy, backups, and failover unproven
**Proof:** prior operator local HP Systemd+Windows WSL keeper passed while signed in. This audit could not access HP/Chromebook runtime or verify restoration to a clean machine, independent replicas or outage/sleep survival. DigitalOcean account returned zero droplets.
**Required:** collect signed masked machine inventories/versions, role/authority register, automatic relaunch evidence, UPS/sleep behavior, remote heartbeat separation from real compute admission, encrypted backup snapshots with restore drill, independent public-edge warm standby and DNS failback plan. Do not silently authorize remote code or copy secrets into audits.

### P1 G. Secrets, tenant isolation, privacy and regulatory authority
**Proof:** code/README proposes Raven Nexus and processor adapter isolation; no complete live secrets inventory, key rotation test, webhook HMAC validation, dependency scan, access audit, privacy/retention or PCI scope assessment was performed.
**Required:** secrets leak scan, GitHub workflow permission inventory, Base44 admin function/RLS review, provider callback authenticity verification, tenant-bound entity and entitlement tests, controlled key rotation, dependency/container image audit, incident response and financial compliance review. Do not mark these passed without evidence.

### P2 H. Operational observability and revenue attribution
**Required:** single read-only enterprise Control Room scoreboard showing truth states: discovery calls, matched capabilities, verified human start, checkout-created, verified-paid, refunded, fulfilled, promoter attribution, Systemia admitted vs held missions, edge uptime, latest deploy hash, backup restore age, CI backlog. Unknown ≠ zero. Hard-coded counts and labels cannot be advertised as real activity.

## Release acceptance matrix
- `PUBLIC_200`: exact live URL and content/offer match independently checked.
- `CHECKOUT_INTENT`: buyer explicitly confirms price and scope; canonical order exists.
- `CHECKOUT_SESSION`: provider session exists; **not** sale.
- `PAID_VERIFIED`: authoritative provider event refetch or validated signature with amount, currency, order, merchant and replay defense.
- `ENTITLED`: canonical order grants idempotent fulfillment authority.
- `SHIPPED`: named output and recipient access receipt confirmed.
- `SETTLED`: provider/bank payout reconciled; not assumed from paid.
- `OWNED_RUNTIME`: HTTPS production endpoint, signed deployment/hash, health, rollback drill and stable external observation.
Every change must preserve green earlier gates. If the next stage is unknown, label `HOLD`, not `READY`.

## No unsafe changes taken during audit
No customer payment, Stripe operation, outreach, API credentials, GitHub main push, bulk Base44 write, public DNS cutover, HP device command, node privilege change, or destructive cleanup was performed. Current document is review material.

## Immediate Systemia admission
P0 release governance audit, P0 payment lineage, P0 source-to-runtime registry; then P1 deep-link crawl, repository CI and backup/restore. Dedupe with #971, #1220, #1224, #1303 and existing release/compute issues. Require owner-approved execution gate for consequential actions.


## Addendum: workflow-authority and commercial-source sweep (October 15)
**This is new evidence beyond the initial baseline**, generated from a complete untruncated GitHub tree and a local clone of the audit branch. It does not elevate test-only work to deployed state.

### GitHub Actions inventory
- Inspected **189** workflow YAML files from the GitHub repository snapshot, all fetched and inspected successfully.
- **12** declare `contents: write` and contain direct `git push` commands to `main`. This count excludes indirect deploy rights embedded in scripts, external tokens and GitHub repository/organization branch rulesets, none of which were fully assessed.
- The 12 observed direct writers are frozen in `audits/workflow-writer-baseline-2026-10-15.json` as **legacy inventory exceptions, not approval**. High-concern writers include a 5-minute `chum-crawl-pressure` source commit cycle, broad `public/chum` publisher `evercraft-public-edge-canary`, direct plugin package generator, and publication workflows for Journal, domain verification and registry.
- Added `scripts/audit-workflow-writers.mjs`, `tests/workflow-writer-audit.test.mjs`, and read-only GitHub Actions `evercraft-plumbing-writer-audit.yml`. Newly introduced workflow writers, `pull_request_target` with writer authority, direct stages of protected buyer files, and apparent pushes without declared content-write permissions fail the gate. Retiring known writers is allowed. The audit cannot substitute for GitHub main branch protection.
- Source-to-public commercial inventory: **52** capabilities in GitHub source `public/chum/capabilities.json`, but **51** returned by the currently connected Evercraft MCP plugin. The source-only extra was `lineage-founding-pilot-v1`. No deployment provenance receipt currently explains the difference; do not assume this is an outage rather than version lag.
- Of **17** source capabilities labeled `sell_now`, **all 17** have `start_url:null` / `held_no_owned_public_origin`. Their commercial offering may be discoverable but the **owned purchase continuation has not been proved**; separately, 13 specific transitional buyer forms have externally verified GETs. These are different populations and must not be summed or automatically mapped.
- Direct-door readiness source contains **17** products, **1** marked directly callable/published, **16** held. Registry source includes **44** product entries. Different catalog dimensions are not interchangeable with deployed app or permission counts.
- New `scripts/audit-evercraft-commercial-topology.mjs` and tests reconcile 52/17/13/17/44 source dimensions into an explicit hold/evidence map without creating transactions or auto-claiming successful revenue.
- Temporary read-only CI: `Evercraft Plumbing - writer and commerce topology` generated tests and audit artifact; a clone of the audit branch executed **12/12 tests successfully**. GitHub's dedicated PR workflow also completed successfully. Broader Forge and Sentinel checks were running at the audit instant.

**High-leverage next action:** Require branch ruleset/status review for `.github/workflows`, `systemia/payments`, `public/.well-known`, `server.ts`, and production edge manifests; convert high-churn direct-to-main writers to artifact-only staging or reviewed PRs in a controlled migration, not in one uncontrolled cutover. Bind immutable deploy SHA to `/health` and create a receipt from the edge, then perform a product-to-runtime/merchant-flow canary.


### Additional action/runners supply-chain inventory
- A read-only scan of all **189** GitHub workflow files found **40** scheduled workflows, with **six** on five-minute cron intervals (CHUM crawl pressure, KAIDANCE frontier field, revenue autonomy heartbeat, Saban ambient pilot, Systemia legacy rescue watch, Systemia portfolio Sentinel).
- Seven workflows declare `id-token: write` (OIDC issuance authority). These are inventoried separately from `contents: write` because OIDC credentials can authorize cloud or runtime operations even when GitHub source access is read-only. The audit blocks unreviewed **new** OIDC grant paths but does not attest existing trusted federated identities.
- **186/189** workflows reference at least one action by mutable version tag rather than exact commit SHA. There are **461** such `uses:` references. This is not evidence of compromise, but makes action-supply-chain reproducibility weaker than pinning and periodic reviewed upgrades.
- The read-only gate has **13 passing Node tests** across workflow write/OIDC authority and cross-product commercial topology. Dedicated PR CI is required independently before integration.
- **Do not disable six five-minute monitoring cycles en masse.** First separate observation/receipt production from Git writes; preserve intended cadence while moving recurrent generated source commits to an approved, narrow release mechanism. Protect workflow edits and dedicated commercial manifests with GitHub repository rulesets requiring review.
