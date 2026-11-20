# Harbor owner-private founder intake | signed Systemia source → creator editorial

**Implementation:** `systemia/newsroom/harbor-founder-owner-inbox.mjs`  
**Purpose:** Actually consume a *locally installed* private bundle and owner-installed public-key trust registry, verify two independent Lineage Ed25519 attestations against the exact Systemia source revision, run the already merged `prepareSystemiaFounderCreatorReview()` + five canonical founder publishing documents, then emit a **redacted** hold-or-review receipt. This connects the evidence/creator code to an owner-machine command. **Source installation is not proof the Harbor operator actually invoked it.**

This is deliberately **not** a Harbor replacement, a new broker, a Meta sender, source-web fact checker, publication authorizer, or a way to declare that founder writing has passed human review. It cannot impersonate the founder.

## Required real inputs on an approved Evercraft Linux owner host

1. A real source producer has already produced a Systemia public-safe evidence record, with true `source_department`, `mission_id`, `artifact_id`, `revision`, `source_receipt_ref`, summary, claims and original HTTPS URLs. The producer identity and source receipt must have been verified by the actual authoritative department beforehand.
2. An independently authorized Systemia projection reviewer has checked the **exact version and every public claim**, source confidentiality, privacy and suitability for transfer into Harbor's news desk. Source URLs must separately be checked against the actual external primary documents; their appearance as strings does not prove authenticity.
3. The source producer and Systemia projection reviewer hold **two different approved Ed25519 private keys**, outside GitHub, private drafts, and this ChatGPT conversation. Only their public keys are installed in a separate **owner-private** trust registry file. Each registry entry binds an exact `key_id`, `role` (`producer` or `projection`), `department`, `actor_type`, `actor_id`, `status:'active'`, and `public_key_pem`. Revoked keys are rejected, and the same actor or public key may not play both roles.
4. The separately drafted personal Facebook candidate must use `evercraft.creator.personal-post-candidate.v1`; `upstream_source` binds the *same exact* department, mission, artifact, revision and receipt ref. Each factual claim has its `upstream_claim_id`, true source URLs and an exact `copy_span` appearing in the caption. The five canonical founder documents are always read from the actual repo checkout.

Never create or install replacement private keys just to make a test or a commercial post go green. The sender/authority owners decide approved actors and key rotation, not the inbound draft. The owner may hand a signer an exact immutable source revision, **not** an editable document or customer files.

## Signed evidence contract

The private packet JSON uses:

```json
{
  "schema": "evercraft.harbor.founder-owner-intake.v1",
  "upstreamRecord": "<actual approved evercraft.systemia.harbor upstream record object>",
  "creatorDraft": "<actual private founder-post-candidate object>",
  "attestations": {
    "producer": "<existing Evercraft Lineage Ed25519 attestation envelope>",
    "projection": "<second independent Lineage Ed25519 attestation envelope>"
  }
}
```

Each of the two attestation envelopes is produced using the existing `createAttestationPayload()` and `signAttestation()` exports in `systemia/lineage/signatures.mjs`, with `subject.type='systemia.harbor.source-revision'` and `subject.id=sha256(lineage.stable(upstreamRecord))`. The role-specific `payload.claims` must bind `role`, `department`, `source_receipt_ref`, `revision`, `public_projection_sha256` (that same digest), and `publication_authority:false`.

The trusted registry (physically different file, **not** inside the packet) uses:

```json
{
  "schema": "evercraft.harbor.founder-owner-trust.v1",
  "keys": [
    {
      "role": "producer",
      "department": "aaar",
      "key_id": "ACTUAL_APPROVED_SOURCE_KEY_ID",
      "actor_type": "agent",
      "actor_id": "ACTUAL_REGISTERED_SOURCE_ACTOR",
      "status": "active",
      "public_key_pem": "ACTUAL_VERIFIED_ED25519_PEM"
    },
    {
      "role": "projection",
      "department": "aaar",
      "key_id": "ACTUAL_APPROVED_PROJECTION_KEY_ID",
      "actor_type": "service",
      "actor_id": "ACTUAL_REGISTERED_SYSTEMIA_PROJECTION_ACTOR",
      "status": "active",
      "public_key_pem": "DIFFERENT_ACTUAL_VERIFIED_ED25519_PEM"
    }
  ]
}
```

This registry is an example of **structure only**. No such real anchors, producer approvals or signed Hubble packet are established by the current PR. GitHub fixture keys are synthetic and never become production anchors. Real trust entries must be installed independently, after owner authority verification, by the approved host operator. A signature proves possession of a specific key and integrity of covered bytes, **not** that NASA's site was consulted or the story is objectively true.

## Owner-local read-only preflight

Paths below are **illustrative**; first locate real approved private state on the actual authorized owner host:

```bash
node systemia/newsroom/harbor-founder-owner-inbox.mjs \
  --packet /approved/private/harbor/creator/hubble-source-draft.json \
  --trust /approved/private/systemia/creator-source-trust.json
```

All input directories must be owned by the executing non-root user and mode `0700`. Input files must be owned regular 0600 files with a single link and no symlink path. The tool does not fetch public websites, send network traffic, modify inputs, or output the personal caption, original research prose, source URLs, credentials, or source key PEM. Its JSON result is **only** review status, blocker codes, source/copy digests and boundaries.

A `HOLD` result returns exit code 2. A valid double-signed source and founder preflight result is `READY_FOR_INDEPENDENT_EDITORIAL_REVIEW`, **never** approved, published, monetized, signed by the founder or externally verified.

## Optional local, durable, idempotent receipt

Only after the operator chooses a pre-existing private receipt directory:

```bash
node systemia/newsroom/harbor-founder-owner-inbox.mjs \
  --packet /approved/private/harbor/creator/hubble-source-draft.json \
  --trust /approved/private/systemia/creator-source-trust.json \
  --receipt-dir /approved/private/systemia/editorial-receipts \
  --record
```

The command creates a 0600 `founder-<packet_sha256>.json` record using `wx` (no overwrite). An exact replay returns `EXISTING_IDEMPOTENT_RECEIPT`. A differing assessment against an existing packet digest fails as a conflict rather than silently replacing a previously held decision. The stored receipt is a **private local operator observation**, not an authenticated provider-native Harbor ACK, accepted Journal editorial release, founder approval, approved comment, or Facebook provider post.

To prove real Harbor adoption later, the authorized Systemia/Harbor resident must invoke this exact read-and-review operation after receiving a legitimate upstream packet, record a genuine invocation/consumer ACK in approved private durable state, and reconcile the state with the signed source revision. This tool cannot obtain that deployment evidence by itself.

## CI and audit

`node --test systemia/newsroom/harbor-founder-owner-inbox.test.mjs systemia/newsroom/founder-creator-upstream.test.mjs systemia/creator/founder-editorial-preflight.test.mjs systemia/lineage/signatures.test.mjs`

The **existing** `.github/workflows/systemia-harbor-upstream.yml` now runs the complete privacy/security suite with synthetic generated Lineage keys. The tests cover unsigned/mismatched/altered source, revoked and duplicate actor keys, fake approvals, old revisions, the invented 100-word rule, missing canonical policies, private 0600/0700 storage and idempotent redacted receipts.

**Existing source hierarchy preserved:** Systemia evidence → source-only Harbor handoff → founder canonical editorial preflight → independent human editorial review → founder personal account approval/manual post → actual Facebook provider receipt and independent readback. This implementation stops at the review stage. It never uses corporate Page access to post on a personal profile.

## Next stage: signed inbox → existing Systemia Intake Fabric, no second queue

The source adapter at `systemia/newsroom/founder-editorial-intake.mjs` now takes the **actual owner-private 0600 packet and separately provisioned trust file**, calls this owner's existing two-actor signed inbox preflight, and then submits an **inert, redacted** candidate to `EvercraftIntakeFabric`. There is no new reviewer queue, outbound publisher or direct third-party host. It requires an independently existing Passport `intake.write.agent` grant for the named owner adapter, **including on duplicate retries**. It never grants the Passport scope for itself. A distinct Harbor reader must hold `intake.read` for the exact candidate. The reader returns local review readiness only; no live Harbor network pickup ACK is inferred.

The Intake content reference and fingerprint bind the original signed packet digest, verified source revision, founder exact copy hash, five canonical policy file hashes and the actual reviewed founder example digest. No original creator prose, NASA source URL, signer's keys, partner/customer data or post text is added to the Intake ledger. The stored source trust state remains `untrusted_external` because signed source provenance does not make a draft safe instructions. Model-supplied trusted callbacks cannot enter the adapter; it reads the original owner-installed trust material through `inspectOwnedHarborFounderPacket()`.

The resident/operator API is:

```js
import {stageOwnedFounderEditorialIntake,inspectFounderEditorialPickup}
  from './systemia/newsroom/founder-editorial-intake.mjs';

// From the ACTUAL authorized owner host only. Private paths are illustrative.
const stage=stageOwnedFounderEditorialIntake({
  packetFile:'/owner/private/editorial/source-packet.json',
  trustFile:'/owner/private/systemia/trust-anchor.json',
  intakeStateDir:'/owner/private/systemia/intake',
  passportStateDir:'/owner/private/systemia/passport',
  adapterActorRef:'adapter:approved-systemia-editorial'
});
// A separate Passport-authorized reader may inspect the exact candidate:
const read=inspectFounderEditorialPickup({
  candidateId:stage.candidateId,
  expectedContentFingerprint:stage.contentFingerprint,
  intakeStateDir:'/owner/private/systemia/intake',
  passportStateDir:'/owner/private/systemia/passport',
  readerActorRef:'adapter:approved-harbor-editorial'
});
```

Do not execute this as a production workflow until those owner paths and real grants actually exist and are verified. The functions do not issue or bypass grants. The API does not send a packet to Harbor's remote account or make Meta calls. A private local read is not a remote authenticated Harbor pickup or final editorial review.

Run `node --test systemia/newsroom/founder-editorial-intake.test.mjs systemia/newsroom/harbor-founder-owner-inbox.test.mjs` on the owned source checkout. The shared `.github/workflows/systemia-harbor-upstream.yml` includes the full source, signed-owner, Intake/Passport and canonical founder regression suites. CI uses **generated synthetic keys only**, never owner real credentials or media.

**Remaining production handoff:** install the new adapter in the authenticated local Systemia resident, prove an actual signed owner packet from an approved department, provision independent key trust and Passport grants, read the intake candidate from real authorized Harbor and write a genuine signed pickup/ACK to the existing audit system. These have not been proven by a GitHub merge.
