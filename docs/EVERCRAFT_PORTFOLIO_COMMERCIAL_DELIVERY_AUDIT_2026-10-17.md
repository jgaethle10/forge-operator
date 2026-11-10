# Evercraft Portfolio Commercial Delivery Audit
**Audit date:** 2026-10-17 Pacific / 2026-10-18 UTC  
**Scope:** Partner discovery, public human doors, MCP integrations, payment authority, Edge/Yard custody, GitHub source and CI.  
**Classification:** Source-backed incident and recovery plan, not a completed audit of every business application.

## Audit boundary
The connected GitHub account reported access to two repositories, `jgaethle10/forge-operator` and `jgaethle10/rudolphandsons-site`, with push permission. The existing portfolio repository publicly indexes **68 products/capabilities**; the Base44 app enumeration returned **100 items at its tool maximum**, which is not proof that the total estate is exactly 100 or that all apps were exercised. No claim of exhaustive per-app functional certification is made.

## P0 independently observed delivery failures

| Surface | Latest independent result | Correct release truth |
|---|---|---|
| ForensiScope public MCP | HTTP 402 | HELD, do not route developers |
| FindMyPart public MCP | HTTP 402 | HELD |
| EventWave public MCP | HTTP 402 | HELD |
| Evercraft Clip public MCP | HTTP 402 | HELD |
| Evercraft Web public MCP | HTTP 402 | HELD |
| Capability Discovery public MCP | HTTP 402 | HELD |
| Capability Discovery human HTML | HTTP 402 | HELD |
| Evercraft Payments quote API | HTTP 402 | HELD; previous $750 quote proofs are historical, not current |
| Sovereign Fabric public /health | HTTP 200 | reachable **but not release attested**, `deployment_receipt_bound=false` |
| Edge operator Journal surface | `journal_live_edition_missing` in latest Chromebook canary | DO NOT claim healthy full-edge publication |

**Independent machine proof:** GitHub Actions run [39100314879](https://github.com/jgaethle10/forge-operator/actions/runs/39100314879), job `117595070800`, observed 2026-10-18 05:22 UTC. The canary invokes initialize, tools/list, safe capabilities calls, the developer page, and an Evercraft Payments *quote* only. No checkout sessions or charges created.

**Additional human storefront failures:** The Systemia Portfolio Sentinel main-branch report, run [39098946339](https://github.com/jgaethle10/forge-operator/actions/runs/39098946339), flagged HTTP 402 on Evercraft Property Services `https://evercraftpropertyservices.com/`, Systemia Field Library `https://systemiafieldlibrary.com/`, and The Forensic Record `https://filescompanion.com/`. These need fresh independent rechecks before reinstating paid customer paths. Havenly remains within the separately blocked portable/owned release lane; its complete customer booking/checkout journey was **not** verified by this audit.

## Confirmed CI and infrastructure issues

- Portfolio Sentinel previously reported three false high-severity missing script/file findings for `.github/workflows/evercraft-browser-worker.yml`. Its parser ignored `jobs.<name>.defaults.run.working-directory`, although those files and `npm run proof:webgpu-reference-frame` exist in `systemia/evercraft-web/browser-worker`. Regression fix landed on main via [PR #1398](https://github.com/jgaethle10/forge-operator/pull/1398), merge `3e8c410a161044bdd6013abb72cc6331becf8b83`. Existing Systemia organism proof, Portfolio Sentinel and full Forge CI passed. This repair does NOT clear the actual public failures.
- GitHub Actions [Chromebook Operator Public Edge Canary run 39099761629](https://github.com/jgaethle10/forge-operator/actions/runs/39099761629) failed `journal_live_edition_missing`, with Stage `journal_surface`. That is real delivery drift; do not quiet the monitor without deploying the exact Journal edition and verifying receipt.
- GitHub Actions RIVET Change Control failed on the owned developer recovery branch; this is a separately held legal/release lane, not a permission to publish or sell RIVET.
- HP Node002 is tracked in Systemia as signed shadow telemetry, **not** an enrolled autonomous production executor; don't claim it can solve the missing Yard deployment receipt.
- The October 14 synthetic Evercraft Payments tests created processor **checkout_open** records only, not provider-verified paid receipts. The intended merchant-owned percentage-fee plan is design-only; the existing fixed $750 bounded Founding Integration Pilot is optional, not mandatory.

## Concrete repair sequence

1. **Quarantine dead routes.** Mark older passed Base44 MCP/payment receipts superseded. Never show dead provider endpoints as active integration doors and never forward customers to a 402 path. Systemia incident: `evercraft-public-commercial-mcp-http402-20261017`.
2. **Restore the read-only front door in the owned organism.** Existing Forge Fabric source [PR #1401](https://github.com/jgaethle10/forge-operator/pull/1401) adds `/developers` (human), `/developers.json` (machine state) and the already source-implemented `/mcp` (read-only discovery) with six specialist providers explicitly HELD. Dedicated source tests pass. This is **not yet live** at the public origin.
3. **Bind exact Yard deployment receipt.** Require an authorized signed source/artifact/runtime release, start or update the existing owned host through its approved mechanism, and independently recheck exact revision, TLS/health, page at mobile widths, JSON, MCP initialize/list/tool call, and upstream dependencies. Without this, no green production designation or marketing claim.
4. **Recover EPS/Havenly customer frontages separately.** Reuse existing portable EPS/Havenly owned source, preserve real inquiry handling and accessibility, prove authorized DNS/origin control and end-to-end booking and response. The GitHub portable artifact is **not** a live site.
5. **Rebuild specialist functions only as required by integration demand.** Each needs an owned callable endpoint, safe authentication and privilege boundary, a genuine independent host client install, source-backed output and reliable retry/receipt path before publishing.
6. **Restore Evercraft Payments canonical chain.** Owner-controlled account/processor agreement and Raven Nexus route -> exact checkout -> authoritative provider verification -> canonical Evercraft Payments paid receipt -> delivery and refund/chargeback reconciliation. No new money-movement method, transaction percentage or claimed customer payment until that path passes.
7. **Reopen distribution after real acceptance.** Submit only permissioned Entire/GitHub marketplace entries with publisher identity, verified partner client installation, live recipient proof and correct human pages; no shotgun Discord DMs.

## Source PR release policy
- [#1294](https://github.com/jgaethle10/forge-operator/pull/1294) (developer inventory): **DRAFT / FAILED LIVE RELEASE GATE**. Historical MCP URLs cannot be advertised as functioning until fixed.
- [#1398](https://github.com/jgaethle10/forge-operator/pull/1398) (Sentinel working-directory): **MERGED SOURCE REPAIR** after tests/CI passed.
- [#1401](https://github.com/jgaethle10/forge-operator/pull/1401) (owned developer entry): **SOURCE CANDIDATE / NOT DEPLOYED**. Keep release held until signed Yard receipt + external public readback.

**Commercial release remains BLOCKED.** A successful build, static directory, HTTP 200 on unrelated /health, or synthetic checkout redirect is not proof of complete delivery.
