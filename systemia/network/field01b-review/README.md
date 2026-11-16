# Evercraft Network Field Test 01B, public-safe review gate v2

**Status: REVIEW_HELD. No deployment. No physical continuity proof.**

This directory holds a small public **metadata-consistency checker**. It does not contain Network Core source, credentials, signing keys, device data, private topology, deployment authority, or a live route. The private Core's custody remains separate from Forge, per `systemia/core/YARD_HANDOFF.md`.

## What this gate checks

- The reviewed P03 artifact's *declared* SHA-256, size, candidate ID, and historical offline test totals are pinned in the validator rather than accepted just because the record says they passed.
- Record fields are strictly allowlisted, including nested claim and authority objects; extra `production_status` / `satellite_coverage` claims cause failure.
- Every deployment, Systemia-admission, Compute-execution, rollback, route, carrier, emergency, and physical-test claim stays false or absent as required. The Yard fixture must retain `compute_attestation_required`.
- Any valid HTTP response, including 401, 403 and 404, means the configured core is reachable. Core-unavailability requires an observed transport failure while the authorized Infrastructure LAN is still available.

Run from repo root:

```sh
node --test systemia/network/field01b-review/review-gate.test.mjs
node systemia/network/field01b-review/review-gate.mjs systemia/network/field01b-review/review-record.json
```

## Limits

**This is not signed attestation**. Because the checker and its pinned constants live in the same review PR, a coordinated edit to both remains possible; code review is required. The reported 106/106 owned-core and 172/172 Yard CI results come from prior offline evidence, not from CI on this public branch. This gate does not fetch private artifacts, verify Drive custody, cryptographic Systemia admission, Compute execution, Yard deployment receipts, or device-to-device transmissions. Successful public CI can never grant those authorities.

Before a real field test: recover the exact Android v3 APK and signer custody, obtain independent Systemia mission admission, eligible attested Compute lease, immutable Yard release, health/route/rollback evidence and DeploymentReceipt. Then separately gather two-device application-E2EE, disconnected-core while LAN persists, durable-carry and SHA-matched delivery receipts.

The review record is intentionally frozen to the P03 candidate. A successor candidate requires an explicit, independently reviewed digest and evidence update. **Do not merge or deploy solely because CI is green.**
