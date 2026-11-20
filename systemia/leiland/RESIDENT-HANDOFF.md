# Leiland | Systemia opt-in resident handoff

Leiland is a first-party read-only loopback host for the Living Mind and KAIDANCE. It now has a **Systemia Core Resident Supervisor** integration rather than a new mission scheduler or external managed runtime.

## Source and authority

- systemia/leiland/resident-host-runner.mjs starts the existing owned-observatory-host.mjs process, with the actual Git HEAD pinned to the required release SHA.
- systemia/organism/leiland-owned-observatory.workflow.json grants local reads of reviewed static files and already-approved public JSON only. No inference, missions, publication, DNS, routing or payment.
- systemia/core/resident-services.json defines optional service leiland-owned-observatory. All three required environment bindings must be supplied by an authorized operator before Systemia will start it.

The service stays disabled if a required binding is missing. It cannot silently create directories, publish a pulse, allocate hardware, issue TLS certificates, add DNS or open an internet listener.

## Field configuration on an already-verified owned node

Only after independent node identity, deployment receipt and filesystem permissions have been verified, configure the existing Systemia resident supervisor with:

    LEILAND_STATIC_PUBLIC_ROOT=/absolute/path/to/verified/forge-operator/public
    LEILAND_PUBLICATION_ROOT=/absolute/path/to/approved/public-projections
    LEILAND_RELEASE_SHA=<exact,verified,40-hex-checkout-HEAD>
    LEILAND_PORT=8795

The static root must exactly match the local canonical repo public folder, with no symlink tricks. The publication root must already exist, be independent of source checkout, and only contain reviewed public projections. The release SHA must match the current real Git checkout on every startup. The optional port defaults to 8795.

The Systemia resident supervisor owns process lifecycle and restart receipts. Do not install a second systemd service for the same port.

## Node 001 read-only resident readiness, after the temporary canary

The temporary `scripts/leiland-owned-field-canary.mjs` already tests canonical page bytes with an ephemeral loopback server. **Do not repeat that test to infer a resident started.** The next independent stage is `scripts/leiland-resident-readiness.mjs`, which inspects the existing optional Systemia resident and its **actual local** `127.0.0.1:8795` server without starting anything:

```bash
REPO="$HOME/.local/share/evercraft/forge-operator"
PIN="$(git -C "$REPO" ls-remote origin refs/heads/main | awk '{print $1}')"
node "$REPO/scripts/leiland-resident-readiness.mjs" \
  --checkout "$REPO" --expected-sha "$PIN"
```

The command requires an exact pinned revision and the canonical `jgaethle10/forge-operator` remote. It checks the Systemia resident manifest/registry, whether any Leiland bindings are visible **in the current shell only**, the loopback health protocol and served HTML byte parity, and the status of the **public-only** KAIDANCE pulse and inference feed. It prints no private paths or authorization values and performs **no writes**. `not_listening_or_unreadable` is a genuine hold, **not** an instruction to bypass Systemia and start an extra service. Missing environment variables in the terminal do *not* establish that a separate supervisor process lacks them.

If the resident is not listening, verify the actual approved Systemia supervisor environment, deployment receipt, and optional resident admission. If it is listening but reports a wrong revision, reconcile the pinned checkout before changing routes. If it matches and the pulse is absent, progress to separately signed KAIDANCE authorization and existing strict `scripts/leiland-field-preflight.mjs`. If a public pulse is source-reported as attested, that does **not** independently verify private Yard source, signed approval, increasing external cycles, or production TLS; the receipt's high-trust flags intentionally remain false.

The inspector never publishes source snapshots, starts a resident, modifies Caddy/DNS, or makes independent hardware-identity or public HTTPS claims. It should be run on the actual owner-controlled node, not GitHub Actions, when assessing the field state.

## Local tests, not a production launch

Run focused source QA on the field revision:

    node --test tests/leiland-systemia-resident.test.mjs
    node --test tests/leiland-kaidance-field-integration.test.mjs tests/leiland-field-preflight.test.mjs

The first test launches a test process on loopback, checks its HTML and health, then shuts it down. All test pulse data is synthetic.

After admission, a separately verified node should answer locally at:

    http://127.0.0.1:8795/healthz

This is only a private loopback health endpoint. It never asserts external HTTPS, actual private model activations, published data validity or a verified owned-node identity.

The read-only scripts/leiland-field-preflight.mjs can inspect the resident via loopback and ask the existing private YardOperator for an eligible KAIDANCE source. It requires actual private Yard state and separately authorized approval; it never writes or starts a publisher.

## One source, one public pulse publisher

The older unsigned KAIDANCE publisher in systemia/collider/public-publisher.mjs has been **retired and intentionally disabled**. Its private field-readiness function remains useful, but its public writer cannot run. Never re-enable or bypass this hold to make the visualization move.

Use only the path-bound Ed25519-signed publisher in systemia/leiland/owned-pulse-publisher.mjs, after separate Systemia/Passport authority and genuine private Yard pulse verification. The signed writer reads a private safe pulse snapshot and produces the same minimal kaidance/pulse.json for both viewers. A private field-collection step must ensure the snapshot matches current real Yard state; the read-only scripts/leiland-field-preflight.mjs checks the signed grant, snapshot and live source agreement before publication. Signing a synthetic snapshot or placing an approval key on the public host is not allowed. No sample manifest is production authorization.

## HTTPS release requirements

Only after existing Evercraft-owned Yard/Compute deployment admission should an approved HTTPS edge forward Leiland and KAIDANCE public-only viewer routes to this loopback host. A legitimate launch requires actual DNS/TLS ownership verification, shared-edge conflict checks, signed deployment identity, externally fetched asset parity, two independently observed increasing real cycles, iPhone portrait-mode QA, and a verified rollback.

Do not claim Leiland is publicly live or showing real model brain activations from source tests, a local listener, or a GitHub merge. No public route is activated by this change.
