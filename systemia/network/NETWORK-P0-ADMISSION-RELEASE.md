# Evercraft Network | P0 continuity and transport safety gate

**Review candidate, November 15, 2026.** Code-level admission hardening only. It does not authorize deployment, pairing, radio transmission, carrier access, eSIM activation, emergency calling, or any physical Field Test 01B success claim.

## What this branch actually changes

It consolidates previously separated safeguards from [transport PR #1558](https://github.com/jgaethle10/forge-operator/pull/1558) and [continuity PR #1595](https://github.com/jgaethle10/forge-operator/pull/1595) on a current main branch, with further explicit-evidence checks:

- Transport requests reject invalid or unbounded payload sizes, unknown latency classes, non-array catalogs, and non-Boolean offline requirements. Verified catalog entries with malformed payload ceilings, latency, power or Boolean capabilities are ineligible. If none qualify, return `NO_ROUTE` rather than inferring connectivity.
- Continuity admission rejects nonfinite, negative, coerced or missing CPU, memory and power envelopes before allocating workloads. Every workload must have explicit unique identity, priority and required/optional status. A malformed request returns `HOLD_INVALID_RESOURCE_EVIDENCE` with empty admitted/degraded queues rather than fabricating free resources or escalating a malformed priority to life-safety.
- Designed zero-cost workloads and valid local LAN-to-file courier fallback remain permissible when all explicit evidence validates.

## Automated acceptance

```sh
node systemia/network/transport-diversity-proof.mjs
node systemia/network/continuity-kernel-proof.mjs
```

A dedicated GitHub Actions workflow executes both proofs on the same exact candidate commit. Existing transport CI and larger repository checks must be reviewed independently.

## Relevance to Field Test 01B

An operator must not claim a real two-device route because a test packet says `state: verified` without capacity and latency evidence. A continuity planner must not admit critical work when available power, CPU, memory or the criticality flag is unknown.

This PR **does not** resolve the remaining Field01B gates: exact privately held Core release reconciliation; private signed Android APK bytes and signing custody; independently authorized Systemia admission; eligible attested Compute/Yard release; source-locked route/rollback and DeploymentReceipt; two physically distinct controlled devices; independent observed LAN outage and packet exchange; peer delivery/replay/expiry receipts; safety and regulatory review. The source of truth for those remains the privately held RC12/P03 lineage and [public-safe field review PR #1255](https://github.com/jgaethle10/forge-operator/pull/1255).

## Merge discipline

1. Confirm both dedicated Node proof jobs pass at this head revision.
2. Review backward compatibility with any other call sites and legal source custody.
3. Review interaction with open parent PRs #1558 and #1595 and mark them superseded only after this candidate is approved and merged.
4. Do not infer a mobile phone network is activated from a GitHub CI green check.
