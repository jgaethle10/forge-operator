# Remote device trust review

This command removes the need to copy raw device fingerprints out of Yard while preserving explicit human authorization.

## List

```bash
node systemia/yard/remote-device-review.mjs list \
  --yard-state /private/yard \
  --broker-deployment <remote-broker-deployment-id>
```

The list returns an opaque `candidate_ref`, node ID, request receipt, attestation state and timestamps. It does not return the raw device fingerprint.

## Authorize

Authorization is intentionally harder than listing:

```bash
node systemia/yard/remote-device-review.mjs authorize \
  --yard-state /private/yard \
  --broker-deployment <remote-broker-deployment-id> \
  --candidate <candidate-ref> \
  --confirm-candidate <same-candidate-ref> \
  --approval-ref <explicit-human-approval-reference>
```

The command re-reads the live pending inbox before authorizing. If the candidate disappeared, changed identity evidence, or no longer maps to the same opaque ref, authorization fails.

The exact raw fingerprint remains inside Yard and is passed directly to the existing `authorizeRemoteDevice` trust action. The review command never auto-selects a candidate, never authorizes merely because only one candidate exists, and never treats discovery as approval.

Revocation remains a separate explicit trust-management action.
