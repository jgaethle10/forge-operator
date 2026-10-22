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
