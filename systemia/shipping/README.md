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
