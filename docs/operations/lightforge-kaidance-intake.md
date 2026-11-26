# LightForge x KAIDANCE | Consumer beta development intake

Status: **review-only source integration; not an active developer or customer launch**.

LightForge is currently an **unpublished** product. Its RC07 native app is a locally built, unsigned Windows x64 engineering candidate. No source, binary, household photo, personal audio or private tester data is placed in the public repository by this intake.

The existing five-minute `kaidance-company-heartbeat` reader observes `registry/kaidance-lightforge-development.v1.json` and records a LightForge review candidate in its existing private heartbeat queue. It does not create another scheduler, deploy the app, start a development worker, manipulate lights, authorize Stripe, or publish an offer.

The first candidate is `lightforge:gate:canonical-source`. Every listed release gate is `unverified`. This static manifest is a **source hypothesis**, not runtime acceptance evidence. It is intentionally unable to declare a green release on its own; independent physical/Windows/beta receipts and a separately approved release gate must be built before changing the contract.

Desired consumer flow: **download → connect compatible lights → choose show → play**.

## Honest boundaries

- Until reviewed source integration is merged and its heartbeat executes, Kaidance has not observed this lane.
- Even after merge, CI observation is not confirmation of an activated owned resident on Penguin/NextGen or of an actual development worker.
- Source review and signed release authorization remain separate; do not project private test details to the public Kaidance observatory.
- A successful simulated WLED preflight is **not** proof of physical-controller safety.
- The RC07 local Windows build must be smoke-tested on a real Windows host and real low-voltage WLED setup.

Test: `node --test tests/lightforge-development-intake.test.mjs tests/kaidance-company-heartbeat.test.mjs tests/kaidance-next-action.test.mjs`.

## Next engineering contract

Admit the private source to an owned canonical location, then create a named, bounded Saban development adapter with stable goal/work/dedupe keys, explicit source commits and costs, controlled branch-only edits, tests, and independent receipts. Require human release approval; an ordinary heartbeat must never count an unexecuted task as customer value.
