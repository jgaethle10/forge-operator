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

## Synthetic Node001 / Node002 rehearsal (NOT a physical deployment)

CI's \`tests/pq-postgres-fixture/node-pair.test.mjs\` creates **ephemeral, independent** ML-KEM recipient and ML-DSA sender keys for two logical nodes. It uses two PostgreSQL connection pools pointed at a disposable single primary, and an independently pinned ephemeral root that signs a trusted sender registry.

The test exercises an authenticated encrypted message from synthetic node001 to node002, a reply from node002 to node001, duplicate rejection from a second pool, route substitution rejection, a new root-approved revocation of node001, rejection of a new old-key message both from a current registry and from an **unexpired stale registry**, continued delivery by node002, old-snapshot rollback denial, and plaintext denial when database access is interrupted. A unique trust-domain identifier keeps the rehearsal from modifying existing test authorities. The proof prints a machine-readable marker in the CI logs.

This is an integrated **software canary**, not evidence that actual node001 or node002 hardware has been reached, enrolled, upgraded or configured. Real field proof requires a reviewed root-enrollment ceremony; secured signer/recipient key custody; authorized test-only endpoints on each node; connection to a singular owned, authenticated replay authority; staged rollback; independent human verification of the resulting receipts; and explicit permission to deploy. Never ship private test keys or default to CI database credentials.

## Read-only field capability preflight (Node001 and Node002 not yet tested)

The script \`systemia/crypto/pq-field-preflight.mjs\` can run **on a node directly** without installation, network requests, key-file access, environment-variable access, service control or changes to live Relay routing. It prints JSON containing only runtime versions and capability results. No keys are serialized, generated keys from optional tests are ephemeral, and the result always says \`production_ready=false\`.

\`\`\`bash
# Observe Node/OpenSSL and whether ML-KEM APIs exist, without key generation:
node systemia/crypto/pq-field-preflight.mjs

# Optional isolated ephemeral ML-KEM/ML-DSA crypto self-test:
node systemia/crypto/pq-field-preflight.mjs --self-test --require-pq
\`\`\`

For Windows PowerShell, \`node .\\systemia\\crypto\\pq-field-preflight.mjs --self-test --require-pq\` works if the checkout is present and a supported Node runtime is available. The strict flag returns a nonzero exit code when runtime crypto prerequisites fail; it **does not** start Relay, reach a database, touch any production identity, or enroll the node.

This is only a host-readiness signal. Never infer that node001/node002 are healthy from a GitHub test runner; actual node results must come from their own execution. A production canary needs verified trust distribution, scoped service credentials, transport/network consent, safe failover, a separate human review and a rollback plan.

## Offline physical Node001 ⇄ Node002 courier rehearsal (not deployed)

`pq-offline-courier.mjs` provides a **manual file-transfer** rehearsal on the real Penguin and NextGen hosts, with no sockets, listening ports, production service changes, root enrollment, or live Relay integration. CI exercises the equivalent procedure on one test runner; **physical cross-host acceptance requires receipts from both hosts and does not exist until the operator runs it**.

The operator first updates each *isolated* `~/evercraft-pq-lab` checkout (`git pull --ff-only` while on the lab branch), and uses only the isolated Node 24 executable. The following commands are run separately on each computer:

```bash
# Penguin / Node001
cd "$HOME/evercraft-pq-lab" && git pull --ff-only
PQ_NODE="$HOME/.local/opt/evercraft-pq/node-v24.22.1-linux-x64/bin/node"
"$PQ_NODE" systemia/crypto/pq-offline-courier.mjs init --node node001 --dir "$HOME/evercraft-pq-courier-node001"

# NextGen / Node002 (in Ubuntu WSL, NOT Penguin)
cd "$HOME/evercraft-pq-lab" && git pull --ff-only
PQ_NODE="$HOME/.local/opt/evercraft-pq/node-v24.22.1-linux-x64/bin/node"
"$PQ_NODE" systemia/crypto/pq-offline-courier.mjs init --node node002 --dir "$HOME/evercraft-pq-courier-node002"
```

Each command creates a **new** mode-0700 lab directory with ephemeral, unencrypted, mode-0600 **PKCS8 private keys** and a public-only `public.json`. Neither private key is ever to be copied, uploaded, printed, or committed. The directory must be outside a Git checkout and unsynced. The tool refuses existing identity directories to avoid overwriting keys.

Before sending, transfer **only `public.json`** in each direction using an existing user-approved file-transfer method. Independently compare both printed `recipient_key_id` and `sender_key_id` (64-character SHA-256 fingerprints) from the receiving bundle against values observed on the originating physical host over a separately trusted channel. Merely reading a fingerprint from the transferred bundle is not independent authentication.

Once identities and fingerprints are compared, the sender issues a synthetic, signed and ML-KEM-encrypted 5-minute message (replace placeholders only with independently confirmed SHA-256 key IDs):

```bash
# Run on Penguin after copying NextGen's PUBLIC bundle to a local path:
"$PQ_NODE" systemia/crypto/pq-offline-courier.mjs send \
  --dir "$HOME/evercraft-pq-courier-node001" \
  --peer "$HOME/node002-public.json" \
  --expect-recipient-key "<NextGen recipient_key_id>"

# Transfer ONLY the returned outgoing_file (JSON ciphertext) to NextGen.
# Run on NextGen, within 5 minutes after encryption:
"$PQ_NODE" systemia/crypto/pq-offline-courier.mjs receive \
  --dir "$HOME/evercraft-pq-courier-node002" \
  --peer "$HOME/node001-public.json" \
  --expect-sender-key "<Penguin sender_key_id>" \
  --file "$HOME/incoming-courier-message.json"
```

Repeat in the reverse direction with each machine's identity, peer, and fingerprint roles swapped. An accepted receipt prints only fixed **synthetic plaintext**, sender/recipient IDs, a signer fingerprint and the scope `durable-on-this-recipient-only`. Attempting the same `receive` a second time must fail, because the recipient keeps its local SQLite replay ledger. The tool also rejects tampered signed messages, wrong routes, unpinned sender/recipient IDs, wrong algorithms and non-synthetic content.

**No live shared replay authority is used in this portable demonstration.** The SQLite ledger is only durable on each respective receiver. This manual proof is not trust-root enrollment, multi-node globally consistent replay prevention, instant revocation, secure key custody or permission to deploy. It does not provide a production-safe transport or revocation channel.

**Lab-key cleanup:** once field receipts are captured and the user no longer needs the rehearsal, remove the two temporary courier directories and any transferred bundles/message files manually. Never copy an unencrypted lab private key into a shared folder or a production node identity location. Do not claim that deletion guarantees secure media erasure.

## Reusing the owned Systemia outbound broker (lab adapter)

A direct hand-carried JSON transfer is not required **if both physical devices have their existing Evercraft Remote Operator broker sessions already authenticated and authorized**. The repository provides the control-plane path under \`systemia/network/outbound-capacity-broker.mjs\`, \`systemia/network/outbound-node-agent.mjs\`, \`systemia/compute/remote-operator.mjs\` and \`systemia/remote-operator/mcp-gateway.mjs\`. That first-party lane already sends encrypted, device-attested commands over **outbound-only** NodeSeed sessions.

\`pq-remote-operator-bridge.mjs\` is a **lab-only adapter** for the existing remote \`POST /v1/operator/fs/read\` and \`POST /v1/operator/fs/write\` routes. It is not a new public endpoint or a new broker. Its JavaScript functions \`bridgePqPublicBundle\` and \`bridgePqCiphertext\` accept two separately authorized \`RemoteOperatorGateway\`-compatible objects, an explicit sender/destination pair, separately witnessed exact key fingerprints and a scoped \`approvalRef\`. The caller supplies the grants through the existing authorized Systemia/Passport control flow; **nothing in this module issues, discovers, stores or prints credentials**.

- Public transfer reads only \`evercraft-pq-courier-node001/public.json\` or \`...node002/public.json\`, verifies the specified node ID, both public-key algorithms and both independently pinned SHA-256 public-key fingerprints, then writes \`evercraft-pq-inbox/node001-public.json\` or \`node002-public.json\` on the approved opposite node.
- Ciphertext transfer reads only an \`evercraft-pq-courier-<node>/message-<epoch>-<random>.json\` filename matching the courier's bounded output convention. It rejects arbitrary paths, wrong signed-envelope shapes, unexpected route names and mismatched sender/recipient key identifiers. It writes only the signed ciphertext, under \`evercraft-pq-inbox/<source>-message-...json\`.
- Every transfer is capped at 64 KiB, disallows destination overwrite, checks source content hash and write receipt, and rereads destination bytes to verify a matching hash. Failures deny rather than falling back to a USB copy or unprotected transport.
- The bridge does **not** open or authenticate the signed message. Receiving node must still locally run the already-tested offline courier \`receive\` with its own private key and pinned signer public key, which enforces signature, context, TTL and local replay prevention.
- The \`approval_ref\` string is an existing Remote Operator audit input **not** a substitute for actual Passport/Yard authorization. The caller must possess separate control grants for both exact devices. Do not manufacture arbitrary approval strings to bypass owner review.
- Do not widen Remote Operator's limited execution profile to allow \`node\`, \`bash\`, or arbitrary crypto scripts. No remote private-key read, remote key creation, remote execution or production route enabling is part of this PR.

**CI contract**: \`tests/pq-remote-operator-bridge.test.mjs\` starts two independent disposable real NodeSeed endpoints, two outbound agents and one authorized Evercraft broker, then tests wrong-pin denial, non-overwrite, forward/reverse public bundle transfer, forward/reverse signed encrypted payload delivery, destination-side actual decryption and persisted replay rejection. It proves that the **existing owned messaging code can carry the courier** in a controlled single-runner topology; it does not prove that the two physical users' machines are currently enrolled or reachable.

**Field gate before using this on Penguin/NextGen**: read each node's remote-operator readiness and broker authorization without revealing tokens, ensure both have a verified live control grant and outbound session, bind the separate pinned PQ fingerprints previously reported by their local operator, and obtain explicit approval for each file write. If either device lacks an authorized Remote Operator session, leave it disconnected and repair only with a separately approved Systemia/Passport enrollment process. The public Evercraft capability-directory plugin cannot itself execute this remote field transfer.

## Migration gates

1. Inventory cryptographic key exchange and signatures in Relay, lineage, agents and customer interfaces; identify stored traffic requiring long-term confidentiality.
2. Confirm Node and OpenSSL versions on each *actual* runtime, especially Chromebook Node001 and Windows/WSL Node002, without assuming parity.
3. Independently review protocol, key custody, authentication, revocation, anti-replay, limits, downgrade resistance, and PII handling. Consider an approved hybrid key-establishment design before internet exposure.
4. Add canary-only end-to-end tests with authenticated recipients and synthetic payloads; prove tamper, replay, route and wrong-key rejection.
5. Gate gradual opt-in behind Systemia change approval; preserve rollback and receipt evidence. Never advertise QKD, quantum links or absolute security.

References: [NIST FIPS 203](https://csrc.nist.gov/pubs/fips/203/final), [NIST PQC migration](https://csrc.nist.gov/projects/post-quantum-cryptography), [Node.js crypto API](https://nodejs.org/api/crypto.html).
