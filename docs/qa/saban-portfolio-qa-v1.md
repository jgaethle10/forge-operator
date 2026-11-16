# Saban portfolio QA v1: real registered product regression workers

Status: draft branch, not a production deployment or physical hardware enrollment.

PORTFOLIO-QA-001 uses the existing Saban registered-worker pathway on an ephemeral loopback-only zero-cost NodeSeed in GitHub Actions. Four workers run actual Node test suites, not a simulated agent diagram:

| Worker | Product | Fixed test suites |
| --- | --- | --- |
| work_saban_checker | Work Saban | customer CSV accounting and public task planner |
| findmypart_checker | FindMyPart | recovery engine and safety scorecard |
| forensiscope_checker | ForensiScope | self-service admission and buyer discovery |
| research_checker | Evercraft Research | private compilation and evidence dossier |

The adapter accepts only these exact roles and test paths. Its child environment only includes basic non-secret process variables. No arbitrary shell input, external requests or customer data is authorized. It records case counts, outcomes, and hashes, not raw logs.

The mission leases Saban work for each role, invokes the registered adapter on NodeSeed, verifies worker receipt shape, proves idempotency on one role and asks separate NodeSeed content-hash workers to verify each result's SHA-256 digest. A missing worker, failing test or digest mismatch fails the mission. This is evidence-integrity checking, not independent security auditing.

Run on trusted checkout: node --test tests/saban-portfolio-qa.test.mjs tests/saban-qa-device-admission.test.mjs
Then: node systemia/saban/portfolio-qa-mission.mjs --out=/tmp/saban-portfolio-qa
GitHub CI archives the mission JSON artifact, including on a failed run.

## Physical Node001/Node002 gate

GitHub's temporary runner cannot reach or authenticate a private local device without a separately authorized route. This PR only provides read-only local admission assessment.

On each operator-owned machine, retrieve its own live /v1/capacity advertisement from its already configured loopback NodeSeed port, such as: curl -fsS http://127.0.0.1:42420/v1/capacity > /private/capacity.json. The port is an example, not a claim of the current machine configuration.

Use a node ID and fingerprint obtained from previously trusted inventory rather than taking the values from the untrusted advertisement itself. Operator-local check:

node scripts/saban-qa-device-admission.mjs --capacity=/private/capacity.json --node=YOUR_TRUSTED_NODE_ID --pin=PREVIOUSLY_TRUSTED_FINGERPRINT --operator-approved

Requires explicit operator confirmation, pinned fingerprint match, fresh advertisement, zero-cost, bearer-controlled leases, an operator-authorized placement label, attestation capability and both required registered workload classes. The most favorable state is candidate_for_private_pairing, NEVER authorized_to_execute or physically_verified. Actual hardware execution needs private authenticated transport, verified release code, a real lease and signed result evidence. Without them it stays HELD. Do not commit capacity data, fingerprints, tokens or private network addresses.

## Limits

Passage's iPhone/Safari compatibility is still a separate release gate under PR #1763. Four product subsystem QA checks are not proof of public uptime, payment settlement, supplier integration, customer delivery or security certification. No Base44, TinyFish, DigitalOcean or Opera runtime is needed.

## Operator-local signed NodeSeed QA (v1.1)

The portfolio QA CI mission remains ephemeral. A separate local-only runner now supports an already-running NodeSeed on the same trusted machine; this is not evidence that Node001 or Node002 ran in CI.

The runner refuses non-loopback URLs, unknown or mismatched node identities, stale capacity, non-zero-cost execution, missing workload support, and absent approval. It issues a fresh nonce to the existing NodeSeed signed attestation endpoint, verifies its Ed25519 signature against a previously trusted public-key fingerprint, checks signed workload inventory and labels, and takes no lease if validation fails.

On the actual operator machine, confirm the current trusted portfolio-qa code is installed into the NodeSeed runtime, note the actual loopback port, and obtain a previously trusted node fingerprint from independent inventory, not the same unauthenticated advertisement. Put the allocator token into a mode-0600 regular file. Never paste credentials into chat or commit them.

Read-only signed preflight:

    node scripts/saban-qa-local-node.mjs --endpoint=http://127.0.0.1:YOUR_PORT --node=YOUR_TRUSTED_ID --pin=YOUR_TRUSTED_FINGERPRINT --token-file=/private/token --operator-approved

Only after a positive preflight, a separate explicit local QA run:

    node scripts/saban-qa-local-node.mjs --endpoint=http://127.0.0.1:YOUR_PORT --node=YOUR_TRUSTED_ID --pin=YOUR_TRUSTED_FINGERPRINT --token-file=/private/token --operator-approved --execute --roles=work_saban_checker --out=/private/saban-qa-local-receipt.json

The operator-local command runs real registered worker leases and a separate registered content-hash check on that local NodeSeed. It does not upload results. Receipts are created mode 0600 and never overwritten. Hosted GitHub Actions is explicitly prohibited from using the CLI execution flag.

The result passed_local_qa_not_hardware_certified means the authenticated local software key holder returned the expected tests and receipts. It does NOT independently prove physical hardware identity, current running release SHA, trusted location, production readiness or native iPhone Safari. Device software keys may be copied. This release check remains a separate future gate.
