# Leiland | Owned Pulse Release

This is a source-level publication adapter, not proof of a deployed runtime, live model inference, or site launch.

## Dataflow

1. KAIDANCE, already within Systemia, emits the existing private privacy-safe pulse using schema evercraft.kaidance.pulse.v1.
2. An Evercraft operator independently verifies resident identity, a real cycle receipt, and Systemia/Passport permission to publish a narrow public projection. A source JSON file alone is not evidence of field activity.
3. The operator pins an Ed25519 public verification key on an owned node, separate from the publisher's write authority. Only an independently authorized signer may issue a publication grant; never copy the signing private key to the serving node.
4. The one-shot publisher at systemia/leiland/owned-pulse-publisher.mjs checks a signed, unexpired, exact-source-path/exact-target-path approval, owner-only source file permissions, and source freshness. It reuses the existing KAIDANCE projection logic to output only kaidance/pulse.json to an owned static root, with a private receipt stored outside that root.
5. Leiland and KAIDANCE read that exact public file. No raw mission contents, Raven model prompts, customer or child records, credentials, private topology, or operator API is exposed.
6. The external release probe at scripts/probe-leiland-owned-release.mjs separately tests public HTTPS and source-asset parity. This proves the source bytes were served, not control of the server or verified resident health.

## Signed approval

Approval is a private UTF-8 JSON file signed over its EXACT bytes with an operator-controlled Ed25519 key. The detached 64-byte signature is encoded in base64 in its own file. The public PEM key must be independently pinned.

The following values are examples only and are NOT an authorization:

    {
      "schema": "evercraft.leiland.owned-pulse-approval.v1",
      "scope": "kaidance.public-pulse.publish",
      "approval_ref": "approved:example-only-not-a-grant",
      "source_path": "/private/operator/approved-safe-pulse.json",
      "target_path": "/srv/evercraft-public/kaidance/pulse.json",
      "not_before": "2026-11-20T00:00:00.000Z",
      "expires_at": "2026-11-21T00:00:00.000Z"
    }

The grant must bind the canonical input and target paths and last no more than seven days. Signing a file does not constitute Systemia or Passport approval. Both the actual authorization and the source's field identity require separate verified evidence.

## Operating requirements

- Input safe pulse and approval manifest: absolute paths to owner-only regular files (0600).
- Public root and kaidance subdirectory: existing Evercraft-owned directories, not symlinks, not inside the private source tree.
- Receipt directory: private, existing, and outside the public root. Receipts are mode 0600 and contain no source data or secrets.
- Operator verification public key: pinned and protected from changes by the publisher account.
- Signing private key: offline, never committed or exposed in the serving runtime.
- Do not bind this script to public HTTP. Do not install an independent scheduler; Systemia may invoke this one-shot publisher within its existing five-minute cycle only after source and authority checks pass.

On an authorized Evercraft-owned runtime, replace ALL sample paths with real verified paths:

    node systemia/leiland/owned-pulse-publisher.mjs \
      --input /private/operator/approved-safe-pulse.json \
      --owned-public-root /srv/evercraft-public \
      --approval /private/operator/leiland-approval.json \
      --signature /private/operator/leiland-approval.sig \
      --verify-key /etc/evercraft/leiland-approved-signing.pub.pem \
      --receipt-dir /var/lib/evercraft/leiland/private-receipts

The command only attests a local file readback. Its receipt explicitly says external HTTPS and final public release are NOT verified.

## External public probe

From a separate network environment with an exact canonical source checkout:

    node scripts/probe-leiland-owned-release.mjs \
      https://approved-evercraft-owned-host.example \
      /canonical/forge-operator/public

The probe compares six public page assets byte-for-byte and checks the optional public pulse. A missing pulse remains NOT CONNECTED. Malformed JSON, unknown pulse fields, and other non-404 read failures are rejected. A source-reported field attestation does not independently prove that the resident itself was running. The probe deliberately reports final_public_launch_authorized:false.

## Public go-live requirements

1. Verify real resident KAIDANCE identity, cycle receipts, publication authority, and field provenance independently.
2. Bind the public hostname and served files to the actual Evercraft Yard/Compute deployment receipt. No Base44 or other third-party runtime.
3. Run the focused Leiland tests and browser/iPhone/portrait streaming QA. Verify CSP, privacy, accessible reduced-motion mode, exact source revision, and rollback.
4. Run an offsite HTTPS readback twice across two genuinely increasing source-attested KAIDANCE cycles and archive receipt hashes.
5. Only then claim the KAIDANCE coordination heartbeat is live. Raven inference is still private; Leiland's separate inference feed remains disconnected until its own source-backed, privacy-reviewed publication pipeline exists.

Five-minute freshness is a target, not a fabricated fact. On a failed publish, the browser will not continue to display a verified fresh pulse indefinitely. Revocation must stop new publications and invalidate any currently served public file at the owned edge.

## Tests and limits

Offline synthetic-only QA: tests/leiland-owned-pulse-publisher.test.mjs, tests/leiland-owned-release-probe.test.mjs, tests/leiland-public.test.mjs. No example timestamp, signing key, cycle count, or hostname in the tests represents an actual field deployment.

GitHub is canonical, Systemia decides authority, KAIDANCE supplies the pulse, Yard/Compute owns runtime, and Raven's private inference boundary is not weakened.
