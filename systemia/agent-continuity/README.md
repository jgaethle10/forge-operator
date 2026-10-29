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
