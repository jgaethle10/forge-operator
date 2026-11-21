# Evercraft Compute Cell | source-only evidence review

A small, source-only gate aligning the existing Systemia, Fabric, NodeSeed, and Node002 commissioning tracks. Not a new scheduler, orchestrator, hardware controller, public endpoint, installer, or permission grant.

The canonical Node002 authenticated broker commissioning track is [issue #1332](https://github.com/jgaethle10/forge-operator/issues/1332); the fixed-purpose HP inventory adapter remains [draft #1299](https://github.com/jgaethle10/forge-operator/pull/1299). This reviewer does not bypass either.

Run locally against an explicit PRIVATE, sanitized input:

    node systemia/compute/compute-cell-readiness.mjs --input /private/compute-cell-observation.json

Input schema: evercraft.compute-cell.observation.v1.

- "gates" is an object keyed by all seven strings exported as GATES by the module.
- Each gate contains "state" ("pass" or "fail"), "receipt_ref" ("sha256:" followed by 64 hex digits), and "observed_at" (UTC timestamp).
- "worker" may contain "mode" ("shadow" or "admitted") and boolean "remote_jobs_enabled".
- Do not place passwords, device keys, customer data, or private host identifiers in the input.
- Output deliberately omits any unrecognized fields and never echoes receipt hashes.

Seven syntactically valid, fresh, caller-reported references are not cryptographically verified evidence. They can only produce SOURCE_REVIEW_CANDIDATE, with execution_authorized:false and production_ready:false. Actual signatures, custody, live identity, Systemia admission, exact device permit, revocation, safety and operator review are independent requirements.

HELD exits 1, invalid input exits 2, and source-review candidate exits 0. Exit 0 never means execution is authorized or production is ready.

Offline tests:

    node --test systemia/compute/compute-cell-readiness.test.mjs

No production mutation, remote calls or resident service changes. Node002 remains shadow until the separately authorized commissioning path is actually verified. Never set remote_jobs_enabled to true just to satisfy this reviewer.
