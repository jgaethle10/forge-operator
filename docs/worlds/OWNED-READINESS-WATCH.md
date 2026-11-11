# Evercraft Worlds · owned HTTPS readiness watch

**Scope:** non-mutating, evidence-first launch monitoring for the standalone Worlds runtime and the Heritage and Hidden World exhibits.

## Watch contract

The GitHub Actions workflow `.github/workflows/evercraft-worlds-readiness-watch.yml` runs:
- Every six hours, after changes to the relevant runtime/exhibit source on main, and on manual dispatch.
- On pull requests touching the monitor code, **unit tests only**, with external probing skipped.
- On main and scheduled runs, `scripts/audit-worlds-owned-readiness.mjs` checks three separate surfaces over the exact configured public HTTPS origin: the owned Worlds vault, the Heritage site and source files, and Hidden World source files.
- Each run publishes `artifacts/worlds-readiness/read-only.json` as the `evercraft-worlds-owned-readiness` artifact, and a compact status in the GitHub Actions job summary.

## Meaning of status

| Status | Meaning | Public-ready? |
|---|---|---|
| `blocked_no_origin` | `EVERCRAFT_WORLDS_PUBLIC_ORIGIN` is absent | **No** |
| `blocked_invalid_origin` | Supplied origin failed the strict HTTPS origin contract | **No** |
| `failed_external_check` | At least one actual external check failed or threw | **No** |
| `verified_readonly` | All three public HTTPS GET checks passed at that moment | **Not enough on its own** |

Even after `verified_readonly`, customer writes and a physical iPhone are **not verified** by this monitor. No checkout, customer account, DNS, lease, certificate, or production Systemia mission is created. A successful GitHub Action with the `blocked_no_origin` receipt must never be promoted as a public release claim.

## Operator-owned deployment prerequisites

1. Deploy the Worlds vault on the approved Evercraft-owned machine with persistent private storage and exact pinned public HTTPS origin.
2. Establish a **dedicated** owned HTTPS hostname on the existing Evercraft edge and an authorized, renewable Worlds route lease. Never replace a shared Fabric or Journal route.
3. Set the GitHub Actions repository **variable**, not a secret in code, `EVERCRAFT_WORLDS_PUBLIC_ORIGIN` to the verified origin only (for example, `https://worlds.YOUR_OWNED_BASE_DOMAIN`).
4. Review the next `Evercraft Worlds owned public readiness (read-only)` run's artifact for exactly which surface passed or failed.
5. Only after the public read-only check passes, use the separate operator-approved `evercraft-worlds-public-gate.yml` release workflow to opt into a disposable create/edit/delete drill. Perform a separate real-device Safari test.

The watcher itself **never** invokes the mutating test or the edge lease reconciler. If the endpoint is not deployed, leave the status blocked until external proof is available. If source CI is green but this external receipt is blocked, release remains blocked.

## Release warning visibility (November 10)

The actual November 10 scheduled readiness receipt reported `blocked_no_origin`. Running the monitor successfully does not mean the runtime is deployed. Every main/scheduled check that returns `verified:false` now emits a **GitHub Actions warning annotation**, adds the actionable blocker to its job summary, and points to [Worlds release issue #1994](https://github.com/jgaethle10/forge-operator/issues/1994).

The scheduled job continues to complete normally when the origin is missing, to avoid a stream of operational test failures. The **release itself stays blocked** until a real owned-host external HTTPS receipt passes. An alert is not a deploy action; the operator still controls DNS, TLS, service activation, edge lease and authenticated drills.
