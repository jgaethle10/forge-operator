# Recipient Access Preflight | Evercraft Shipping

## Why this exists
The fact that an artifact was built, archived in Drive, rendered locally or accepted by an email draft is **not** proof that the intended recipient can open it. Source bundles are also not a substitute for a readable customer preview.

The Shipping Department already owns package materialization, provider idempotency and sent-copy readback. This module adds an independent **pre-send recipient-openability boundary** to the existing chain. It is not a parallel Shipping system.

## Source and evidence
- `recipient-access-gate.mjs`: pure verification of a signed, frozen recipient-access manifest for **external** Shipping releases.
- `recipient-access-gate.test.mjs`: regression tests for restricted links, stale/tampered attestations, ZIP-only presentations, missing provider attachment hashes and wrong-recipient claims.
- `npm run test:shipping`: includes both existing Shipping tests and new recipient-access tests.

The independent Shipping verifier must observe the evidence before signing. For attached files, inspect the **provider-stored draft attachment bytes** and match each filename/hash against the frozen package. For public or scoped links, use a separate signed-out or recipient-scoped session and verify the actual response bytes, not merely a Drive permission row or HTTP 200 HTML shell. Inspect all supporting references and require explicit permission for each.

### Signing and authority
The verifier creates a detached Ed25519 signature over the canonical manifest, including release key, fingerprint, recipient identity, channel, package digest, artifacts, all evidence claims, and timestamps. Only the independent Shipping verifier holds the private signing key. Senders verify with a trusted public key provisioned in `EVERCRAFT_SHIPPING_VERIFIER_PUBLIC_KEY`, outside sender-controlled requests. Producer agents and external recipients must **never** receive the private key. Do not write keys, user data, or private link inventories into this public repository.

The sample tests use fixture-only credentials. Production **must** provision protected private-key custody, pin the correct public verification key, authentic provider/Drive access probes, replay handling, auditor separation, and trusted runtime wiring.

### Outcome states
- `hold`: evidence absent, expired, unsupported, inconsistent or untrusted. No commercial-send permission.
- `recipient_preflight_passed`: the declared recipient-access evidence passed verification. **Still not permission to contact or send.**

Separately, Systemia's canonical outbound-contact approval/reservation must be live and valid immediately before a consequential customer message. Shipment idempotency, sender authorization, provider send receipt and sent-copy verification remain independent steps. A successful preflight is not a sent message, recipient open, customer acceptance, or revenue.

## Integration boundary
This PR adds verified primitives and mandatory test coverage and now fails closed in Forge's `dispatchVerifiedShipment` transport path, including retry attempts. It does **not** wire every other direct email/Clip sender through that runner, configure a production signer or public verifier key, authorize the Port/partner email, change Drive visibility, or deploy another service. Runtime integration requires an authorized Systemia admission, a real signer service, exact-package receipt binding, audit log and an independently observed end-to-end canary.

**Security default:** if live verification is unavailable, release remains on hold. Do not silently enable an unsigned fallback.
