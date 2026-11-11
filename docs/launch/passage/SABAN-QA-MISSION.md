# Passage QA: registered Saban worker mission PASSAGE-QA-001

**Engineering status:** authorized, bounded CI execution proof. Not a public release or physical-device test.

This mission uses the preexisting Saban multiplier contract registry and genuine NodeSeed lease/job APIs. It starts a loopback-only, zero-cost NodeSeed on a GitHub Actions runner, requests Saban multiplier-assignment leases, dispatches five registered Passage QA assignments, and verifies each worker actual Node test result. Test commands are selected by an exact role allowlist, never from worker input.

| Registered worker | Actual Node test suite |
| --- | --- |
| catalog_auditor | Passage catalog/library tests |
| signature_auditor | Ed25519 signed-package tests |
| device_auditor | Offline device-kit and device-crypto tests |
| browser_auditor | Chrome online, mobile emulation and offline tests |
| regression_reviewer | Independent repeat of package and device-kit suites |

All roles must produce positive test counts, zero failed cases and a zero exit status. The coordinator demonstrates Saban assignment idempotency on the signature role, then sends each sanitized worker result to a separate registered NodeSeed content-hash workload, comparing its SHA-256 to a local recomputation. This is deterministic integrity checking, NOT an independent security audit.

**Execution:** After installing the browser test dependency, run node systemia/passage/saban-qa-mission.mjs --out=/tmp/passage-saban-qa. The local result is mission.json: worker outcomes, tested suites, counts, digest, idempotency and evidence-verification receipts. Any mismatch or missing proof fails the mission. GitHub Actions archives the report including on failure.

**Authority and privacy:** No arbitrary command execution, public deployment, external browser access, private user data, paid capacity, or automatic merge. Browser suites can use their local loopback test server. This runs Saban on temporary GitHub CI capacity, NOT the real Node001 Chromebook or Node002 NextGen. Five deterministic specialist roles are not five distinct LLMs. A green result is not a physical-device test, publisher authenticity or production security certification.

**Still required:** physical iOS/Android trials, investigation of WebKit Ed25519 incompatibility, independent security and rights review. Do not turn mobile emulation or the Safari-like negative safety check into claims of iPhone support.
