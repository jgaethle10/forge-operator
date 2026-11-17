# Infinite Classroom | Scoped Systemia -> Node002 execution (2026-11-16)

## Why
Evercraft already demonstrated authenticated Penguin -> NextGen leased content-hash jobs. The founder should not be asked to type each new classroom canary into Ubuntu. This extends **that same broker/Compute path** with one bounded workload. It does not add an SSH shell, an external host, a generic command executor or a new enrollment flow.

## New capability
Workload: `systemia.classroom-nextgen-proof.v1`. Exact admitted node: `evercraft-node002-nextgen`. This does not appear in Compute capacity unless **both** are true:

- The local NodeSeed ID is exactly `evercraft-node002-nextgen`.
- The resident NodeSeed has been explicitly configured with `EVERCRAFT_CLASSROOM_NODE002_PROBE_ENABLED=true` on its owned runtime, after installing a reviewed source version. No GitHub merge by itself does this.

Optional `EVERCRAFT_CLASSROOM_LLAMA_PORT` selects a **loopback-only** llama-server port, default 8080; it must be an integer from 1024 to 65535. The caller cannot select a port, URL, executable, prompt, source file, repo commit or output path. It cannot start/restart a service, install packages, publish a webpage, enroll a device, read student data or alter the model. Unsupported requests are rejected.

## Fixed job payloads

`{ "schema":"evercraft.classroom.nextgen-probe-request.v1", "operation":"readiness" }` checks local `/v1/models` only.

`{ "schema":"evercraft.classroom.nextgen-probe-request.v1", "operation":"synthetic_turn" }` additionally sends a single **hardcoded fictional algebra/marbles question** to the local model. Responses are never returned raw through the broker; the output contains only source scope, status, hashes, length, explicit QA blockers and signed-content receipt hashes. Redirects, external origins and arbitrary request fields are forbidden. Timeouts produce holds instead of fabricated confirmations.

## Existing security path

Systemia/Yard authenticates its canonical broker deployment and exact route; reads current authorized, attested NextGen inventory and registered workloads; grants remote capacity through the broker's existing management lease; creates a lease for only `systemia.classroom-nextgen-proof.v1`; submits the fixed payload with a durable idempotency key; verifies the worker and Compute receipts; releases the lease. Broker remote route scope and grant remain separate. Loopback is **proof scope only**, not a public-service claim.

Dispatcher module: `systemia/classroom/dispatch-node002-probe.mjs`. It is an API for the existing authenticated Systemia/Yard resident to call; it does not secretly bypass that resident's authority. `allowLoopbackProof` requires an explicitly approved 127.0.0.1 route and receipt identity matching. Without that flag, only a verified HTTPS broker route is acceptable.

Node worker: `systemia/classroom/node002-compute-probe.mjs`. It stores **0600** completion receipts in NodeSeed's approved local state, deduplicates identically repeated requests, rejects conflicting replays and never stores raw model replies. In-process concurrent duplicates share a single job. The new NodeSeed route requires the existing device/lease authorization before it can execute.

## Existing resident heartbeat integration

The existing `systemia/yard/saban-intent-drain-runner.mjs` now has a **default-off** classroom lane. It does not alter the content-hash intent drainer's behavior when disabled. Only when the trusted Penguin Systemia resident is explicitly configured with `EVERCRAFT_CLASSROOM_SYSTEMIA_AUTO_PROBE=true` will it verify the canonical broker route, check the exact Node002 capability, and invoke the scoped dispatcher.

- `EVERCRAFT_CLASSROOM_SYSTEMIA_OPERATION=readiness` is the default. Optional `synthetic_turn` uses only the fixed fictional marble prompt, no child data.
- A successful probe is recorded privately under the existing Saban state root. The resident reuses a fresh readiness result for an hour, or a synthetic-turn result for 24 hours. Held results have a 15-minute retry cooldown.
- Unsupported operations, unverified routes, device non-admission, server unavailability or unsafe state files hold this **separate** lane without granting general remote control or crashing the normal Saban cycle.
- Each dispatch still requires an authenticated Yard deployment, exact NextGen identity, authorized device, broker management grant and a fresh registered-workload lease. No direct public listener or third-party host is opened.
- **Source merge alone is not active execution.** Both the reviewed NextGen process and the trusted Penguin resident must have this capability enabled through their authorized release/configuration process. Only a fresh authenticated **physical Node002 receipt** establishes that the automatic lane actually ran.

## Deployment and next autonomous step

1. The PR can be merged and CI proven without any human Ubuntu input. This is **source readiness**, not remote execution.
2. Node002 must receive the exact reviewed source through its existing authenticated update channel. Evidence must show an actual active NodeSeed process running that version and advertising this exact workload. Turning on the flag is a privileged, owner-authorized change and must not be inferred from GitHub CI.
3. Systemia must use the *already authorized* canonical Yard broker route, exact approved Node002 device and existing scoped grant. If any gate fails, return `HELD`, no execution. No auto-enrollment or new remote shell.
4. The existing Saban/Yard resident can then invoke `dispatchClassroomNode002Probe()` on a permitted scheduled/mission cycle and persist the sanitized result. This requires explicit trusted integration into that resident; importing this module alone does not schedule work.
5. Actual NextGen response proof is a local-loopback transport observation, **not** independent model-process attestation, child-safety certification, tutoring-quality validation, cross-device access or a public classroom launch.

## Current state and nonclaims

CI uses a synthetic local HTTP model fixture, not the founder's HP machine. The existing 10/10 remote content-hash proof is distinct from a classroom-model proof. Until actual Node002 capacity + route + fresh classroom receipt are independently observed, report **REMOTE CLASSROOM EXECUTION UNVERIFIED**. The private Infinite Classroom pilot remains adult supervised. No Base44 requests, tools, hosting, or compatibility fallback.

## Evidence gates for a future unattended mission

- Release attestation for Node002 source and startup identity.
- Exact device fingerprint authorized on active broker; lease and route scoped.
- Fresh safe capability advertisement on Node002, with zero raw device secrets exposed.
- Narrow `readiness` then `synthetic_turn` proofs, stable request idempotency, lease release.
- Output QA independent of transport; parent controls before any child's real dialogue.
