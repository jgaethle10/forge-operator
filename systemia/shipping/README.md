# Evercraft Shipping Department

Evercraft Shipping is the final-mile control layer between completed work and an external recipient.

It does not treat "the file exists" or "the send tool returned" as delivery. A shipment is complete only when the exact customer-safe package has passed preflight, one authorized send has been accepted by a provider, and the sent copy has been read back and verified.

## Shipping contract

Every external package moves through the same gates:

1. **Scope lock** - bind the package to one logical package key and one authorized recipient.
2. **Artifact preflight** - verify non-empty bytes, file signature/openability, render QA for visual documents, MIME/extension consistency, content digests, and total package size.
3. **Client-safe naming** - strip internal build language such as `WORLD_CLASS`, `FINAL`, `DRAFT`, temporary labels, and version suffixes from customer-visible filenames.
4. **Package manifest** - freeze the exact filenames, sizes, MIME types, SHA-256 digests, QA evidence, and package digest before dispatch.
5. **Human send authority** - external delivery requires an explicit authorization reference. Preparing a package is not permission to send it.
6. **Idempotency reservation** - recipient + subject + package digest + logical package key produce one durable idempotency key. A repeated request is suppressed.
7. **Route selection** - a thread reply may be preferred, but a proven pre-acceptance thread failure may fall back to a fresh outbound message.
8. **Ambiguous-send quarantine** - if provider acceptance is uncertain, Shipping does not retry until the sent mailbox is checked. Duplicate roulette is forbidden.
9. **Provider acceptance** - one accepted provider message ID ends automatic retry authority.
10. **Sent-copy readback** - verify exact recipient, subject, attachment count, and attachment filenames from the provider's sent copy.
11. **Delivery receipt** - only verified delivery can produce a v2 receipt. Customer acceptance and downstream outcome are never inferred.

## State model

```
prepared
  -> reserved
  -> send_failed_pre_acceptance
       -> fresh_outbound fallback (within retry budget)
  -> verification_required_before_retry
       -> sent-copy check
       -> verified_absent -> one safe fallback
  -> provider_accepted
       -> sent-copy readback
       -> verified_delivered
```

A provider error with unclear acceptance is deliberately more conservative than a hard failure. If Evercraft cannot prove that nothing was sent, it checks before trying again.

## Modules

- `package-preflight.mjs` - artifact integrity, openability, render QA, naming, package manifest.
- `release-station.mjs` - physically materializes a frozen client-facing release directory with clean filenames, exact SHA-256 byte verification, channel limits, source lineage, a human-readable release note, and mutation detection before dispatch.
- `control-tower.mjs` - version-aware shipment orchestration, stale-package supersession, deliberate reissue authority, stuck-shipment detection, repair recipes, and notification-fabric intents for operational exceptions.
- `proof-bundle.mjs` - end-to-end chain-of-custody proof tying control-tower order, frozen release bytes, shipment ledger, sent-copy verification, provider message ID, and delivery receipt together.
- `recipient-response.mjs` - correlates inbound replies to verified deliveries, preserves exact linkage evidence, and emits follow-up signals without pretending a reply automatically means approval or authorizing an external action.
- `shipping-ledger.mjs` - durable shipment reservations, idempotency, attempts, readback state.
- `shipping-department.mjs` - envelope preparation, route/fallback policy, send-error classification, sent-copy verification.
- `transport-runtime.mjs` - provider-agnostic dispatch runner with safe thread-to-fresh fallback, resume after interruptions, provider acceptance locks, and readback verification.
- `delivery-receipt.mjs` - legacy receipt support plus verified v2 delivery receipts.
- `shipping-department.test.mjs` - invariants covering clean names, package QA, human send authority, thread fallback, ambiguity quarantine, readback and duplicate suppression.

## Non-negotiable invariants

- No customer sees internal artifact naming.
- No external send without an authorization reference.
- No second provider-accepted send for the same logical package.
- No retry after an ambiguous connector failure until sent-copy absence is verified.
- No delivery-complete state from a provider response alone.
- No "attachment probably made it." Sent-copy attachment verification is required.
- No acceptance, satisfaction, business outcome or product success is inferred from delivery.

## Operational example

If a Gmail thread reply fails before provider acceptance, Shipping may retry once as a fresh outbound message. If that fresh send returns a provider message ID, retries stop. Shipping reads the sent copy and confirms the intended PDF is really attached under its client-safe filename. Only then does the shipment become `verified_delivered`.

That exact sequence is designed to turn today's manual recovery pattern into permanent infrastructure.


## Release Station

Shipping now has a physical release-station step between production and transport. Internal working files are never handed directly to a provider. The Release Station copies only the approved bytes into a client-facing directory under their frozen client names, writes an immutable package manifest, and verifies the directory immediately before dispatch.

Channel profiles currently distinguish email, customer handoff, ChatGPT attachment delivery, public-records delivery, and internal review. Each profile sets its own size/artifact budget and whether external send authority and post-send readback are mandatory.

The release directory intentionally contains only three classes of object: approved client artifacts, `manifest.json`, and `RELEASE.txt`. If an artifact is mutated, replaced, renamed, added, removed, or has a different byte digest after materialization, verification fails closed.


## Control Tower v3

Shipping now treats every outgoing package as a versioned order rather than a loose send action. The Control Tower prevents an older unsent package from leaving after a newer package has been approved, while preserving delivered history as immutable evidence.

An identical package sent to the same recipient is duplicate-suppressed by default. A legitimate resend is a different operation called a **reissue**. Reissues require a fresh human authorization and a reason, and they remain linked to the original verified delivery. This means "please resend that file" is possible without weakening duplicate protection.

The Control Tower also scans for stalled or ambiguous shipments. Provider-accepted-but-unverified messages and ambiguous connector outcomes become explicit operational exceptions with repair recipes. It can emit a deduplicated Systemia Notification Fabric intent for an operator, but the control-tower module itself never sends a notification or customer message.

## Chain of Custody

A completed shipment can now produce an Evercraft Shipping proof bundle. The bundle cross-checks:

- control-tower order and current package version
- frozen release package digest and artifact hashes
- transport shipment and idempotency key
- provider message ID
- sent-copy recipient, subject, and attachment verification
- verified delivery receipt

Any mismatch breaks the proof bundle. The evidence boundary remains strict: Shipping can prove what bytes were packaged and what provider message was verified, but it does not infer that the recipient opened the message, accepted the work, was satisfied, or achieved a downstream business result.


## Recipient Response Loop

Shipping no longer has to go blind after delivery. A reply can be correlated back to the exact verified shipment by provider message ID, provider thread, or an explicit human linkage reference. The resulting record proves that an inbound response was observed and preserves its source message ID and thread evidence.

Disposition remains evidence-bound. Shipping does not run a vibes engine over customer replies and call them "approved." A response remains `unknown` unless a classification is supplied with an explicit basis. Only an `approved` disposition with a `human_confirmed` basis can assert customer acceptance in the response record. Even then, Shipping does not infer satisfaction, payment, renewal, or downstream business outcome.

Recipient-response signals can route work back into Systemia, for example scheduling, owner review, revision intake, relationship follow-up, or closeout review. Those signals never authorize autonomous customer communication.
