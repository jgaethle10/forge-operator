# Systemia agent continuity | owned-only recovery gate

This is **not** a second swarm, a new agent roster, or a deployment. It restores
the missing control contract between the commissioned Raven Nexus role registry,
the existing Systemia mission authority, Saban formations and the two embedded
DNA protocols. Existing agent names, memory and lineage must be preserved.

## Historic evidence and count reconciliation

- August 12 executive organization audit: **15** original executive apps (14
  specialists plus Systemia), with Juniper and Sentinel **not** counted as agents.
- October 16/17 Raven Nexus audit: **22 active AgentRoleProfile records**,
  **14 active AgentLineup records**, and **two active AgentDNAProtocol records**
  (Juniper and Sentinel, each `counts_as_agent=false`).
- The reported "21 super agents" must be reconciled by **stable ID and
  commissioned role**, not fixed by overwriting the registry, subtracting
  Systemia or inventing a 22nd identity. The old audit did **not** export a
  trustworthy full list of stable IDs to this GitHub repository.
- Registered active is not equivalent to running. Do not claim 22 workers
  are executing.

## What this change enforces now

1. Systemia's **mission routing** declares commissioned-role registry evidence,
   Juniper memory preflight, Sentinel protective preflight, independently
   receipted dispatch, and Execution Gate requirements for assigned agents.
2. Sentinel and Juniper are never valid `assigned_agents` targets. Attempts to
   dispatch them as workers **hold** at mission route selection.
3. The independent read-only audit compares every stable role ID to a verified
   prior baseline, counts formations, checks embedded-protocol shape, refuses
   stale registry observations, and refuses claims of execution when independent
   verification callbacks are missing.
4. The audit rejects agent-run receipts lacking mission/role binding,
   authenticated origin, fresh timestamps, Juniper preflight **and writeback**,
   or Sentinel preflight. A JSON field saying `verified:true` does not count.
5. Neither route selection nor a green audit grants execution authority or
   starts workers. Systemia admission, Passport, exact Execution Gate leases,
   and real owned compute remain independent obligations.

## Next controlled operational migration step

A) **Export** the real commissioned `AgentRoleProfile`, `AgentDNAProtocol`,
and `AgentLineup` records from the authenticated current Raven Nexus
source, retaining immutable IDs. Do not query or restart the retired legacy
provider. If there is no owned export, mark `source_unavailable`, not
"zero agents". Preserve archives and any valid backup; do not overwrite.

B) **Reconcile** the 21-versus-22 question with stable-ID historical data:
original executives, new roles, retired aliases, and coordinator inclusion.
An exact array of original role IDs belongs in a privately controlled
`evercraft.agent-continuity.baseline.v1` source, not a guessed fixture.
Protect any private agent memory, customer details and signing secrets.

C) **Connect** an owned source adapter to the audit's `verifySnapshot`
callback, with independently validated signed identity and freshness.
Connect independently validated dispatch/worker receipts to
`verifyDispatch`. Do not implement these callbacks as
`() => true` outside synthetic tests. Never treat provider status strings
or heartbeat claims as authenticated live work.

D) **Wire** the same independently evaluated DNA proof into the actual
Raven Nexus/Saban pre-dispatch execution boundary, not merely the
Systemia route planner. Require memory read **before**, authorized writeback
**after**, and protective guard evidence for the exact mission/actor.
Fail closed on revoked authorization, missing evidence, stale identity,
unavailable verifier or replay. Reuse Systemia/Passport/Execution Gate;
do not introduce an independent authority or agent spawn service.

E) **Run owned canaries**: Starting Five, Truth Room, Verification Node,
Closing Five, then one safe real mission. Test missing specialist,
renamed/duplicated ID, stale receipt, replay, missing Juniper,
missing Sentinel, compromised worker self-certification, disconnect
and restart. Require independently observed provider/worker completion
before announcing all 22 operational.

F) **Deploy only after** CI, independent security review, mission
admission, explicit release authority and a signed Yard/Compute
deployment receipt. Leave Node002 shadow restrictions intact until
its separate enrollment is verified.

## How to run the read-only audit

```sh
node --test tests/agent-continuity-roster.test.mjs tests/agent-continuity-routing.test.mjs
node systemia/agent-continuity/continuity-gate.mjs \
  --snapshot /secure/path/current-owned-registry.json \
  --baseline /secure/path/verified-historical-ids.json
```

The CLI deliberately cannot authenticate local JSON: it reports
`held_unverified` until an owned verifier is integrated. This is safer than
manufacturing a ready status from exported text.

Expected input keys: `snapshot.source.observed_at` ISO timestamp,
`role_profiles[]` with `id/status`, `dna_protocols[]` with
`id/status/counts_as_agent`, `lineups[]` with `id/status/role_ids[]`,
`dispatch_receipts[]` with `role_id/mission_id/observed_at` and
`dna.juniper.{preflight,writeback}` plus `dna.sentinel.preflight`.
Baseline: `role_ids[]` containing real immutable IDs and minimum
historical role/lineup counts. The verifier must authenticate the
real source, not just compare this schema.

## Truth boundary

**Source fix delivered in this PR:** mandatory route declarations,
non-dispatchable DNA identity, independent continuity audit, regression tests.

**Not yet delivered:** signed real-time registry export, trusted verifier
adapters, live pre-dispatch enforcement at worker boundary, verified
all-roster liveness, live workloads, new compute authority or production
deployment. These are blockers to certification, not reasons to invent
new specialists.

## Raven commissioned work: proof-backed mode, no fabricated superagents

The owned Raven runtime distinguishes:

- `requested_team: "role_lenses"`: six useful analytic perspectives under a bounded private inference adapter. This **is not** proof that six commissioned AI agents, much less the original full roster, are executing. Home defaults to this honest mode.
- `requested_team: "commissioned"`: only admitted when a separately configured, independently signed authority chain names the exact immutable role IDs and maps the actual participating commissioned IDs to each selected Raven reviewer lane. This path defaults **held**, before inference, when no genuine proof source is configured.

The phased signed-proof implementation is:

1. `signed-evidence.mjs` verifies short-lived Ed25519 envelopes under **operator-pinned public keys** for `dispatch_preflight` and `dispatch_completion`; the request itself cannot supply a trust root.
2. A signed preflight must bind `request_id`, `mission_key`, `work_key`, exact commissioned role IDs, one-to-one `reviewer_assignments`, a roster hash, Passport and Execution Gate receipt refs, Juniper's **read-before-action** receipt, and Sentinel's protective guard receipt.
3. `owned-proof-source.mjs` can pick up the two signed envelopes from a private owned directory, and atomically claims each preflight nonce with an exclusive-create file, persisting replay defense across restarts.
4. Following inference, a **separate signed completion** must match the exact review-result hash and contain Juniper's **write-after-action** receipt. Missing writeback changes the response to `blocked`, never `completed`.
5. No provider inference is performed if the commissioned preflight is absent, stale, forged, replayed or identity-mismatched. No external actions are allowed in either mode.

### Local resident configuration (optional, fail closed)

```text
RAVEN_COMMISSIONED_EVIDENCE_DIR=/var/lib/evercraft/raven/commissioned-evidence
RAVEN_COMMISSIONED_TRUST_KEYS_FILE=/var/lib/evercraft/raven/commissioned-trust.json
```

The evidence directory and files must be owned by the service user and inaccessible to group/other users. Subdirectories `preflight/`, `completion/`, and `claimed/` are private. The preflight/completion filename is `sha256(request_id).json`. The trust file contains separate `dispatch_preflight` and `dispatch_completion` signer-key maps (`key_id` to Ed25519 PEM public key). **Never publish the private signing keys** or permit incoming request content to name proof-file paths. The independent signer, real roster exporter, live Juniper memory store and Sentinel adapter are **not yet connected**.

For example, an existing generic review request remains `role_lenses` and continues to be useful. A caller that sends `commissioned` will receive a bounded hold until the owned signer and exact role proofs are available.

### Acceptance and deployment truth

Tests use synthetic signing keys and artificial role IDs. Passing these tests proves validation behavior, **not** that real agents ran, that the signer exists in production, or that a service was deployed. No data is read from Base44. This PR remains draft pending P0 #1707's authenticated roster, real independent signer, safe live canary, release approval, and field receipts.

### Independent role-registry attestation

A commissioned preflight cannot now claim that an arbitrary list of IDs
constitutes Evercraft's actual specialist organization. Before inference,
`signed-roster.mjs` requires a fresh separately signed
`evercraft.agent-continuity.registry-snapshot.v1` payload from the **owned**
Raven Nexus registry authority. The signed payload contains:

- `source.system: evercraft-owned-raven-nexus`, a source receipt reference and
  a recent independent `source.observed_at` timestamp
- `role_profiles[]` with immutable unique role IDs, names, and active status
- `dna_protocols[]` with Juniper/Sentinel, both embedded and non-dispatchable
- `lineups[]` with only existing role IDs, never protocols

The preflight must carry the exact hash of the independently signed registry
envelope. Dispatch cannot consume its one-use nonce until the requested
identities are known active and the snapshot is authenticated. Registry and
dispatch evidence must use *different* pinned Ed25519 public keys.

The private resident now also expects:

```text
<evidence-dir>/registry/<sha256("snapshot")>.json
<trust-file>.registry_snapshot.<key_id> = independent registry authority PEM key
```

This is a **consumer contract** for an authenticated Evercraft-owned registry
exporter, not evidence that exporter is already deployed. A synthetic fixture
or handwritten registry file cannot substitute for the real source receipt and
the independently controlled signer. The live producer, key custody, source
receipt validation and field observation remain release blockers under #1707.

## Per-worker execution attestation

A commissioned reviewer is not established merely by an authenticated roster,
a signed preflight, a model prompt that names a role, or an inference-provider
receipt. The Raven completion path now requires one independently signed
`worker_execution` envelope **per reviewer** before synthesis. The envelope
must be signed by that commissioned role's pinned Ed25519 worker key, with its
own distinct public key, and bind:

- Immutable `agent_id`, exact reviewer lane, request ID, mission and work keys
- The claimed preflight ID and the immutable signed-roster digest
- The exact inference call ID, provider receipt and SHA-256 of returned text
- A completed Evercraft-owned commissioned-worker runtime class
- Nonempty worker run receipt reference and worker instance ID

The owned runtime reads these at
`<evidence-dir>/worker-execution/<sha256(request_id + ":" + reviewer_id)>.json`.
Private `trustKeysFile.worker_execution` maps role ID to its own pinned Ed25519
public key. Worker keys must differ from each other and the registry/dispatch
signing keys. No operator public signing keys or signed evidence can be supplied
by the inference request itself.

**Fail-closed behavior:** missing or mismatched independently authenticated
worker receipt holds the commissioned team before synthesis; fewer than all
required reviewer receipts cannot claim completed. Even successfully verified
participants do not prove that all original 21 or 22 roles are active.

**Runtime supply boundary:** this PR adds the *consumer and verifier*; it does
not create real worker private keys, launch the commissioned specialists, or
operate the separate trusted receipt writer. That must come from authenticated
owned compute under pre-existing Passport/Execution Gate authority, with
separate code-signing and runtime deployment review. No Base44 dependency.

## P0 owned canary transport and name-only roster reconciliation

Commissioned Raven work now **requires** an identity-addressed owned
`inferCommissioned()` transport, not ordinary `infer()` with an agent name
in the prompt. The optional owned HTTP gateway sends a bounded packet to
`POST /v1/commissioned/infer`, with `agent_id`, `reviewer_id`,
`mission_key`, `work_key`, `preflight_id` and `registry_snapshot_hash`.
There is no fallback to generic `/v1/infer` if this route is missing or
returns a hold. An exact, independently signed worker execution receipt is
**still mandatory** for each reviewer. The owner-controlled gateway endpoint
and actual commissioned worker runtime must be implemented and verified before
a real commissioned review can pass. These tests use synthetic transports.

An independent read-only archival census is available:

```sh
node systemia/agent-continuity/reconcile-owned-roster.mjs \
  --signed-roster /secure/evidence/registry/snapshot-signed.json \
  --trust-keys /secure/evidence/commissioned-trust.json
```

Both inputs must be private 0600 regular files owned by the caller; the trust
file pins the independent `registry_snapshot` public signing key. The
command never contacts a provider or launches a worker. It verifies the
signed, fresh owned registry snapshot before displaying identity leads and
**intentionally returns exit status 2**. The October 16/17 source audit named
19 candidates (Systemia, Raven, Lattice, Mnemosyne, Scribe, Talon, Sable,
Prometheus, Tempo, Forge, Vesper, Archimedes, Aster, Saban, Meridian, Oracle,
Sage, MAPLE and Haley) among 22 registered role profiles. Those names are
historical investigation leads, **not immutable ID proofs**, and the remaining
three historical identity names or IDs have not been independently recovered.
The founder's "21 superagents" remains unreconciled even if a later signed
current census has exactly 21 or 22 active role records.

Acceptance still requires an independently authenticated historical
**stable-ID baseline**, actual current owned registry evidence, production
worker identity/enrollment, Juniper and Sentinel receipts, and verified worker
runs. No legacy provider interaction or credential rotation occurs here.

## Owned receiver gate (P0, not production-enrolled)

The loopback Raven inference gateway now has an opt-in
`POST /v1/commissioned/infer` endpoint. **Default is held (HTTP 409)**
because the live `commissionedReceiver` is not configured. Generic
`/v1/infer` never serves a commissioned fallback.

`systemia/raven/commissioned-worker-receiver.mjs` provides the **receiver
verification contract**, not a deployed worker:

1. Authenticated HTTP bearer required by the existing loopback gateway;
   enforce exact commissioned request schema and no-side-effect limits.
2. Read signed preflight and registry from a separately trusted owned source,
   never evidence or keys supplied by the HTTP caller.
3. Verify pinned Ed25519 dispatch and independent roster signatures, freshness,
   immutable role ID, exact reviewer mapping, mission, work, roster digest,
   Juniper memory read and Sentinel protective guard evidence.
4. Independently verify *active* Passport and Execution Gate admission and
   worker enrollment through an owned authority callback; signed receipt
   reference strings alone do not grant authority.
5. Route exclusively through an enrolled `dispatchWorker` implementation,
   **not** the generic provider engine; verify the worker's separately pinned
   Ed25519 execution signature bound to the actual output and provider receipt.
6. Require a successful durable `persistWorkerProof` operation before
   releasing completed output for Raven's separate per-role verification and
   Juniper post-run memory writeback.

All four owned producer/admission/dispatcher/persistence adapters must be
supplied under production security review. No default callback, local worker
signer, key generator, or synthetic approval is installed for production.
The tests use generated temporary identities and no real deployment.

**Important runtime limitation:** current signed preflight receipts include
Passport/Execution Gate references, not a direct independently verifiable
lease payload. A real receiver's `authorizeLease` must authenticate the
underlying live issued lease and binding before indicating acceptance.
Production remains held until this independent integration is present.

## Durable private worker proof ledger

`createOwnedCommissionedWorkerProofStore` in
`systemia/agent-continuity/owned-proof-source.mjs` now supplies the exact
producer/consumer filesystem bridge for the commissioned receiver and Raven:

- `readEvidence({request})` reads signed preflight and independently signed
  registry evidence from existing private `preflight/` and `registry/` files.
- `persistWorkerProof({request,reviewerId,workerEvidence})` checks the pinned
  Ed25519 `worker_execution` signer itself before touching disk, then writes
  `worker-execution/<sha256(request_id + ":" + reviewer_id)>.json` using
  exclusive creation, owner-only `0600` permissions, and fsync.
- Duplicate request/reviewer receipt paths, wrong signer, altered evidence or
  unauthorized permissions are held. The existing
  `createOwnedCommissionedTeamGate` already reads this same exact filename
  and re-verifies the evidence independently.

The store also supplies `claimWorkerDispatch`, which atomically writes an
owner-only, fsynced `claimed-worker/<sha256(request_id + ":" + reviewer_id)>.json`
**before any worker compute**. It binds the claimed role and signed preflight
ID/roster digest. A retry after an interrupted or completed attempt is held,
including across service restarts. Clearing a claim to retry would require a
separately authorized recovery process with independently verified side-effect
state, not an automatic delete-and-run.

The store is a **private verified transport**, not a worker runner or signer.
There is no default `authorizeLease`, `dispatchWorker`, or live
production enrollment. Existing Node002 shadow restrictions remain unchanged.
A real owned provider must authorize an active exact-scope Passport/Execution
Gate lease and dispatch enrolled identity-bound workers before any completion
claim.

## Native Passport and Execution Gate admission verifier (read-only)

`systemia/raven/commissioned-lease-verifier.mjs` now exposes
`createOwnedCommissionedLeaseVerifier`. It is intended for the receiver's
`authorizeLease` dependency and consumes **existing**, current Evercraft
`EvercraftPassport` and `EvercraftExecutionGate` instances. It does not
mint permits, prepare/start leases, sign any proof or change remote execution.

The independent `resolveBinding` callback must look up a canonical,
owner-controlled mission record, **not copy fields from the HTTP request**.
It must yield the exact immutable agent/reviewer ID, preflight ID and signed
roster digest, mission and work key, inference request ID, SHA-256 of the
approved input, started lease ID, one-time permit ID, Gate request fingerprint,
actor, Passport product, scope, resource, specialist slug, and
`route_mode: "registered_internal"`. Missing/altered fields hold.

The adapter re-reads:
- `ExecutionGate.getLease(lease_id)`: state `started`,
  `dispatch_allowed=true`, exact trusted actor/product/scope/resource,
  request fingerprint, permit and route, plus recent start timestamp
- `Passport.getActionPermitState(permit_id)`: actually consumed and
  still backed by an active, unrevoked grant, correct actor/product/
  scope/resource and exact request fingerprint
- `Passport.authorize(...)`: fresh `allow` from the **same** grant
- A separately owned `verifyWorkerEnrollment` source: exact agent ID,
  fresh observation, worker instance ID and source receipt reference

**Receipt distinction discovered in native integration tests:** Passport
returns a consumption *record* hash while the Gate stores a distinct
consumption *acknowledgment* receipt hash. The signed preflight must bind
the Gate acknowledgment to `passport_receipt_ref`, which is compared to
the authoritative started lease. The Passport consumption record hash is
independently required to be present and valid; these two hashes must
not be incorrectly equated.

This is a local, owner-supplied dependency, not an automatically enabled
service. No live `resolveBinding`, `verifyWorkerEnrollment`,
`dispatchWorker`, or registered production leased worker has been
proven. The positive CI fixture writes actual Passport and Execution Gate
state into temporary owned test directories with synthetic grants, and is
**not** an authorized production mission or runtime receipt. Real live
commissioning still requires release approval, owned enrollment and
independent canary evidence under #1707.
