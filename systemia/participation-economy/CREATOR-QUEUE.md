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
