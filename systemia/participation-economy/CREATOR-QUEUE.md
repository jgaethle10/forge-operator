# Evercraft Home creator record queue v0.1

**Development-only, owned filesystem.** This is a working internal metadata queue, not a public signup, authenticated review service, media upload, production publisher, or financial ledger. No Base44 runtime. Nothing here creates a public post, creator account, payable, wallet, or disbursement.

## Pipeline

- creator-intake.mjs: separate publication holds for Home, EverMaps, Journal, and Clip. Caller review evidence is not authenticated.
- creator-record-store.mjs: persists metadata envelopes in a tenant-scoped hashed directory. Append-only, hash-linked event records for submission, reviewer claim, and creator-withdrawal claim. Atomic exclusive hardlink commits for a single owned local filesystem; stale-head conflicts rejected. A new Node process can replay the queue.
- creator-record-store.test.mjs: adversarial tests for persistence, tenant isolation, review holds, consent, tampering, concurrency, and withdrawal.
- creator-queue-pilot.mjs: disposable synthetic "Before We Were Here" flow, including restart and withdrawal.

### Run with Node 22

~~~sh
node --test systemia/participation-economy/*.test.mjs
node systemia/participation-economy/creator-queue-pilot.mjs
~~~

The synthetic cemetery is fictional and must not be represented as a verified memorial or location. Marker verification is independent of a cemetery-level location. Private family records and precise unreviewed coordinates must not be placed in the public intake envelope.

## No production trust

Tenant refs, creator identity, and editorial decisions are caller-supplied. Hash consistency is not a signature, external attestation, or tamper-proof guarantee. The store assumes a trusted machine, a single host, and private filesystem permissions. The projected state candidate_for_trusted_publisher_review does not authorize publication.

## Before a public creator release

1. Separate public-social Home accounts from operator Home and private memory/room privileges. Authenticate all actors and enforce tenant-scoped authorization.
2. Build owned media uploads, scanning, transcoding, consent/provenance, takedown, accessibility, and retention safeguards.
3. Bind independent signed review/rights receipts to individual revisions and enforce creator withdrawals in actual publisher adapters.
4. Create public Home feed and consent-gated adapters to Journal, Clip and EverMaps with verified live URL release receipts.
5. Independently validate payment-provider settlements, attribution, refunds and chargebacks. Obtain reviewed creator terms and needed payment/tax checks before payables or payouts.
6. Use production transactional storage with durable locking, backups and adversarial multi-host tests. Do not directly expose this local queue as a service.

Issue: https://github.com/jgaethle10/forge-operator/issues/1998


## Nov 15: restricted creator/editor access integration

- \`creator-access.mjs\` verifies HMAC-SHA256 bearer capabilities with an exact issuer and audience, 15-minute maximum lifetime, tenant, subject, role and narrow scopes. It never issues credentials.
- Callers cannot supply another tenant or creator identity to submit, read, review or withdraw through this interface. Reviewer actor is bound to signed subject; editor and creator roles remain separate.
- It wraps the existing durable queue only, not the public media service, operator Home, authentication system, editorial attestation authority or payout system.
- \`creator-access.test.mjs\` covers impersonation, expiry, signature tampering, audience separation, role/scope restriction, tenant isolation and withdrawal.
- A real issuer must independently authenticate people, authorize reviewers, securely manage signing keys with rotation and revocation, and enforce rate limits and auditing. HMAC key custody is the responsibility of the service hosting this module.
- **No public HTTP endpoint or public creator login is introduced.** A signed token alone is not proof that footage exists, a source is correct, a reviewer is impartial, or a payment has settled. Review records remain non-authoritative claims for publishing.


## Creator Studio local prototype

Open creator-studio-preview.html in a browser to explore the mobile-first creator flow. The page lets creators draft a title and format, select Home/Journal/EverMaps/Clip destinations, record source IDs and optional cemetery/marker confidence, choose a local file (its bytes are not read), acknowledge rights/consent, and export a JSON draft manifest.

This page deliberately has no authentication, media upload, external data transfer, draft persistence, payment integration, or publication. Its generated identity and asset IDs are labeled unverified local placeholders. The exported metadata is **not** accepted as a trusted approval, real source attestation, verified creator identity, or signed media receipt.

Next required wiring: an owned identity issuer with secure session handling; an authorized uploader that returns scoped, verified media receipts; a server API invoking the restricted creator-access facade; authenticated editorial review; source verification; and separate publisher adapters.

## Nov 16: owned private media ingestion and receipt binding

- `creator-media-store.mjs`: accepts actual Buffer or streaming binary bytes into a **private single-host filesystem**, enforces a 64 MiB default ceiling, computes SHA-256, detects PNG/JPEG/MP4/WebM *file signatures*, fsyncs private temp media, and commits by exclusive link into a creator-and-tenant-isolated content-addressed path. It re-reads and hashes stored bytes on verification, rejects tampering, and returns a receipt with **no public URL**.
- `creator-media-store.test.mjs`: stream, size, file-type, invalid input, re-open, deduplication, ownership separation, and tamper tests.
- `creator-access.mjs`: new creator.media permission for `uploadMedia`, plus `submitWithMedia`, which requires a previously ingested verified asset belonging to that same signed tenant and creator before entering the original creator queue.
- `creator-media-access.test.mjs`: cross-tenant/creator failures, missing media, role/scope failures, typed content and full media-to-queue acceptance.
- `creator-media-pilot.mjs`: disposable synthetic image-byte proof through signed development token, intake, review, restart, and withdrawal.
- CI validates the entire proof and denies any pilot claiming publication, provider settlement or payable funds.

### Explicit security and capability boundary

This implementation is **not yet a production upload service**. The original `submit` path remains for metadata-only test fixtures and **MUST NOT be exposed** on a public API; expose only the stronger media-bound path after all publisher/privacy gates exist. The synthetic sample image is signature-level test material, not a validated decodable photograph or real cemetery footage. File signatures are not sufficient malware checks or deep media validation. No transcoding, content inspection, executable sandboxing, quotas across all uploads, DDoS protection, credential issuer, logout/revocation, retention/deletion workflow, redundant durability, object-storage replication, public user interface upload, public video player, copyright verification, or publisher receipt has been added.

The next production engineering gate is an authenticated same-origin upload and submission API with secure session management, MIME-independent deep decoding/scanning, privacy/compliance checks, content quota controls and operational recovery. Keep the creator's footage private until independent review and creator permission authorize distribution. The creator's footage does **not** automatically transfer copyright to Evercraft. Creator share calculations still require verified revenue and signed terms.

Example (Node 22, local sandbox only):
```sh
node --test systemia/participation-economy/*.test.mjs
node systemia/participation-economy/creator-media-pilot.mjs
```
