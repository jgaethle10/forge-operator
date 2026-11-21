# Saban / Systemia: external-builder lessons → Evercraft evidence gates

**Date:** 2026-11-10  
**Status:** source proposal; NOT merged, NOT deployed, NOT physical Node002 proof  
**Boundary:** owned Evercraft code and infrastructure only. Do not copy another builder's proprietary source, run unapproved binaries, or contact unauthorized hosts.

## The engineering rule

Intelligence, authority, execution, observability, and distribution are **five different contracts**. An agent must be able to perform useful, authorized work, but watching or scoring the agent must not accidentally become a second opaque controller. A safety signal is different from passive analytics: missing safety telemetry is a HOLD, not a reason to quietly bypass a check.

### Already present (do not reinvent)

- `systemia/saban/ambient-fabric-executor.mjs`: bounded remote workload requests, per-unit results, idempotency keys, resumable state, and gateway receipts.
- `systemia/saban/performance-learning.mjs`: local performance ledger, observed durations, failures, p95, and circuit signals. Its data is not equivalent to automatic execution authority.
- `systemia/saban/microseed-executor.mjs`: workload registry, device safety envelope, and execution receipts, not general remote shell.
- `scripts/evercraft-physical-ten-job-acceptance.mjs`: opt-in physical hash-only, receipt-bound acceptance probe with replay/conflict/lease checks.
- `scripts/nextgen/README.md`: exact-device authorization, resident-worker, and independently verified receipt gates.

## Changes proposed in this branch

**Per-unit failure isolation:** synchronous/async failures in `inputProvider` and `telemetryProvider` no longer reject an entire ambient execution batch. The affected placement becomes `held`, with a stable, non-secret error reason and `replan_required:true`. Other admitted placements can finish.

**Safety invariants:** a failed telemetry provider MUST NOT result in a gateway call for that placement. The change does not relax the device safety envelope, grant enrollment, enable a public listener, or authorize shell execution.

**Regression tests:** `tests/saban-ambient-fabric-provider-isolation.test.mjs` covers one bad input among good work, one bad safety-telemetry source among good work, and an all-held batch with zero remote calls.

Run the scoped checks:

```bash
node --check systemia/saban/ambient-fabric-executor.mjs
node --test tests/saban-ambient-fabric-provider-isolation.test.mjs
node --test tests/saban-ambient-fabric-executor.test.mjs
```

## Lessons converted to measurable acceptance

| Priority | Lesson | Existing/next implementation | Evidence required to claim success |
|---|---|---|---|
| P0 | Keep safety separate from analytics | Device safety envelope enforces admission; performance ledger observes outcomes | A telemetry failure holds only its affected unit, no gateway dispatch; analytics never creates new authority |
| P0 | One failed unit must not crash a swarm | Per-unit provider isolation in this branch | 3 deterministic tests plus existing gateway regression |
| P0 | Authorization is not discovery | Node002 and Yard exact-device trust remain separate | Physical source-pinned identity, scoped lease, signature validation and revocation receipts |
| P0 | Make execution verifiable | `scripts/evercraft-physical-ten-job-acceptance.mjs` | 10 real device-origin hashes, independent recomputation, replay/conflict and lease-release evidence |
| P0 | Do not confuse sandbox root with machine root | Keep host paths and privileged operations outside generic agent command tools | No shell/host filesystem access in registered work; denied cross-boundary test |
| P1 | Model instructions should be short and testable | Compare short coding prompts versus layered prompting with same small local model | Completion rate, exact-output score, p50/p95 latency, tokens, retries, and task corpus hash |
| P1 | Default working directory should be stable | Introduce explicit per-job workspace manifest before new file-producing adapters | Canonical realpath containment; reject traversal/symlinks; output returns to declared artifact root only |
| P1 | Remote compute need not replicate inference | Keep local inference and remote registered work separately deployable | Remote registered-job receipt without remote model installation; no generic exec bridge |
| P1 | Diagnostics must be measured, not worshipped | Benchmark core execution alone, then with passive performance collection; compare matched job sets | Overhead p50/p95, error delta, sample counts and configuration hashes |
| P1 | Failures are first-class tests | Inject provider errors, gateway outage, expired lease, restart and replay | Per-case deterministic status, bounded recovery time and redacted receipts |
| P1 | Artifact retrieval must be scoped | Existing content-addressed worker artifact return | Only allowlisted job outputs; byte length and SHA-256 verified, no broad runtime archives |
| P2 | Speed claims need controlled benchmarks | Baseline local network transfer separately from compute | Transport type, cold/warm cache, file entropy/size, independent hash, repeated measurements |
| P2 | Product value is a different metric from technical completion | Work Saban remains separate from infrastructure Saban | Customer-authorized input → usable deliverable → acceptance → payment receipt, without fake revenue claims |

## Next owned-only execution sequence

1. Merge this branch **only after CI / reviewer checks**. Run scoped tests and inspect all security changes.
2. On a disposable owned test setup, measure the same bounded registered hash tasks with no passive analytics and with performance-ledger observation. Run randomized paired trials; report medians, p95, sample counts, and any missing measurements, not invented speed improvements.
3. Pin a small local model and standardized prompt suite, compare basic execution against SAGE-like analytical overlays only as offline experiments. Do not let a new analyzer change the authorization policy.
4. Define a per-job workspace contract and test traversal/symlink escapes with synthetic files before any real file operations are delegated.
5. Resume Node002 physical acceptance **only with owner-confirmed authorization**, independently pinned worker source, and exact-device trust. Keep shadow telemetry separate from compute admission.
6. Tie the first Saban deliverable to a specific Work Saban paid pilot. Count settled revenue only from verified provider receipts.

## Stop conditions

Any failure in identity verification, authorization, lease scope, device telemetry needed by safety, receipt integrity, artifact digest, or path containment is a HOLD. No automatic privilege expansion, open-world crawling of internal files, broad remote shell, silent installation, or third-party spend.

**Truth boundary:** this branch proves source behavior only after tests run. It does not establish that any live HP/Penguin deployment, autonomous recovery, or paid customer job occurred.
