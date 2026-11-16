# Evercraft OS | One operating environment: Home integration slice

This is an existing-service integration, not a second operating system or an agent launcher.

## What is implemented in this slice

- `/os.html`: a responsive first-party founder screen reachable from Home's existing navigation and the native OS app catalog.
- `GET /api/os/integration`: requires the existing Evercraft Home `home.read` Passport authorization in identity mode (or explicit loopback local development mode). Combines source-only OS boot/app contract status, source Journal receipt state, and continuity archive evidence through existing Home adapters. It does not invoke any mission, pay for work, connect to a provider, publish, or install applications.
- `os-integration-adapter.mjs`: single non-mutating, sanitized state contract for the 8-stage work-to-outcome lifecycle. Missing mission, worker, settlement, and delivery joins are **unknown**, not zero and never success.
- `os-integration.test.mjs`: unit and authenticated local Home HTTP assertions. Existing `Evercraft OS proofs` workflow also runs the test.

## States and boundaries

- `source_proven`: code/contract evidence only, not resident runtime or outside HTTPS.
- `source_present`: an archive is present but not independently restored.
- `held`: local/source requirement cannot be affirmed.
- `unknown`: no authoritative linked receipt provided for the stage.

The entire readback remains `held_pending_end_to_end_field_proof` even if local OS source preflight passes. No active agents, successful transactions, product delivery, mission authority or external uptime are inferred.

**Privacy:** This `home.read` surface must never include customer orders, amounts, sensitive job payloads, provider tokens or private execution receipts. The separate payments summary is governed by `home.payments.read`, and any customer-level evidence join requires a separately authorized, private server-side projection. The browser does not fetch or correlate hidden operator secrets.

## Verify

```sh
node --test systemia/evercraft-home/os-integration.test.mjs
node --test systemia/evercraft-home/os-status.test.mjs
```

Only a successful CI run on this branch proves this source-level test. It does not prove a resident OS rollout.

## Next vertical integration

Reuse Issue #1546 and existing Saban, Payments and Shipping implementation owners. Add a permission-scoped, canonical cross-system receipt reader joining:

`offer_key -> order_key -> provider receipt -> mission_key -> authorized attempt -> worker/QA receipt -> delivery receipt -> margin/refund`.

Every join must verify type, issuer, matching stable identifiers, freshness, replay/fencing semantics and independent authority before changing a stage to externally verified. Use controlled failure tests, then an owner-authorized physical-node and customer canary. Never give `home.read` access to private transactional data and never treat a future join as a trigger to spend/publish.
