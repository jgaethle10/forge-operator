# Systemia post-quantum communication lab (not production enabled)

The first opt-in prototype of quantum-resistant **recipient envelope encryption**. It does not change Evercraft Relay, Signal Fabric, browser notifications, existing keys or shipping receipts.

## Algorithms and scope

- NIST FIPS 203 ML-KEM-768 produces a fresh shared secret for each envelope.
- HKDF-SHA256 derives the AES-256-GCM key with a domain-separated, authenticated header.
- The header binds schema, algorithm, caller-supplied route context, recipient SPKI SHA-256 fingerprint, KEM ciphertext, salt and nonce to the ciphertext authentication tag.
- No plaintext fallback or classical cryptography substitution. Requires Node >=24.7 with ML-KEM available. Other runtimes throw a clear failure. Existing runtime services continue independently.
- **Confidentiality to the pinned recipient is not sender authenticity.** This prototype does not sign senders, prevent replay, distribute trusted public keys, revoke recipients, deliver through a network, or protect a compromised endpoint. No "unhackable" claim.

## Local verification (Node 24.7+)

```bash
node --test tests/pq-envelope.test.mjs
```

For an integration test, import `generatePqRecipient`, `encryptPqEnvelope` and `decryptPqEnvelope` from `systemia/crypto/pq-envelope.mjs`. The recipient's private key must never be serialized to a public surface; publish/pin only the authenticated public-key fingerprint. Never store test secrets in Git. Use a real trust registry, key lifecycle, anti-replay ledger, sender authentication and an audited transport before considering production.

## Migration gates

1. Inventory cryptographic key exchange and signatures in Relay, lineage, agents and customer interfaces; identify stored traffic requiring long-term confidentiality.
2. Confirm Node and OpenSSL versions on each *actual* runtime, especially Chromebook Node001 and Windows/WSL Node002, without assuming parity.
3. Independently review protocol, key custody, authentication, revocation, anti-replay, limits, downgrade resistance, and PII handling. Consider an approved hybrid key-establishment design before internet exposure.
4. Add canary-only end-to-end tests with authenticated recipients and synthetic payloads; prove tamper, replay, route and wrong-key rejection.
5. Gate gradual opt-in behind Systemia change approval; preserve rollback and receipt evidence. Never advertise QKD, quantum links or absolute security.

References: [NIST FIPS 203](https://csrc.nist.gov/pubs/fips/203/final), [NIST PQC migration](https://csrc.nist.gov/projects/post-quantum-cryptography), [Node.js crypto API](https://nodejs.org/api/crypto.html).
