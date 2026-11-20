# Leiland | Evercraft-owned static + pulse host

Source: systemia/leiland/owned-observatory-host.mjs
Release authority: Systemia + Passport; static/pulse proof: owned-pulse-publisher.mjs and scripts/probe-leiland-owned-release.mjs.

This is a **loopback-only, read-only** origin for the Leiland and KAIDANCE observatories. It is not a public TLS deployment. It performs no inference, remote mission work, publication, DNS updates, billing, or private-runtime inspection.

## Why this host exists

A publicly visible Leiland page needs one coherent owned origin for all of these relative URLs:

- /leiland/ (animated UI), /leiland/style.css, /leiland/brain.js, /leiland/pulse-bridge.mjs
- /leiland/feed.json (no data until an independently authorized, evidence-gated publisher supplies it)
- /kaidance/pulse.json (the already-sanitized signed KAIDANCE pulse, read-only)
- /kaidance/ (existing Systemia operating-cycle observatory)
- /systemia/ (static explanatory entry)

If the pulse file does not exist, /kaidance/pulse.json returns **404** and the client must report NOT CONNECTED. The host never invents a cycle.

## Trusted environment and filesystem

The host must run as a **nonprivileged Evercraft service user** with read-only access to a canonical, exact-release public source directory and to a separate owned publication directory. Do not use the GitHub Pages URL, Base44, or a foreign app runtime as the Evercraft public host.

Required env variables, replacing ALL values after verifying the exact deployed revision and operator approval:

    LEILAND_STATIC_PUBLIC_ROOT=/opt/evercraft/forge-operator/public
    LEILAND_PUBLICATION_ROOT=/var/lib/evercraft/leiland/public-projections
    LEILAND_RELEASE_SHA=<exact,verified,40-hex-deployed-commit>
    LEILAND_PORT=8795

The two roots must already exist and be non-symlink, non-overlapping directories. Public scripts and HTML come from the canonical release's public directory using an exact URL allowlist, not arbitrary disk traversal. The publication directory is separate from source checkout and contains **only** public projections, such as kaidance/pulse.json. The host cannot receive publication writes. Files are checked for symlinks and regular-file identity on each read.

Create the publication directory through the existing authorized Yard/Compute operator. Do not make a publicly writable directory. The approved KAIDANCE one-shot publisher is responsible for adding/updating the pulse JSON there; it must have its own independently verified, path-bound Ed25519 approval and private receipt storage. Do not stage raw safe pulse, prompts, customer records or approval manifests here.

## Local QA first

From the exact checked out repository revision with approved directories configured:

    node --test tests/leiland-owned-observatory-host.test.mjs
    node --test tests/leiland-public.test.mjs tests/leiland-owned-pulse-publisher.test.mjs tests/leiland-owned-release-probe.test.mjs
    node systemia/leiland/owned-observatory-host.mjs

The host binds to 127.0.0.1:8795, **never 0.0.0.0**, and exposes a deliberately modest /healthz response. Its health states explicitly say external HTTPS and live model inference are NOT verified. The local hostname/port is not a customer URL.

The source code's test server uses an ephemeral local port and synthetic public data in a temporary directory. Passing those tests cannot establish any field deployment or real source attestation.

## Minimal node field canary (no approval, no publishing)

For a trusted Evercraft operator who has an **independently verified, pinned 40-character Git SHA**, a real checkout, and an existing separate local public-projection folder, use the narrowly read-only canary to test the source and its local transport before private source activation:

    node scripts/leiland-owned-field-canary.mjs \
      --checkout /verified/evercraft/forge-operator \
      --publication-root /verified/owned/public-projections \
      --expected-sha <independently-pinned-full-commit-sha>

The command starts a temporary ephemeral listener on 127.0.0.1, compares all allowlisted page assets against the actual pinned Git objects (not merely the current HEAD label), probes every public static route, checks that the pulse is missing or sanitized, checks the public activity feed, rejects unapproved write/private-source routes, closes its listener and emits a machine-readable **local-only** canary receipt. It does not create folders, alter DNS, edit Caddy, modify public files, request private Yard credentials, issue signatures, or start a resident service. If an approval/signature or a real signed private Yard heartbeat is not ready, this public-only local canary can still report the site and its disconnected state accurately.

A passing local canary does **not** mean that an operator has authorized publication, that the KAIDANCE source is trusted, or that the actual owned HTTPS route exists. After it passes, use the separate, stricter **scripts/leiland-field-preflight.mjs** for a real private source, signed approval, and existing authenticated KAIDANCE Yard pulse. The field preflight is the next gate and must not be bypassed by the canary.

## HTTPS edge integration

The staged example at systemia/leiland/owned-public-route.Caddyfile.example has a deliberately non-deployable example.invalid hostname. Do not import it until:
1. Confirm Evercraft control of the actual desired hostname, authoritative DNS, and the owned ingress machine.
2. Bind the service to an **existing** verified Yard/Compute DeploymentReceipt. Check the release commit, service identity, process/service permissions, and rollback.
3. Verify Caddy's current configuration, TLS issuance, ingress policies, and the route conflict check without overwriting other customer routes or exposing the private operator controls.
4. Use the existing Evercraft edge's authorized route lease/orchestration. Avoid creating a second router, changing DNS opportunistically, or assuming a working public hostname.
5. From a truly separate network/device, read back the exact assets and the source-approved pulse with scripts/probe-leiland-owned-release.mjs; test portrait broadcast on iPhone and stale-state behavior.

The public probe's final_public_launch_authorized flag intentionally remains false even after a byte-perfect readback. An operator must bind field authority, TLS, DNS and the real two-cycle evidence to an approved release receipt.

## Security acceptance

- The server exposes GET and HEAD only, disallows unauthorized paths, and does not expose source .mjs files outside the exact approved static list.
- No private directories, raw source pulses, mission payloads, model inference gateways, management or write endpoints are served.
- All JSON is no-store. CSP, nosniff, no-referrer, deny-framing and permissions restrictions are present.
- The dynamic pulse and activity feed are public-only publisher artifacts. **Before serving any dynamic JSON**, the host enforces the exact KAIDANCE field allowlist, schema and receipt constraints; for Leiland events it rejects fields outside the reviewed schema, unsafe evidence links and sensitive/redacted titles. Malformed/unapproved public records return HTTP 503 with no source content. Client and independent external readback validation remain additional controls.
- Structurally valid but expired KAIDANCE pulses remain readable as historical observations and must render as **stale**, not a new successful heartbeat. Fail-closed handling does not fabricate a replacement timestamp.
- The KAIDANCE pulse can be absent/stale without taking the static page offline. Private service health does not become a fake public heartbeat.
- Symlinks, unknown extensions, and arbitrary file paths are denied. No directory listing.
- For source upgrades, first run tests/QA, roll out a pinned source revision, repeat external probes, and retain a separately authorized rollback route and release receipt.

No public URL has been announced or independently verified by authoring this source.
