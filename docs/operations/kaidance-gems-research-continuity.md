# Kaidance / Systemia | DOE GEMS R&D continuity (source-only admission)

**Status: review-branch implementation, not a live deployed or independently verified owner-private R&D runtime.** The founder explicitly directed that DOE GEMS / GeoDAWN research belong to the existing Kaidance/Systemia five-minute R&D heartbeat. Reuse the company clock and the existing `science-research` lane. Do **not** create another scheduler, Mission Gateway, worker, R&D database, external monitor, training loop, or competition submission.

## Canonical authority and evidence

- Research source / GEMS-001 through 008E: existing draft [PR #2259](https://github.com/jgaethle10/forge-operator/pull/2259), branch `research/gems-systemia-bridge-20261118`, research commit `fae48adc188d2a2d28e12a5b540453dfe64aceb4`.
- Durable research continuity / status: existing [issue #2260](https://github.com/jgaethle10/forge-operator/issues/2260), latest handoff comment [#7203927404](https://github.com/jgaethle10/forge-operator/issues/2260#issuecomment-7203927404).
- **Selected** GEMS-001 submission **#330339**, organizer public DTI **0.0552** (previously reported; *not refreshed by this adapter*). GEMS-002 #330456 was not selected.
- GEMS-007 frozen southern negative-bin quota remains impossible under the preserved 5-required/0-eligible condition. Do not change bins or call the experiment failed.
- GEMS-008B/C/D/E explored source GIS and transport/provenance. No genuinely independent new-fault validation source is qualified. GEMS-008E older NGDS ActiveFault is not equivalent to the OneGeology 1:24,000 service or the Petrified Spring 2020 original map.
- Penguin received the owner-private frozen-plan handoff, verified its SHA-256, fetched pinned commit, ran 5/5 offline tests and **attempted** the authorized HTTPS capture. The capture **FAILED** and logged `capture.stderr.log` / `attempted.once` in owner-private local state. The exact network error has **not** been read in this conversation. No real NBMG feature response, import, source distribution or source independence is proven. **Do not automatically clear `attempted.once` or retry.**

The static, non-sensitive project registry `registry/kaidance-gems-research-continuity.v1.json` references *existing* public issue/PR and records only the confirmed no-execution statuses. It does **not** contain the private frozen URL plan, geographic envelope, source PDFs, organizer rasters, private mapping samples, browser captures, credentials, client files or private block logs. GitHub branch source alone is not a current scientist's receipt.

## What the single company clock actually does after reviewed merge/deploy

The existing `systemia/organism/kaidance-company-heartbeat-runner.mjs` invokes `reviewGemsResearchSource` exactly once on each **newly admitted** five-minute company tick, alongside the existing `runPrivateResearchContinuity`. It emits:
- `gems_research` in the ordinary private/CI company `latest.json`: registry fingerprint, source-only provenance, three held workstreams, previous reported selected DTI, and unequivocal no-execution fields;
- One stable `science-research` Systemia-review queue candidate `gems:008e:review-capture-error`, priority **3**, action `inspect_authorized_private_penguin_capture_stderr_before_any_retry`, `retry_authorized:false`, `network_authorized:false`, `execution_authorized:false`;
- The existing mission snapshot's source refs and one additional scanned source. The three GEMS historical blockers remain in the GEMS-specific `held_workstreams` count; they do **not** inflate the company-wide actionable `counts.held` contract. No heartbeat counts the block as completed scientific progress and no extra `changed` count is synthesized.

A duplicate five-minute tick writes no new progress; running without the registry or with tampering shows an explicit fail-closed `held_source` state. The manifest and adapter are intentionally read-only. They **do not** contact NBMG or DrivenData, read a private log, submit model artifacts, modify selected entries, automatically create work leases, run experiments, change code or interfere with FindMyPart/revenue P0.

The existing private **all-R&D** bridge `kaidance-rd-continuity.mjs` remains separately opt-in behind `SYSTEMIA_KAIDANCE_RD_CONTINUITY_ENABLED`. It requires a genuine authenticated, complete owner-private `all_rd` export and verified goal checkpoints. **This source-only GEMS view is not a substitute.** Actual GEMS research execution remains behind Intake Fabric, Passport, Execution Gate and the existing durable goal ledger. Owner-authorized external request is a distinct privilege from source-only heartbeat inventory.

## Work needed before declaring active

1. **CI proof:** Run `node --test tests/kaidance-gems-research-continuity.test.mjs tests/kaidance-company-heartbeat.test.mjs tests/kaidance-rd-continuity.test.mjs` on this isolated draft branch. The existing `kaidance-frontier-field.yml` PR workflow has the new test included in its existing heartbeat guard. Do not create a new workflow or cron.
2. **Conflict review:** Rebase or cherry-pick into the current Kaidance company source through the existing single-engineering ownership process; protect active FindMyPart revenue work and other current resident releases. Do not modify the live shared Git checkout or force-merge.
3. **Owner-private receipt diagnostic:** On Penguin, inspect the **existing** blocked `gems008e-nbmg-private/capture.stderr.log` using a redacted, read-only diagnostic. Decide the cause before requesting a new attempt; if infrastructure/TLS/schema fails, keep the blocker and log actual facts to #2260 without private URLs.
4. **Source-to-resident readback:** After a separately reviewed merge and existing Systemia resident release, verify two fresh actual Kaidance ticks include `gems_research.status=source_registered_review_required` and exactly one GEMS queue key, with `execution_authorized:false`, `submission_made:false`, `scientific_artifacts_created:0`. A successful GitHub PR test or working branch alone does not prove production activation.
5. **Private research exporter:** When a trusted Systemia all-R&D export producer exists, bind the **same** GEMS mission ID and existing actual goal receipt, not a second ledger. Do not mark `coverage_verified:true` or scientific artefacts verified without independent readback.

**No external email, paid compute, new model training, new scored entry, no GEMS-007 quota modification and no automatic NBMG retries are authorized by this change.**
