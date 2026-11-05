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
node --test tests/pq-envelope.test.mjs tests/pq-signed-envelope.test.mjs tests/pq-replay-sqlite.test.mjs tests/pq-replay-postgres.test.mjs
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

## Migration gates

1. Inventory cryptographic key exchange and signatures in Relay, lineage, agents and customer interfaces; identify stored traffic requiring long-term confidentiality.
2. Confirm Node and OpenSSL versions on each *actual* runtime, especially Chromebook Node001 and Windows/WSL Node002, without assuming parity.
3. Independently review protocol, key custody, authentication, revocation, anti-replay, limits, downgrade resistance, and PII handling. Consider an approved hybrid key-establishment design before internet exposure.
4. Add canary-only end-to-end tests with authenticated recipients and synthetic payloads; prove tamper, replay, route and wrong-key rejection.
5. Gate gradual opt-in behind Systemia change approval; preserve rollback and receipt evidence. Never advertise QKD, quantum links or absolute security.

References: [NIST FIPS 203](https://csrc.nist.gov/pubs/fips/203/final), [NIST PQC migration](https://csrc.nist.gov/projects/post-quantum-cryptography), [Node.js crypto API](https://nodejs.org/api/crypto.html).
