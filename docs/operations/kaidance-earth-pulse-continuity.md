# Earth Pulse ↔ Kaidance: one canonical 300-second heartbeat

Status: source integration candidate, **not deployed or independently resident-verified**.

## Authority and identities

- Company clock: existing Systemia Core resident `kaidance-company-heartbeat`, target 300 seconds.
- Canonical research continuity and privacy rule: [#1426](https://github.com/jgaethle10/forge-operator/issues/1426), merged integration [#2588](https://github.com/jgaethle10/forge-operator/pull/2588).
- Earth Pulse research code: draft [#2115](https://github.com/jgaethle10/forge-operator/pull/2115).
- Field pilot release gate: [#2179](https://github.com/jgaethle10/forge-operator/issues/2179).
- Owner-private R&D exporter: `systemia/organism/kaidance-rd-continuity.mjs` (already exists, opt-in, no new scheduler).

Earth Pulse is a **public-safe project name**, but contributor media, precise geotags, site-to-gauge associations, unreviewed findings, Systemia mission details, raw research records and owner configuration remain **private**.

## New source-only integration

The company lanes registry contains one `earth-pulse` `observe_existing_workflows` lane. No new service, timer, provider, GitHub Actions schedule, queue daemon, or research worker is introduced. The existing company heartbeat runner calls a bounded source readback only **once per new tick**:

- `source_not_in_checkout`: the three draft PR source files are absent. Hold; review #2115.
- `held_invalid_source`: a file is malformed/symlinked/oversized/inaccessible. Hold.
- `source_present_not_runtime_verified`: all three expected files are in this particular checkout; their bytes are fingerprinted. **This is not execution or admission.**

The report has explicit `mission_admission_verified:false`, `researcher_execution_verified:false`, `field_data_validated:false`, `public_release_authorized:false`, and `worker_dispatched:false`. Every tick emits one stable **review-only** candidate with key `earth-pulse:kaidance-research-continuity`, `execution_authorized:false`, and no automatic alerts. This makes Earth Pulse visible in the portfolio clock without inflating actual research progress.

The existing R&D reconciliation remains the **sole** path for verifying an admitted Earth Pulse mission. Do not create a second exporter, queue, or mission ledger.

## Remaining owner-runtime gates

1. Merge/review Earth Pulse source PR #2115 only after its own CI, privacy, and research review gates; merge this heartbeat integration PR after tests and owner review.
2. On the authorized Evercraft-owned resident, verify the deployed source SHA, real Systemia Core service and **single** 300-second scheduler using the existing [owned resident readback contract](kaidance-owned-resident-readback.md). Do not activate or restart services based on a GitHub green badge.
3. Systemia must resolve Earth Pulse's canonical mission identity and existing work history. Only Systemia may mark the mission admitted and set owner, priority, bounded next action, due time, receipt SLA, dependencies, budget, and disposition. Proposed work must not be counted as admitted.
4. Existing private canonical exporter must include the admitted Earth Pulse row in the full all-R&D snapshot. This export must remain in owner-private mode-0600 state; enable the existing `SYSTEMIA_KAIDANCE_RD_CONTINUITY_ENABLED` option through authorized private configuration, not a public commit. A missing or incomplete export is **HOLD**.
5. Prove three successive real resident cycles and independent actual Earth Pulse research receipts. Distinguish source review, checked, dispatched, executed, verified. A test pass, fingerprint, or receipt from unrelated research cannot satisfy Earth Pulse's actual work criterion.
6. Only after #2179's independent site, consent, validation, human review and release gates can any public scientific finding or visualization be published.

## Next bounded desk-only research action (not auto-authorized)

Reconcile #2115, #2179 and adjacent Evercraft Earth #1589 / Watershed Intelligence #1949. Identify one independently reviewable, consent-safe repeat-photo pilot study; verify any USGS station-to-photo context mapping before presentation. Preserve gaps and source dates, and require an authenticated Systemia work lease for any actual run.

## Tests and negative controls

`node --test tests/kaidance-earth-pulse-source.test.mjs tests/kaidance-company-heartbeat.test.mjs tests/kaidance-rd-continuity.test.mjs`

The tests fail closed on absent/partial/symlinked sources and verify one heartbeat candidate, duplicate-tick idempotence and no implicit execution. Existing private R&D tests cover missing exports, stale receipts, duplicate missions, paused work and privacy. GitHub CI is an offline source proof, **not evidence of five-minute resident liveness**.

Never introduce a second timer to compensate for a missing owned-runtime readback. Escalate to #1426 instead.
