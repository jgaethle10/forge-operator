# Evercraft Network: authorized satellite gateway backfill (DESIGN ONLY)

RADIO ROSTO / RS-15, NORAD 23439, COSPAR 1994-085A, launched 1994-12-26, is a *historical orbit-modeling subject*, not a usable or authorized operational link. Historical September 2026 research reported SGP4 (`satellite.js`), `NetworkOrbitalElementSet`, `NetworkOrbitalGroundPoint`, `NetworkOrbitalPassWindow`, and about 15 modeled Yakima-area passes across 48 hours. Original app-era source is not independently recovered in the connected `forge-operator` repo. No receiver, RF reception, two-way link, or satellite backhaul was demonstrated. A predicted pass NEVER implies a radio link.

## Transport-neutral target

Local node A -> durable encrypted queue -> explicitly consenting satellite service gateway G -> approved commercial/provider spacecraft service -> authorized remote gateway R -> destination B. The provider controls spacecraft/radio/network and service entitlement; Evercraft controls application identity, queue, destination encryption, priority policy and signed receipts.

Saban only admits a gateway when its identity, grant, contract, remaining power/bytes, compatible provider API, observed real link, time budget and recipient policy are verified. Without that evidence select `NO_ROUTE`. No satellite command, unlicensed RF, amateur-network commercial usage, unauthorized infrastructure access or emergency service masquerading.

## Bundles and short-contact transfer

Evaluate standards-compliant BPv7 (RFC 9171) and BPSec (RFC 9172), but **this document does not claim either has been implemented**. Suggested envelope: `bundle_id, origin, destination, created_at, expires_at, priority, immutable_payload_sha256, size, fragment_index/count, encrypted_payload, key_id, permission_ref, retry_epoch, per_fragment_ack_bitmap, receiver_receipt`. Encryption key provisioning occurs out of band. Queue is durable and bounded by size and expiry. Use explicit, contract-approved prioritization: locally safety-relevant continuity messages (not guaranteed public safety precedence), normal traffic, then bulk snapshots.

At an **observed active gateway**, authenticate and exchange inventories and challenge nonces; reconcile already-received fragment hashes. Use measured data rate and remaining byte budget, reserve packet overhead, send high priority fragments first, persist originals until a cryptographically authenticated gateway *custody accepted* acknowledgment. This does NOT equal end-to-end delivery. Destination B issues a distinct signed authenticated delivery acknowledgment after decrypting, verifying destination and expiry, replay filtering and durable state. On interruption retain missing fragments, retry next authorized contact, discard expired work, hold irreversibles/forks for review.

## Sequential proof gates

S0: deterministic bundle/fragment/ACK codec and corrupted/duplicate/expired negatives.
S1: two-process synthetic contact-window fault injection.
S2: authorized LAN gateway whose connectivity gates are artificially toggled.
S3: two real hosts and physical link isolation with witnessed receipts.
S4: real approved satcom gateway/account and legal permission, measured link.
S5: repeated intermittent windows, throughput/energy measurements, final-destination acknowledgments and independent review.

No S1-S5 satellite gateway evidence is claimed for this change; the new paired-LAN test is a prerequisite only. Obtain dated OMM/TLE with source epoch and uncertainty before re-running any satellite orbit model. SGP4 predicts geometry, not permission or functioning payload.
## 2026-11-18 implemented software preflight: synthetic contact windows

New implementation in `systemia/network/backfill-contact-lab.mjs`; regression in `tests/network-backfill-contact-lab.test.mjs`. This is a **filesystem-only contact-window simulation**, not a real gateway, physical radio or satellite link. Reuses `secure-envelope.mjs` for AES-256-GCM destination encryption. It creates a separately HMAC-authenticated bundle manifest, bounded fragments with local fsync, denies simulated gateways without consent/identity/active-window claims, persists fragments across two simulated windows, rejects corruption and priority tampering, and distinguishes simulated gateway custody acceptance from final-destination acknowledgment. It does not implement BPv7/BPSec on the wire, network traversal, true gateway identity, real field observation or carrier availability.

Local reproducible preflight:
```bash
node --test tests/network-field-outage-lab.test.mjs tests/network-backfill-contact-lab.test.mjs
```
Recorded result: 2/2 PASS locally. Backfill trial: 26 encrypted-envelope fragments; window 1 writes 2, window 2 writes 24; gateway custody and receiver ACKs distinct, and duplicate/altered/corrupt inputs held or rejected. This is S1-like deterministic software fault injection; not S2-S5. All raw keys are ephemeral in tests. Only a correctly authorized and **observed physical** contact can promote an actual transport to `verified`.
