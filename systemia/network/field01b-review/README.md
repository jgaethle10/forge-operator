# Evercraft Network Field Test 01B review gate

**State: REVIEW_HELD. Deployment and physical continuity have NOT been proven.**

This is a **public-safe source-review metadata gate**, not the private Network Core. The public Forge repository must never become the private Core source of authority, per `systemia/core/YARD_HANDOFF.md`. The complete Core source, P03 test logs, and receipts remain in Evercraft-owned restricted custody.

The validator checks consistency of a declared source digest, local test counts, offline Yard fixture hold, absent authoritative receipts, and the v3 reachability rule: **any valid HTTP response from the configured core, including HTTP 401/403/404, proves that server is reachable**. Only a real transport failure, while the Infrastructure LAN is still available, may advance the controlled core-loss test.

Run:
```sh
node --test systemia/network/field01b-review/review-gate.test.mjs
node systemia/network/field01b-review/review-gate.mjs systemia/network/field01b-review/review-record.json
```

This gate **does not independently verify** the private ZIP's bytes, Systemia signatures, actual Compute attestation, Yard deployment, rollback, device APK, application-E2EE exchange, carrier service, or field-test evidence. CI success cannot authorize deployment or physical claims.

Source lineage: canonical RC12 plus review-held P02 (corroboration and expiry) and P03 (bounded HTTP parser). Current P03 SHA-256 is in `review-record.json`. Authenticated GitHub source control is an available engineering rail again, **not** a replacement for Systemia/Yard governance.

Required release path: Systemia admission → immutable owned source/release artifact → Yard release contract → approved Compute runtime → health/route/rollback verification → DeploymentReceipt → independent physical proof.
