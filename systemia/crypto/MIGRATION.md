# Evercraft Systemia: post-quantum crypto migration inventory (read-only)

Status: **source-discovery inventory, not a comprehensive security audit or deployed migration**.
Scope: repository `jgaethle10/forge-operator`, paths observed on the default branch on 2026-11-04. Do not disclose private keys or mutate production settings to collect evidence.

| Current trust/transport surface | Observed implementation | Quantum migration implication | Initial priority |
| --- | --- | --- | --- |
| `systemia/notification-fabric/web-push.mjs` | Standards Web Push / VAPID, P-256 crypto | Browser/provider protocols cannot be changed unilaterally. Do not claim PQ end-to-end Web Push. Encrypt sensitive application payloads above transport only after trust and key lifecycle are ready; otherwise send metadata-only notices. | P1 |
| `systemia/lineage/signatures.mjs` | Ed25519 attestations | Future quantum attacker may forge classical signatures. Preserve old verification/audit trail; design a separately versioned dual-signature migration that rejects unsupported critical assertions. | P1 |
| `systemia/compute/device-identity.mjs` | Persistent Ed25519 identity | Explicit device re-enrollment and hardware key custody are needed for PQ identities. Do not silently rotate existing device trust. | P1 |
| `systemia/saban/microseed-device-identity.mjs` | Ed25519 MicroSeed device signing | Multi-node upgrade must be staged per runtime and offline fallback policy. | P1 |
| `systemia/organism/goal-human-approval.mjs` | Ed25519 human-approval assertions | High-trust authorization must not accept attacker-provided keys. Plan dual-signature verification with independently pinned signers and explicit review. | P0 review |
| `infra/evercraft-edge/dns/signing.mjs` | Ed25519 signed zone snapshots | Future authenticity/integrity claims may require a new versioned signature scheme. | P2 |
| `systemia/notification-fabric/session-token.mjs` | HMAC-SHA256 scoped Relay sessions | Strong symmetric MACs are not the same migration urgency as vulnerable public-key exchange. Prioritize secret entropy/rotation and side-channel review, not unnecessary rewrites. | P2 |
| `systemia/notification-fabric/store.mjs` | HMAC-SHA256 when receipt secret configured, SHA-256 chain fallback without it | Require keyed receipts for production integrity; assess tamper evidence independently of PQ claims. | P1 |
| Public TLS/Node001/Node002 | Not verified by this inventory | Inspect actual OpenSSL/TLS cipher/key-exchange negotiation and runtime versions before calling the transport PQ-secure. | P0 discovery |

## Experimental implementation evidence

- `pq-envelope.mjs`: recipient-only ML-KEM-768 encryption envelope; Node 24 test gate. Not live.
- `pq-signed-envelope.mjs`: optional ML-DSA-65 sender signatures with independently pinned sender identity and an explicit replay guard. Not live.
- `createLabMemoryReplayGuard()` must **never** be used for multi-process or distributed replay prevention. Provide an atomic, durable, bounded, tamper-evident insert-if-absent store before production.

## Systemia admission gates

1. **Verified runtime inventory:** versions/ciphers and configuration from actual nodes, not repository assumptions.
2. **Independent recipient/sender trust registry:** enrollment, consent, rotation, revocation, hardware/secret custody; no accepted self-asserted key identities.
3. **Replay discipline:** atomic persistent uniqueness scoped to sender/key/route/nonce, multi-node concurrency tests and expiry retention with clock skew.
4. **Protocol audit:** independent cryptographic and threat-model review; stable cross-language envelope encoding; oversized-message handling; encryption/version negotiation cannot downgrade silently.
5. **Hybrid transition:** determine where classical + PQ signatures and key establishment need to coexist. Version signatures and validate both when policy demands both; don't silently bypass existing authorization.
6. **Canary proof:** synthetic messages across independently pinned nodes with receipt evidence, recovery behavior and measured resource overhead; no customer data.
7. **Change control:** staged opt-in, safe rollback, key compromise drill, audit trail and release authorization. Default off until every gate passes.

Important distinction: **ML-KEM does not replace authentication**, and **ML-DSA signatures do not provide confidentiality**. Neither replaces platform transport, access controls, endpoint security, or durable audit evidence. Strong security claims require attack testing, not slogans.
