# Evercraft OS Files | Share Admission Gate (RC01 bridge)

Status: **source implementation on review branch, not deployed**. This is the policy bridge between the existing Evercraft Passport, Systemia release authority, and independent Shipping verifier. It is **not** a file server, share URL generator, Passport credential verifier, document editor, or evidence that anonymous users can open a link.

## Why this exists

The same release was stored privately in Google Drive, then advertised by owner-access links. An owner-opened Google Drive URL is not recipient-access evidence. The owned replacement must separate immutable private custody, approved public presentation, and independently verified recipient delivery. Google Drive remains a source/backup connector, not the share authority.

## Internal-only integration

1. Evercraft Files holds original bytes privately under artifact_ref and artifact_sha256. Never accept a browser-provided hash without verifying immutable stored bytes first.
2. An authenticated OS operator creates an intent using buildOsFileShareIntent. Classification comes from authoritative immutable storage metadata, not client parameters.
3. The trusted server supplies three independent adapters to evaluateOsFileShare:
   - **Passport:** verify current actor, scope, resource and, for consequential sharing, a single-use action permit. Never trust user-controlled callbacks or cached grants.
   - **Systemia:** verify the exact artifact revision was admitted for its audience, not merely built or stored.
   - **Shipping:** independently inspect exact bytes, MIME/rendering, confidentiality, source/recipient authorization, support links and device-opening evidence as required by release. The producer cannot self-sign Shipping approval.
4. Each adapter returns a fresh **server-verified** proof bound to the same request_fingerprint, artifact_sha256, audience and recipient_ref. Missing proof or disagreement returns HOLD.
5. READY_FOR_LINK_ISSUANCE is only a policy precondition. The persistent Files issuer must atomically bind it to immutable bytes, grant/recipient, expiration and revocation state. This function deliberately produces no link.
6. After a URL exists, Shipping tests it **without owner credentials** (public) or as the **exact authorized recipient** (scoped), verifying content, HTTP status, MIME and preview. Failures revoke the link and hold the shipment.
7. Systemia records the release receipt; Yard verifies the HTTPS route, deployment, and rollback. A source commit or green test does not establish production service.

## Security boundary

- external_public_link: only files classified public_release. This gate does not alter Google Drive permissions.
- external_scoped_link: requires an opaque recipient_ref. Recipient-only files still need independent proofs.
- internal_archive and private_source are never externally shareable.
- Intent TTL is at most 24 hours; adapter proofs must be recent and expire within the requested TTL.
- Callbacks are dependency injection ONLY at a protected server boundary. If end users supply the functions or booleans, this module is not secure. Production must have authenticated/signed verification plus durable Passport action-permit consumption.
- No private RC01 ZIP, recipient identity, secret, internal topology, or unpublished customer artifact is committed to this public repository.
- Drive-hosted HTML is not a functioning hosted web app. Yard HTTPS and real browser execution require separate verification.

## Test

    node --test systemia/evercraft-os/files/share-gate.test.mjs

The existing Evercraft OS proof workflow will run this test on the PR. Tests cover permitted review evidence, missing adapters, private source/archives, recipient scoping, hash binding, tampering, stale/future attestations, expiry and callback failure.

**Remaining:** production adapters; persistent Files storage and authenticated issuer; signed-out/recipient-real-browser checks; Yard HTTPS deployment and rollback; owner-approved access policies. Do not merge or deploy from this note alone.


## Concrete Passport integration (review-only)

The real Passport core now has a read-only adapter at passport-share-verifier.mjs. Only the protected server may supply its passport instance, identity-authenticated actorRef, and short-lived single-use permitId. An internet client cannot submit arbitrary adapter results. Passport must have an active grant for product evercraft-os, scope files.share_public or files.share_scoped, and the exact resource os-file:<artifact_ref>. The action permit is bound to actor, grant, scope, resource and immutable share request fingerprint.

The adapter checks the authoritative Passport grant and current permit state (including ancestor revocation, expiry and consumption), then returns a max-90-second authorization proof. It **does not consume** the permit, issue bytes, create a URL, or certify Shipping. The persistent share issuer must recheck authorization and consume the permit once as part of a crash-safe issuance transaction. A policy result alone is never sufficient proof of a successful customer opening.

    node --test systemia/evercraft-os/files/passport-share-verifier.test.mjs

This integration is exercised with the actual EvercraftPassport class in CI, including revocation, consumed-permit rejection, actor/resource mismatch and scoped-recipient fingerprint binding. Production-ready issuer persistence and separate Systemia/Shipping verification adapters remain held.
