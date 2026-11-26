# Breath of Fresh Air × Kaidance | AirCore V0.1

**Status:** proposed source integration in draft PR, not a released product or physical prototype. Five-minute GitHub Actions runs are **best effort**, not a guaranteed systemd wake or admission of a physical Saban worker.

## Canonical route, no separate scheduler
```
KAIDANCE existing 300-second company heartbeat
  -> named aircore-development unpublished workstream
  -> Systemia source review (fixed mission + goal + work key)
  -> bounded Node AirCore calculation/test (on source change or hourly expiry)
  -> private source receipt + action queue + existing company mission snapshot
  -> next Systemia operator-review action
```

The runtime is `systemia/organism/kaidance-aircore-development.mjs`, wired **inside** `kaidance-company-heartbeat-runner.mjs` and the **existing** `.github/workflows/kaidance-frontier-field.yml`. The workflow's original `*/5` schedule is reused. No extra task, GitHub cron, cloud account, deployment, or customer service is created.

## Fixed identity
- Mission: `breath-of-fresh-air-aircore-v01`
- Goal: `prove-a-removable-filtration-core-before-refresh-table-integration`
- Lane: `aircore-development`; unpublished source-review workstream, intentionally **not** registered as a sellable public product
- Scope: recirculating particle filtration, **not** outdoor-air ventilation or certified room-air cleaning
- Existing engineering issue: #1696; original stale draft: #1697

## What a tick truthfully does
1. Read the exact allowlisted AirCore sizing source, test and preflight. Missing or symlinked inputs fail closed.
2. Calculate a stable fingerprint. Skip the run if the same heartbeat tick has already committed.
3. Run one 25-second-max local allowlisted Node proof **only** if enabled and source changed or last source proof aged one hour. No network access, AI text generation, purchase, cloud release or physical test.
4. Emit private `latest.json`, `queue.json`, `state.json` under `artifacts/kaidance-company-heartbeat/aircore-development/`. Save state last; proof receipts remain explicitly labeled source-only.
5. The company heartbeat incorporates its receipt and review candidate; the Systemia next-action selector can surface its held task. Repeated ticks carry the same work key until new evidence.
6. Current next task after passing source tests: obtain **two real vendor blower fan curves, real filter pressure-drop data, cost, sound and operating points**. Until then, G1-G6 remain held.

## Gate discipline
- G0: source/engineering arithmetic reviewed (source tests do **not** prove working physics).
- G1: real blower/filter curves and matched operating-point BOM.
- G2: owner-authorized safe low-voltage bench prototype.
- G3: actual airflow/pressure/noise/temperature measurements.
- G4: independent standardized particle CADR test, with no ventilation or air-quality health claims.
- G5: furniture structure, thermal, electrical, access and stability.
- G6: manufacturing/commercial approval; **separate explicit founder gate** for Thuma or other partner outreach.

## Checks
```bash
node --test systemia/breath-of-fresh-air/aircore-sizing.test.mjs tests/kaidance-aircore-development.test.mjs
# Local/manual check; this does NOT install a timer:
node systemia/organism/kaidance-company-heartbeat-runner.mjs \
 --out artifacts/kaidance-company-heartbeat --prove-worlds --prove-learning --prove-aircore
```

## Operational activation boundary
The **existing** company heartbeat CLI and GitHub Actions path are wired in source. An active scheduled run must be independently observed after merge, and the NextGen/Penguin resident supervisor must be on an authorized pinned release and return genuine consecutive tick receipts before claiming owned-compute execution. The same workflow needs proper persisted private state/caching. Do not interpret a source PR or a passing source proof as live hardware development or Saban physical-work dispatch.
