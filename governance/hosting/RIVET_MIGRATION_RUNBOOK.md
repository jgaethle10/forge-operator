# RIVET Zero-Brand-Drift Migration Runbook

Status: **DORMANT UNTIL EXPLICIT PARTNER MIGRATION APPROVAL**

This runbook is intentionally non-executable in its current state. It defines the safe sequence so a future approval can be implemented without inventing the process under pressure.

## Phase 0 - Authorization

Required receipt:
- explicit partner decision selecting A, B, or C;
- named production owner;
- approved migration scope;
- statement that presentation/product behavior remains frozen unless separately approved.

If absent: **STOP**.

## Phase 1 - Canonical baseline capture

Capture the approved current environment using deterministic accounts and fixtures.

Required desktop viewports:
- 1440 x 1000
- 1280 x 900

Required mobile viewports:
- 390 x 844
- 360 x 800

Capture at minimum:
- initial page;
- navigation states;
- address/input forms;
- validation states;
- loading state;
- empty state;
- error state;
- successful report flow;
- preliminary report;
- full report where applicable;
- mobile navigation;
- any modal/drawer;
- animation start/end states where visual meaning changes.

Archive:
- PNGs;
- logo and image assets;
- font files by licensed source reference, not by copying unlicensed third-party binaries into a release;
- CSS/design token export;
- route map;
- interaction contract;
- report fixtures;
- source release SHA.

Set the fidelity manifest to `APPROVED_BASELINE_CAPTURED` only after a partner confirms the capture represents approved RIVET.

## Phase 2 - Isolated candidate

Rules:
- no inheritance from Evercraft global design tokens;
- no shared CSS namespace that can leak future Evercraft design changes into RIVET;
- no new public production route;
- no production DNS mutation;
- no report/schema change;
- no change to RIVET-visible session-data semantics.

Candidate must have a staging-only origin.

## Phase 3 - Automated parity

Run:
1. existing RIVET change-control test;
2. brand-fidelity proof;
3. capture candidate screenshots using the exact baseline browser/runtime version;
4. compare exact screenshot hashes;
5. compare viewport dimensions;
6. compare protected token map;
7. compare brand asset hashes;
8. compare interaction contract;
9. compare report fixtures and serialization;
10. run accessibility smoke checks without modifying presentation.

Any drift: **FAIL CLOSED**.

## Phase 4 - Staging comparison

Produce a two-column partner packet:
- current approved RIVET;
- staging candidate.

Include all captured states and both mobile/desktop.

Approval must be explicit. Silence is not approval.

## Phase 5 - Data and runtime readiness

Before DNS:
- create verified backup;
- restore backup into isolated environment and prove readability;
- reconcile latest AliEV/evidence snapshot if applicable;
- verify secrets are injected from approved secret storage;
- verify no secret is emitted in logs/receipts;
- verify health endpoint;
- verify external route;
- verify monitoring;
- verify alerts;
- verify audit/receipt path;
- load-test at an agreed multiplier over observed p95 traffic.

## Phase 6 - DNS preparation

- record current A/AAAA/CNAME values;
- record current TTL;
- record current TLS issuer/expiry;
- lower TTL in advance only if approved;
- prepare candidate target without switching;
- verify candidate TLS and host routing;
- preserve old origin in ready state through the rollback window.

## Phase 7 - Cutover

Required live receipts:
- timestamp;
- approved change ID;
- old DNS target;
- new DNS target;
- pre-cutover health;
- post-cutover external health;
- TLS verification;
- primary user flow verification;
- report generation verification;
- fidelity smoke capture.

CI success is not deployment proof. Internal health is not public-route proof.

## Phase 8 - Immediate rollback

Rollback triggers:
- fidelity drift;
- TLS failure;
- route failure;
- elevated 5xx;
- authentication failure;
- report generation failure;
- missing or corrupted source evidence;
- unexpected data behavior;
- partner-directed reversal.

Rollback action:
1. restore previous DNS/route target;
2. verify old origin externally;
3. freeze candidate writes if dual-write risk exists;
4. reconcile data written during cutover window;
5. issue rollback receipt;
6. open incident record;
7. do not retry automatically without a new readiness evaluation.

## Phase 9 - Post-cutover observation

Keep old origin available for the agreed rollback window.

Observe:
- uptime;
- latency;
- error rate;
- report completion rate;
- database saturation;
- storage;
- backup success;
- AliEV dependency health;
- visual smoke captures.

Only after the observation window may the old runtime be decommissioned, and only with partner approval if decommissioning affects ownership or recovery posture.

## RTO/RPO placeholders

These must be chosen by the partners before production migration:
- target RTO: **TBD**
- target RPO: **TBD**
- rollback observation window: **TBD**
- backup retention: **TBD**
- emergency operator(s): **TBD**

Unknown values block production cutover.
