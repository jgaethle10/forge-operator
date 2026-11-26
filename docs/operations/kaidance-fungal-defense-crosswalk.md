# FUNGAL-DEFENSE-001 → existing Kaidance R&D heartbeat

**State (2026-11-25):** Source crosswalk and offline acceptance fixtures only. **Not** proof of private Systemia admission, a deployed resident worker, ongoing research, source ingestion or public publication.

## Canonical identities and ownership

- Original workstream: [issue #1834](https://github.com/jgaethle10/forge-operator/issues/1834), [draft research PR #1908](https://github.com/jgaethle10/forge-operator/pull/1908), branch `research/fungal-defense-001`.
- Existing R&D mission-continuity control plane: [issue #1426](https://github.com/jgaethle10/forge-operator/issues/1426), [continuity predecessor PR #2588 (closed; adapter is present on main)](https://github.com/jgaethle10/forge-operator/pull/2588), the live source on `main` with this Fungal-specific review branch.
- Safe, non-authoritative [Fungal source handoff](https://github.com/jgaethle10/forge-operator/blob/research/fungal-defense-001/research/fungal-defense-001/kaidance-research-handoff.v1.json), validated by `research/fungal-defense-001/tools/check_kaidance_handoff.py` on the separate research branch.
- Source handoff's project key `FUNGAL-DEFENSE-001` is **not automatically a private Mission Ledger identifier**. The Systemia owner must reconcile existing private admitted work before an identity or owner is placed in the authoritative export. The bridge may show `no_admitted_rows_unverified` until then. Do not fabricate an admission or a goal checkpoint.

## Exact heartbeat binding

Reuse **one** existing company heartbeat `systemia/organism/kaidance-company-heartbeat-runner.mjs` and the opt-in **private read-only** R&D adapter in this PR. The owner configures `SYSTEMIA_KAIDANCE_RD_CONTINUITY_ENABLED=true` on the **existing** Systemia service only after schema/provenance validation. Do not create a second cron, Actions schedule, timer, workflow, supervisor or mission ledger.

A privately authorized Systemia exporter must provide a complete owner-only `evercraft.systemia.rd-continuity-export.v1` at the existing sibling directory `kaidance-rd-continuity/mission-export.json`, owned by the service user, 0600, with a private 0700 parent. Use the existing real admitted mission identity in `priority_mission_ids` **only if** the private registry says it is admitted. This priority list also keeps the previously admitted private Plasma Hearth and other R&D missions visible. The complete export cannot consist solely of Fungal Defense.

For the actual admitted normalized mission, provide the adapter's documented fields: `mission_id`, `admission_state`, `disposition`, `owner`, `receipt_sla_seconds`, `next_action.description`, `next_action.due_at`, `last_work_receipt.ref`, `last_work_receipt.observed_at` and, when available, an explicit `goal_binding` to the **existing** durable `evercraft.goal.state.v1` task checkpoint. The receipt must be an actual completed research artifact from that mission; a public GitHub source file, schedule tick, unexecuted CLI, failed CI, or the source handoff JSON is **not** a completed-work receipt.

### Every 300-second existing tick

1. Reconcile the current complete admitted R&D export including Fungal Defense, if actually admitted; distinguish `not configured`, `held`, `review required` and `reported receipts reconciled`.
2. Check only the available authoritative mission state, next bounded action, source-version date, next due/source review, evidence receipt and receipt SLA. The existing generic adapter checks identity/priority and matches any owner-provided `goal_binding` against completed existing goal state. It does **not** independently certify the science.
3. If absent, stale, unverified, duplicate, explicitly paused or blocked, preserve the exact private state and escalate through Systemia's existing decision queue. **No false green, no automatic activation, no repeated publication.**
4. If a qualified source review or offline validation is due, nominate work through the existing authorized lease and compute capacity mechanism. **Do not fetch CDC/WHO, run all Python tests, build or modify the observatory every 300 seconds.** Source review is bounded (initial proposed lower-frequency review is weekly, subject to owner SLO), and a valid `unchanged official source` receipt is a check, not new scientific progress.
5. Preserve all source versions and distinctions: CDC 2016–2025 revised annual `C. auris` clinical cases; archived historical 2016–2024 tracking snapshot; corrected CDC MMWR analytic series; and separately defined provisional 2026 weekly notifications. New CDC evidence needs human provenance review before the published dashboard changes.
6. Keep private mission export, checkpoint, source review notes and owner decisions entirely out of shared company JSON, CI logs, Harbor and public observatory output.

## Safety and runtime boundaries

This stream is desk research and public-health **evidence verification**, not a live clinical application. No patient/facility identification, reconstruction of suppressed small cells, clinical advice, individual risk scoring, unverified outbreak warnings, automated publishing or pathogen experiments. Physical/laboratory operations require a separate qualified safety review and explicit authorization. No external app runtime, paid compute or new scheduling provider. Remain inside owned infrastructure and original Systemia authority.

## Acceptance checklist (none may be assumed from tests)

- [x] Source-level Fungal Defense handoff packet, without invented private Mission Ledger ID.
- [x] Six synthetic integration checks in `tests/kaidance-fungal-defense-continuity.test.mjs` added to the **existing** Kaidance frontier workflow; they cover nonadmission, stale/missing work, five-minute rechecks without progress, goal receipt mismatch, deliberate pause and duplicate identity.
- [ ] Relevant CI executes the new test suite successfully (not a resident tick).
- [ ] Source PR #1908 and R&D successor PR #2588 merged/reconciled without losing the current main, with safety review; no duplicate runtime.
- [ ] Systemia owner confirms whether Fungal Defense already has an admitted private mission ID, owner and goal checkpoint; submits a complete authoritative private export or truthfully records a blocked candidate.
- [ ] Existing Systemia supervisor installed SHA and exactly one active resident company heartbeat independently verified.
- [ ] **Three successive real** 300-second company ticks on an owned node show Fungal Defense admitted/checked or an explicit `UNKNOWN`/hold with an owner and next action; existing private evidence stays private.
- [ ] Independent reproducible work receipt or explicitly `NO_EXECUTION_RECEIPT`; source check not falsely claimed as new discovery.
- [ ] Scientific, privacy, security and accessibility approval before any public-health publication; current `release-gates.json` remains blocked.

Use [the existing owner-readback checklist](https://github.com/jgaethle10/forge-operator/blob/main/docs/operations/kaidance-owned-resident-readback.md) for actual node observations. No synthetic test, repository commit or automated workflow substitutes for an authenticated deployed-node receipt.
