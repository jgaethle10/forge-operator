# The Window / Mossmere: observable agent decisions v1
**Status: isolated source draft.** This is NOT publicly deployed and does not claim live LLM autonomy.

## Goal
Expose real, separately obtained agent decisions based on individual perceptions, enforce actual resource and relationship consequences, and let spectators inspect attributable outcomes. Never prewrite the story or call the current rule-based town an LLM-agent society.

## Existing authority
- The public Mossmere page still uses deterministic browser replay.
- The independent canonical GitHub heartbeat is also rule-based and release_status=held.
- Preserve its current state on window-society-state/state/window.json; do not modify or reset it.
- Reuse existing spectator PR #1435, experimental server PR #1245, writer-security PR #1469 instead of reimplementing those workstreams.
- No Base44 dependencies, real-world actions, model spending, publication, machine enrollment, or new hosting.

## Experimental source added
The module systemia/society/window-agent-boundary.mjs introduces:
1. Resident-private observation: self, local peers, own recent history, local resources, and invitations addressed to that resident. Other residents' memories never enter an observation.
2. Structured decision envelope: one action linked to the exact world hash and observation digest. Actions: wait, move, work, offer help, accept or refuse help, or share bounded fictional coins.
3. World-owned enforcement: validate energy, co-location, authorized invitation, inventory and resources; apply on a clone only after admission. Refused/failed actions leave input state untouched.
4. Source custody: sandbox fixtures explicitly labeled fixture. Production requires a registered Ed25519 adapter signing key and matching proof over the exact decision, observation, provider request ID and timestamp. This signature does NOT independently prove a model call or intelligence.
5. Spectator-safe action/outcome receipts: event and decision hashes, source classification, no private observations, model reasoning, provider credentials or unrelated customer data.

Testing:
- node --test tests/window-agent-boundary.test.mjs
- node --test tests/window-heartbeat.test.mjs

## Next release gates
1. An operator-approved model provider adapter with true authenticated provider request and response receipts, bounded tokens/time/cost, user-approved spending and meaningful error/timeout behavior.
2. A controlled comparison between genuine model decisions and rule-based baseline, scored on choice diversity, conflict, refusal, scarcity, relationship saturation and repeat-project pathologies.
3. A single-writer durable world+decision journal, safe restart, per-agent identity and cooldowns, old-observation replay refusal, and Systemia admission.
4. Connection to the existing canonical viewer PR #1435 with visibly distinct evidence states. Never animate fabricated catch-up when the independent heartbeat is stale.
5. Security audit PR #1469, branch protection, 24-hour unattended endurance, independent two-device observation, and explicit founder release approval.

This branch only builds a fail-closed decision gateway and tests. It has not called an LLM, activated a node, incurred provider fees or moved a production workflow.

## Operator-only model bridge (added after the first boundary slice)
`systemia/society/window-model-bridge.mjs` can request one choice through an **injected** `providerClient.infer` interface, but has no API key, network client, executable task runner, default model or automatic heartbeat wiring. It refuses to invoke an inference client unless a separately operated `budgetGate.reserve` returns a current, provider-and-model-matched reservation with a maximum token count and micro-USD cap. The gate must be a real authenticated persistent service when deployed; the unit-test in-memory gate is not production authorization.

The bridge sends a scoped resident observation under explicit untrusted-data instructions, accepts only one JSON action, rejects invalid provider/mode/request identifiers, checks reported usage against the reserved limits, signs an adapter custody envelope, asks the existing world validator to apply consequences, and reconciles the reservation before returning a **held** world candidate. Reconciliation or action-validation failures cannot produce a world update. A network/provider charge may still occur on an errored call, so a failed reservation must remain auditable rather than silently refunded.

**Trust statement:** signed adapter custody and an adapter-reported request ID are *not* independent proof of genuine model inference. `provider_evidence_state=adapter_reported_not_independently_verified`, `release_status=held_not_live`, no public production claims. The model bridge's live rollout additionally requires separately validated provider receipts, an operator-approved signing key, a durable reservation/reconciliation backend, and a single-writer journal. Its new tests exercise provider-denial, spoofing, token overspend, resource rejection, replay and prompt-injection action refusal using an intentionally synthetic stub, not a real model.

Local focused command (subject to CI verification):
```bash
node --test tests/window-agent-boundary.test.mjs tests/window-model-bridge.test.mjs tests/window-heartbeat.test.mjs
```

## Local-only durable decision journal (October 23)
The new `systemia/society/window-local-journal.mjs` provides a **held experimental state file**, separate from the real Mossmere GitHub state branch. Initialization is explicit and refuses to erase a previous sandbox. A local directory lock elects exactly one writer; an abandoned lock requires human inspection, not an unsafe automatic takeover. Model decisions are only requested inside that lock after verifying the prior snapshot. Accepted actions are atomically persisted to a new JSON snapshot after fsync and renamed into place, with a one-to-one sequential receipt hash chain and no automatic archive after 1,024 actions.

The observer projection returns an allowlist of town/agent public facts and a sanitized decision trail, excluding personal memory and provider request identifiers. Neither hashes nor this local sandbox prove independently verified model inference; the attested adapter is currently a contract exercised against a synthetic test client. A checksum detects ordinary corruption but does not protect against a writer who can maliciously rewrite the entire local file. Production hardening would require a separately held signing identity and external verification.

To validate locally, using the read-only CI:
```bash
node --test tests/window-agent-boundary.test.mjs tests/window-model-bridge.test.mjs tests/window-local-journal.test.mjs tests/window-heartbeat.test.mjs
```
The local journal is **not deployed**, no autonomous model run is scheduled, and the public visitor's world is unchanged. Use explicit approved provider credentials and an independently persistent budget reservation service before live inference.
