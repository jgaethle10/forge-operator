# KAIDANCE: one-company heartbeat bridge (300 seconds)

**Status: source implementation and test gates only until a real scheduled run and owned resident receipt are observed.**

## Why this exists
Kaidance's pulse is the company clock, not an independent fleet of cron jobs. Systemia is the mission authority, Saban supplies admitted execution capacity, and each specialist owns its delivery/proof contract. The product catalog and resident service configuration already exist; this bridge connects their truthful inventory to the existing Kaidance mission-fabric snapshot shape.

## What the first lane actually does
The existing `kaidance-frontier-field.yml` five-minute GitHub Actions schedule runs the company bridge before the existing frontier cycle. It:
1. Reads the canonical 69-item public product catalog (count may change), all configured resident service bindings and explicitly declared company lanes.
2. Discovers workflow-manifest file counts without treating source files as running services.
3. Identifies products with no named responsible lane and emits an **unexecuted** adapter-admission queue. A product is observed, **not automatically assigned a running worker**.
4. Fingerprints bounded Worlds source files. When code changes or the last proof ages beyond 60 minutes, an explicitly enabled, bounded Node source-proof adapter runs existing Worlds tests and records pass/fail. The code is never silently rewritten or deployed by that QA step.
5. Writes `latest.json`, `queue.json`, `state.json` and a true `evercraft.kaidance.mission-snapshot.v1` to the configured private/CI output directory. A same-five-minute duplicate exits without minting new progress.
6. Adds that optional mission snapshot to the existing Kaidance frontier cycle's *same* run, rather than constructing a replacement collider.

The bridge deliberately reports `code_changes:0`, `autonomous_development_workers_launched:0` and `counts.admitted:0` until actual dispatch and independently checked progress exist. A source test pass is not a feature, production release, sales outcome or verified human-facing improvement.

## Deployment path and scheduler accuracy
- The existing GitHub `*/5` cron is best effort. Delay, skip, cancellation, rate limits and backlog are possible. Do not advertise a guaranteed 300-second production wake from GitHub Actions.
- The existing **Systemia Core Resident Supervisor** now has an optional `kaidance-company-heartbeat` cycle service, cadence 300. It is **inactive until the owner provisions `SYSTEMIA_COMPANY_HEARTBEAT_OUT_DIR` and redeploys** the reviewed supervisor on admitted Evercraft-owned Compute. That directory must be private, durable and writable by the service user, not the read-only source checkout. No service restart, deployment, lease or public pulse was performed in this PR.
- The resident Kaidance mission publisher must be explicitly configured to ingest the same private snapshot root. The committed optional `systemia/collider/mission-sources.json` path is a source/default staging reference; a different private resident output location requires a matching private config before activation.
- The current `public/kaidance` observatory is a separately authorized projection. Do not project company-private receipts, worker state or customer information into it without the signed/revocable publication gate.
- Example local source proof (does not start a scheduler):
  `node systemia/organism/kaidance-company-heartbeat-runner.mjs --out artifacts/kaidance-company-heartbeat --prove-worlds`
- Unit tests:
  `node --test tests/kaidance-company-heartbeat.test.mjs`

## Kennedy quality + independent EV opportunity review (2026-11-25 source bridge)

- The existing 300-second company pulse accepts an **optional private, mode-0600** `SYSTEMIA_KENNEDY_QUALITY_RECEIPT_FILE` containing an `evercraft.kennedy.quality-proof.v1` receipt. The new read-only validator rejects stale (older than 15 minutes), invalid, tampered and unauthorized receipts; it writes a stable, Systemia-review-only `kennedy:visual-quality-readback` queue candidate and never starts engineering or publication.
- The Kennedy producer is **not yet live**. The open `#2312` KSS studio and `#2370` quality recovery must be made to emit a real authorized private test/render/visual-review receipt, with source commit, license/synthetic distinction, rendered page QA, provenance and gaps. A receipt hash alone is integrity, **not** independent visual or source-rights proof. Until the actual producer, resident deployment and separate QA receipts are observed, Kennedy is **not** autonomously improving every five minutes.
- Quality progression must be real: source-backed/georeferenced licensed imagery; accurate source-to-page registration; two readable S-0/A-0 sheets; north/scale only when justified; clean labels, no clipping; full-page phone-friendly previews; visually reviewed 3D/Worlds progress when separately implemented. Synthetic raster/diagram CI does **not** establish the historical product benchmark, finished engineering, or commercial readiness.
- The existing worldwide official World Bank scout now additionally recognizes **public EV charging infrastructure notices** for review under the `aliev` offer key, while preserving unknown deadlines, buyer eligibility, payment and commercialization states. The notice classification is an **independent market research signal**, not permission to use held AliEV/RIVET assets, contact former partners, claim customers, or bid.
- All product opportunities still share the **same** existing Kaidance report, private Systemia review queue, next-action reconciler and Revenue/Interaction Ledger. No new scheduler, shadow CRM or outreach agent. The World Bank feed remains a bounded **six-hour source refresh** inside the five-minute heartbeat. Worldwide procurement from one official source is **not** coverage of every market; add independently vetted, license-appropriate adapters by sector/region without repeated scraping or unapproved email.
- Read-only checks: `node --test tests/kaidance-kennedy-quality-review.test.mjs tests/kaidance-global-opportunity-scout.test.mjs tests/kaidance-company-heartbeat.test.mjs`. Actual owner-resident activation still requires the deployment/readback gates in `docs/operations/kaidance-owned-resident-readback.md` and issue `#2573`; the Kennedy proof emitter needs separate admission before it can be called connected end to end.

## Next engineering phase: real continuous development
A company-wide loop should not indiscriminately execute all projects every 300 seconds. Each cycle should reconcile one canonical goal ledger and dispatch a bounded number of **fresh, dependency-ready** work leases. Implement with existing Systemia durable goal dispatcher and Saban capacity/admission, not a new privileged agent platform.

Required before enabling any new autonomous code-building adapter:
- Stable `mission_key / goal_key / work_key / dedupe_key`; owner, product, result criterion and explicit input evidence.
- Fresh source/release checks, memory preflight, dependency gating, maximum active work, CPU/token/time budgets and retry limits.
- Named adapter exists, side effects declared and a durable lease checkpoint saved **before** executing. No replays of uncertain remote effects.
- Changes occur on isolated branches with tests and reviewable PRs. Never allow a raw model output to directly rewrite `main`, publish, spend, email, access private customer data, or alter security authority.
- Reconcile independently verified execution receipts back into the one Systemia goal and then into the next Kaidance heartbeat. Idle or failed jobs must **not** count as progress.
- Product onboarding should include **unpublished research and internal projects**, not just the public 69-product index. The current coverage count is explicitly a **partial company inventory**, not proof all Evercraft work is connected.

Target: a heartbeat that knows what changed, which job moved, what actually shipped and what needs a next bounded action, without an ungoverned five-minute churn machine.
