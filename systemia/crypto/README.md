# Systemia post-quantum communication lab (not production enabled)

The first opt-in prototype of quantum-resistant **recipient envelope encryption**. It does not change Evercraft Relay, Signal Fabric, browser notifications, existing keys or shipping receipts.

## Algorithms and scope

- NIST FIPS 203 ML-KEM-768 produces a fresh shared secret for each envelope.
- HKDF-SHA256 derives the AES-256-GCM key with a domain-separated, authenticated header.
- The header binds schema, algorithm, caller-supplied route context, recipient SPKI SHA-256 fingerprint, KEM ciphertext, salt and nonce to the ciphertext authentication tag.
- No plaintext fallback or classical cryptography substitution. Requires Node >=24.7 with ML-KEM available. Other runtimes throw a clear failure. Existing runtime services continue independently.
- **Confidentiality to the pinned recipient is not sender authenticity.** The base envelope alone does not authenticate senders or prevent replay. The separate signed lab adds these checks but does not distribute trusted public keys, revoke recipients, deliver through a network, or protect a compromised endpoint. No "unhackable" claim.

## Local verification (Node 24.7+)

```bash
node --test tests/pq-envelope.test.mjs tests/pq-signed-envelope.test.mjs tests/pq-replay-sqlite.test.mjs tests/pq-replay-postgres.test.mjs tests/pq-pinned-signers.test.mjs
```

For an integration test, import `generatePqRecipient`, `encryptPqEnvelope` and `decryptPqEnvelope` from `systemia/crypto/pq-envelope.mjs`. The recipient's private key must never be serialized to a public surface; publish/pin only the authenticated public-key fingerprint. Never store test secrets in Git. Use a real trust registry, key lifecycle, anti-replay ledger, sender authentication and an audited transport before considering production.


## Sender-authenticated lab wrapper

`pq-signed-envelope.mjs` adds **ML-DSA-65 signatures (NIST FIPS 204)** covering the entire encrypted envelope and its sender ID, sender public-key fingerprint, issuance/expiry timestamps and 192-bit random nonce. The recipient *must* be supplied with the independently pinned sender public key and expected sender identity; accepting a sender key embedded in the message would defeat authentication.

`openSignedPqMessage` checks a maximum 300-second TTL, 30-second clock skew, exact expected sender/route, ML-DSA signature, ML-KEM ciphertext integrity and an explicit replay guard. The included memory replay guard rejects duplicates and fails closed at capacity **only for single-process tests**. It is not a distributed guarantee. The PostgreSQL lab adapter below exercises shared admission; production still requires vetted key enrollment/rotation/revocation, cross-language canonical encoding, and independent cryptography review.

Cryptographic authentication does **not** prove delivery, user consent, human acknowledgement or endpoint safety. The signed wrapper is neither attached to notifications nor enabled for live users.


## Durable local replay proof (still not production)

`pq-replay-sqlite.mjs` implements the signed wrapper's `consume()` contract with a persistent SQLite file using WAL, FULL synchronous writes, `BEGIN IMMEDIATE`, a unique SHA-256 tuple key, capacity limits, and expiry cleanup. Two processes sharing the **same local file** cannot admit the same tuple twice. The test suite verifies this concurrent admission behavior, persistence over restart, expiry pruning and rejection of a replayed, signed ML-DSA message after a restart.

Its guarantee has important limits:
- **One host only.** Separate Node001/Node002 databases can independently accept the same replay. A remote/shared transactional database with a global unique constraint is required before multi-node operation.
- Operators must keep the SQLite file, WAL/SHM and directory private and durable; it is not encrypted at rest. Losing or restoring an old database snapshot can re-admit old messages until their expiration, and disaster recovery needs an explicit policy.
- A trusted server clock is required. Long clock drift, deliberate rollback and bad timestamps are not solved here.
- Saturation or inaccessible/corrupt storage returns denial, never a memory fallback.
- `node:sqlite` API and filesystem behavior must be evaluated against each supported Node/runtime version; the CI tests run on Node 24.
- This is not integrated with live customer traffic, Relay, or node enrollment.


## Shared replay authority lab: PostgreSQL (not deployed)

`pq-replay-postgres.mjs` uses a PostgreSQL `INSERT ... ON CONFLICT DO NOTHING RETURNING` with a unique digest key, so clients connected to **the same authoritative writer** cannot both admit the same message nonce. The SQL also rejects expired admissions using the **database clock**. No in-memory, SQLite, read-only replica or alternate endpoint fallback is permitted when admission fails.

- Apply `sql/postgres-replay-v1.sql` manually to an isolated, operator-owned test PostgreSQL database. Do not apply schema changes to production without reviewing them.
- Inject a PostgreSQL-compatible authenticated `client.query(sql,params)` object into `createSharedPostgresReplayGuard({client})`. The library deliberately contains no credentials or embedded driver.
- Call `openSignedPqMessageAsync` with the shared guard. **Only after the asynchronous database INSERT is confirmed** will that function release plaintext.
- `tests/pq-postgres-fixture/` includes an isolated `pg` driver and tests using real PostgreSQL on CI, including concurrent independent processes, simulated two-node pools, signed-message replay, database outage denial, and authoritative-clock rejection.
- A single PostgreSQL primary is the global replay authority. **Do not** point nodes at separate databases or independently writable partitions. Replicas used for read-back do not establish replay uniqueness.
- A failover can lose acknowledged inserts if replication is asynchronous; require proof of no acknowledged write loss, durable backups and restore protections before production. Network partitions must cause message rejection.
- Monitor unbounded insert volume, rate-limits, table growth, backup/retention, database permissions, TLS, audit access, and denial-of-service. Set a vetted expiry cleanup policy using DB clock and an operational retention buffer. Expiry cleanup does not substitute for enforcing signed TTL.
- These CI clients are simulated workers on GitHub infrastructure, **not a field test proving Node001 and Node002 are connected**. The shared cluster, key trust registry, and actual edge routing remain unprovisioned.


## Explicit signer pins and revocation gating (lab)

`pq-pinned-signers.mjs` adds `createPinnedPqSignerRegistry`, an immutable signer-key mapping that does **not** trust public keys in inbound messages. Every entry explicitly binds sender ID, SHA-256 fingerprint of a ML-DSA-65 public key, active/revoked status and validity timestamps. Snapshots are valid for **15 minutes maximum**, after which resolution fails closed. During an approved rotation, old keys may be marked revoked while new, independently vetted keys are pinned. `openPinnedPqMessageAsync` resolves the expected sender from the registry before verifying signatures and awaiting shared replay admission.

**Important:** this module does NOT authenticate, enroll, authorize or distribute a snapshot. That is a separate Systemia control-plane obligation. A forged snapshot passed by a compromised caller defeats the entire registry. An old cached snapshot may still authorize a since-revoked key until its short expiry. No instant revocation can be claimed until a genuinely authenticated, promptly refreshed distribution system and key custody are proven. Loss of refresh causes message rejection, not auto-trust or a fail-open cache.

## ML-DSA root-signed trust snapshots and rollback prevention (lab only)

\`pq-trust-snapshot.mjs\` adds an explicit root-authorized trust manifest. Each manifest contains an authority domain, a strictly increasing integer revision, a root-key fingerprint, a short validity window (maximum 15 minutes) and the complete allow/revoke list of ML-DSA-65 sender keys. Root signatures authenticate the exact canonicalized manifest. The verifier receives the root public key and expected authority **out-of-band**, checks each sender fingerprint and time window, then calls a mandatory shared revision guard before returning any trusted registry.

\`pq-trust-revision-postgres.mjs\` and \`sql/postgres-trust-highwater-v1.sql\` form an isolated laboratory high-water service. A single PostgreSQL primary atomically accepts a larger revision, reaccepts the **same revision only if its digest matches**, and rejects older revisions or conflicting same-revision content. A database outage returns a denial. CI tests cover invalid roots, edited status, expiry, authority mismatch, rotation, revocation, revision downgrade, split same-revision content and a real PostgreSQL shared writer.

**Boundaries that remain unresolved:**
- The root private key must be handled offline or by a properly approved hardware/key-management system. **Do not commit or export production root keys to source, CI or browser code.** Only ephemeral CI keys are used by tests.
- This code does not decide who may approve key enrollment or revocation, distribute snapshots securely, establish a hardware trust anchor, or rotate a compromised root. All require an independent Systemia authorization ceremony and evidence.
- Existing already-loaded snapshots can authorize a revoked sender **until their expiration**; this is bounded staleness, not instant revocation. To provide stronger guarantees, actively invalidate cached registries and require a live high-water check before each message or implement a justified revocation watch.
- Rollback protection depends on never restoring an older PostgreSQL high-water record and never permitting multiple independent primaries. An unsafe failover or compromised database authority can defeat the monotonicity proof. Use fail-closed behavior on partitions, and review synchronous replication/failover before deployment.
- Snapshot JSON is canonically serialized by this Node-specific lab implementation. A production cross-language protocol needs independent verification, bounded parsing, version negotiation, signature-domain separation and security review.
- A signed registry is not an authorization policy by itself. Systemia must bind its approval decision, tenant/domain and permitted roles to the trust ceremony. No production keys or users have been enrolled.

## Atomic current-trust + replay admission (strict lab path)

A verified trust registry can become **stale before its 15-minute expiry** if the root approves a newer revision that revokes an agent. The earlier \`openPinnedPqMessageAsync\` checks the snapshot's signature-derived key map, but alone does not recheck whether its revision is current.

\`pq-current-trust-replay.mjs\` closes this specific admission gap for the PostgreSQL lab. It accepts only an import produced by \`importSignedPqTrustSnapshot\` (branded in this process after root signature verification), and uses one PostgreSQL statement to:

1. Lock the current authority's high-water row \`FOR SHARE\` and require the **exact revision and digest** of the authenticated snapshot.
2. Require the **database clock** to fall inside that snapshot's signed validity window and the message's expiration window.
3. Insert the nonce into the unique, shared replay ledger with \`ON CONFLICT DO NOTHING\`.
4. Return plaintext only if **exactly one committed nonce admission** is confirmed. An expired, stale, replayed or unverified message is rejected; database/network failure also rejects.

The row lock serializes admission with trust-revision updates on a single authoritative writer. This establishes trust freshness **at the instant of database admission**, not a promise that future revocations undo already-delivered plaintext. It does not replace trusted key enrollment, offline root custody, a hybrid/PQ protocol review, real node deployment, or proven safe PostgreSQL failover.

CI exercises a signed old message before revocation, rotates the trust revision to revoke its signer, and then attempts a **new unused** old-key message through a previously loaded registry. The latter must be denied even though the old snapshot is still within its TTL. It additionally verifies current-key admission, replay denial, forged import denial, and database outage/uncertain acknowledgment denial.

The strict production candidate is \`openCurrentTrustPqMessageAsync\`; the earlier \`openPinnedPqMessageAsync\` remains for isolated legacy lab tests and **MUST NOT** be wired into a revocation-sensitive live route.

## Migration gates

1. Inventory cryptographic key exchange and signatures in Relay, lineage, agents and customer interfaces; identify stored traffic requiring long-term confidentiality.
2. Confirm Node and OpenSSL versions on each *actual* runtime, especially Chromebook Node001 and Windows/WSL Node002, without assuming parity.
3. Independently review protocol, key custody, authentication, revocation, anti-replay, limits, downgrade resistance, and PII handling. Consider an approved hybrid key-establishment design before internet exposure.
4. Add canary-only end-to-end tests with authenticated recipients and synthetic payloads; prove tamper, replay, route and wrong-key rejection.
5. Gate gradual opt-in behind Systemia change approval; preserve rollback and receipt evidence. Never advertise QKD, quantum links or absolute security.

References: [NIST FIPS 203](https://csrc.nist.gov/pubs/fips/203/final), [NIST PQC migration](https://csrc.nist.gov/projects/post-quantum-cryptography), [Node.js crypto API](https://nodejs.org/api/crypto.html).
