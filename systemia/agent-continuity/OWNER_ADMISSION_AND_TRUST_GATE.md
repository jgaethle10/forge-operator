# Black Box / Systemia owner admission and trust gate

As of 2026-10-17 this is an **evidence-backed engineering hold**, not a production installation or an admission receipt. Prepared under draft PR #1364 targeting parent PR #1291, with no change to live Systemia authorization.

## Existing canonical authorities (observed from connected Base44 source)

- Core Command Center app: `6aa059677743abfe5aa8710e`, `base44/functions/systemiaMissionGate/entry.ts`. Its `admit` operation is available only to an authenticated Base44 `admin`, requires a configured HMAC-signed bridge and an existing allowlisted mission. Its two currently allowlisted mission keys are `evercraft-ecosystem-loop-closure-v1` and `systemia-one-organism-orchestration-v1`.
- Canonical Collider/mission ledger app: `694612db777e391542fd0333`, `base44/functions/colliderOps/entry.ts`. The incoming signed Core issuer is separately scoped to exactly those two existing missions and `thread_admit/create_work`. The remote admission process has preflight, exact-state verification and a single-use thread egg. It does not accept an arbitrary new mission via the Core issuer's credentials.
- Continuity directive draft key: `founder-agent-continuity-megazord-20261016` in `FounderDirectiveDraft`, mission candidate `evercraft-agent-continuity-fabric-20261016`. Source observed at 2026-10-17 has state `awaiting_canonical_admission`, **no admission receipt**, and an intent of approximately 19,000 characters. Current Core `admit` only accepts `draft|held` and intent length 35..6,500. It is therefore **not eligible** for direct Core issuer admission, even when configured.
- At readback, the canonical MissionLedger had **no** `evercraft-agent-continuity-fabric-20261016` record. It had active entries for `raven-nexus-agent-watershed-v1`, `systemia-one-organism-orchestration-v1` and `evercraft-ecosystem-loop-closure-v1`. This does **not** resolve which is the right canonical lineage.

## Safe route to genuine admission

1. An authenticated owner/admin uses Systemia's canonical **read-before-write preflight**, explicitly resolving whether to reuse the existing Raven Nexus/Spider Society / One Organism lineage or whether a new mission is truly required. Do **not** silently choose a mission to make the bridge happy.
2. Preserve the full 19k character founder directive in its existing private `FounderDirectiveDraft` record. Author a **separate bounded integration request** (35..6,500 characters if using the current issuer), referencing the original directive key, its verified source/version digest when available, and the relevant GitHub PR+run receipts. It must not be a lossy overwrite or a false execution record.
3. If existing canonical mission is selected, use the currently authorized owner/admin fast-lane `thread_admit/create_work`, where the server internally applies read-before-write and consumes a single-use thread egg. Never present a manually written receipt or a GitHub CI token as Systemia admission.
4. The current Core issuer may only send to the two explicitly allowlisted missions. If preflight selects Raven Nexus or a new mission, **owner/security review** must first authorize the relevant service boundary and scoped policy. Do not widen HMAC issuer permissions from autonomous code or smuggle a different mission key.
5. Only on a successful authoritative server result containing a genuine `receipt_key`, `mission_key`, and `work_key`, reconcile the original draft with a real admission reference. Delivery, work execution and revenue outcomes require **separate** downstream provider receipts.
6. All ten continuity `PipelineEdge` rows remain `unverified` until corresponding real producer/transport/consumer independent verification exists. The historical events and lab hashes are inputs for preflight, not evidence of production service activation.

## Owner-controlled Black Box trust boundary

- Test-only `detached-receipt-chain.mjs` signs four linked role receipts in one ephemeral CI job. A second job downloads and verifies them. This is real GitHub artifact transfer but **not** an externally authorized signer.
- `owner-trust-preflight.mjs` requires both an independently supplied public trust registry **and** a separately pinned SHA-256 fingerprint. It rejects artifact-included signer keys as an implicit trust root and reports a hold if either external input is missing.
- The CI owner-trust step **intentionally clears all possible owner configuration** and proves `HELD_OWNER_TRUST_FINGERPRINT_NOT_CONFIGURED`; do not interpret the overall green CI gate as owner trust enrollment.
- If owner-managed security configuration is approved, store the independent trust manifest and digest in separately governed/protected control-plane sources, not in the downloaded artifact, PR source tree or the CI producer job itself. Retain issuer, scope, rotation and revocation evidence. An identical pinned lab key set proves only pinned signatures, **not** Passport identity, a live service, or operational authority.
- Production acceptance requires genuine Systemia admission, owner-provisioned and independently verifiable identity, a real signed source, authenticated network transport, live CHUM/Spider consumer ack, third-party external-effect readback if relevant, and explicit authority for any intervention. No automatic dispatch, trust-root edits or destructive response may be inferred from a passing test.

## Current disposition

`GOVERNANCE_HELD_NOT_PRODUCTION`. No service credential provisioned, no live Systemia gate call completed, no parent branch merge, no revenue or repair recovery certified. Document all root-cause evidence and request owner-authorized preflight rather than fabricating a canonical mission entry.
