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

KAIDANCE already has an opt-in operator-authorized publisher in systemia/collider/public-publisher.mjs that obtains the existing private Yard pulse and publishes a small reviewed JSON projection. Leiland must subscribe to that same output, never create a second artificial heartbeat.

The separate signed publisher in systemia/leiland/owned-pulse-publisher.mjs has a different approval contract; it must not be run simultaneously against the same output. Systemia/Passport must select and authorize one publication path. No sample signed manifest constitutes a production approval.

## HTTPS release requirements

Only after existing Evercraft-owned Yard/Compute deployment admission should an approved HTTPS edge forward Leiland and KAIDANCE public-only viewer routes to this loopback host. A legitimate launch requires actual DNS/TLS ownership verification, shared-edge conflict checks, signed deployment identity, externally fetched asset parity, two independently observed increasing real cycles, iPhone portrait-mode QA, and a verified rollback.

Do not claim Leiland is publicly live or showing real model brain activations from source tests, a local listener, or a GitHub merge. No public route is activated by this change.
